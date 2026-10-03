import net from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import {
  InstructionSplitter,
  decodeInstructions,
  encodeInstruction,
} from "./protocol.server";

/**
 * guacd connections behind the Guacamole HTTP tunnel served by
 * `src/routes/webrdp/tunnel.ts`. Server-only: this process speaks the
 * Guacamole protocol to guacd directly.
 *
 * A tunnel is one TCP connection to guacd, configured for one RDP / Hyper-V
 * vmconnect session, and lives in an in-memory registry keyed by its tunnel
 * token. That state is per process: running more than one frontend replica
 * needs sticky sessions.
 */

const GUACD_DEFAULT_HOST = "localhost";
const GUACD_DEFAULT_PORT = 4822;
/** Budget for TCP connect + the whole guacd handshake. */
const HANDSHAKE_TIMEOUT_MS = 15_000;
/**
 * A tunnel nobody has read from or written to for this long is closed. The
 * browser writes a `nop` every 500 ms while connected, so only abandoned
 * tunnels (tab closed, network gone) ever reach it. Same as Guacamole's
 * GuacamoleHTTPTunnelMap.
 */
const TUNNEL_IDLE_TIMEOUT_MS = 15_000;
const SWEEP_INTERVAL_MS = 5_000;

/** Newest Guacamole protocol version this tunnel speaks. */
const PROTOCOL_VERSION: Version = [1, 5, 0];

export const HYPERV_CONSOLE_PORT = "2179";
export const RDP_PORT = "3389";

/** Guacamole status codes (and their HTTP status) the tunnel reports. */
export const GuacStatus = {
  SERVER_ERROR: { code: 0x0200, http: 500 },
  UPSTREAM_TIMEOUT: { code: 0x0202, http: 504 },
  UPSTREAM_ERROR: { code: 0x0203, http: 502 },
  RESOURCE_NOT_FOUND: { code: 0x0204, http: 404 },
  UPSTREAM_NOT_FOUND: { code: 0x0207, http: 502 },
  CLIENT_BAD_REQUEST: { code: 0x0300, http: 400 },
  CLIENT_UNAUTHORIZED: { code: 0x0301, http: 403 },
} as const;
type GuacStatusValue = (typeof GuacStatus)[keyof typeof GuacStatus];

export class TunnelError extends Error {
  constructor(
    readonly status: GuacStatusValue,
    message: string,
  ) {
    super(message);
  }
}

/** Connection parameters the browser may choose. Everything else is fixed. */
export interface RdpTarget {
  hostname: string;
  port: string;
  username?: string;
  password?: string;
  domain?: string;
  security?: string;
  /** Hyper-V VM GUID - the vmconnect preconnection blob. */
  vmGuid?: string;
  width?: string;
  height?: string;
}

/**
 * guacd RDP parameters for a target. Audio, drive redirection / file
 * transfer and printing are always off, whatever the browser sends.
 */
function rdpParameters(t: RdpTarget): Record<string, string> {
  const params: Record<string, string> = {
    hostname: t.hostname,
    port: t.port,
    "ignore-cert": "true",
    "cert-tofu": "true",

    "disable-audio": "true",
    "enable-audio-input": "false",
    "enable-drive": "false",
    "disable-upload": "true",
    "disable-download": "true",
    "enable-printing": "false",

    "enable-wallpaper": "false",
    "enable-theming": "false",
    "enable-font-smoothing": "true",
  };
  if (t.username) params.username = t.username;
  if (t.password) params.password = t.password;
  if (t.domain) params.domain = t.domain;
  if (t.vmGuid) params["preconnection-blob"] = t.vmGuid;
  if (t.width) params.width = t.width;
  if (t.height) params.height = t.height;

  if (t.port === HYPERV_CONSOLE_PORT) {
    // guacd 1.6's dedicated Hyper-V console mode; the GUID above selects the VM
    params.security = "vmconnect";
  } else {
    params.security = t.security || "nla";
    params["color-depth"] = "24";
  }
  return params;
}

type Version = [number, number, number];

function parseVersion(arg: string): Version | null {
  const m = /^VERSION_(\d+)_(\d+)_(\d+)$/.exec(arg);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function olderVersion(a: Version, b: Version): Version {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? a : b;
  return a;
}

/** HTTP status for a Guacamole status code received from guacd. */
function statusFromCode(code: number): GuacStatusValue {
  return (
    Object.values(GuacStatus).find((s) => s.code === code) ??
    GuacStatus.UPSTREAM_ERROR
  );
}

export class GuacdTunnel {
  readonly uuid = randomUUID();
  readonly token = randomBytes(32).toString("base64url");
  private lastAccess = Date.now();
  private closed = false;
  /** Complete instructions from guacd not yet handed to a reader. */
  private chunks: Buffer[] = [];
  private wake: (() => void) | null = null;
  private readerLock: Promise<void> = Promise.resolve();
  private queuedReaders = 0;

  constructor(
    private readonly socket: net.Socket,
    private readonly label: string,
  ) {}

  touch(): void {
    this.lastAccess = Date.now();
  }

  idleFor(now: number): number {
    return now - this.lastAccess;
  }

  /** Switches the socket from handshake to streaming. */
  start(splitter: InstructionSplitter, leftover: Buffer): void {
    if (leftover.length > 0) this.chunks.push(leftover);
    this.socket.on("data", (chunk: Buffer) => {
      let out: Buffer;
      try {
        out = splitter.push(chunk);
      } catch (e) {
        console.warn(`[guacd] tunnel ${this.uuid}: ${(e as Error).message}`);
        this.close();
        return;
      }
      if (out.length > 0) {
        this.chunks.push(out);
        this.notify();
      }
    });
    this.socket.on("close", () => this.close());
    this.socket.on("error", () => this.close());
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  /**
   * Everything guacd has sent since the last call (whole instructions only),
   * waiting for data if there is none. Null once the tunnel is closed and
   * drained.
   */
  async nextChunk(): Promise<Buffer | null> {
    while (this.chunks.length === 0) {
      if (this.closed) return null;
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
    const out =
      this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
    this.chunks = [];
    return out;
  }

  /**
   * Exclusive read access, in request order. guacamole-common-js keeps up to
   * two read requests in flight; the active one hands over (ends its
   * response) as soon as another is queued.
   */
  acquireReader(): Promise<() => void> {
    this.queuedReaders++;
    const previous = this.readerLock;
    let unlock!: () => void;
    this.readerLock = new Promise<void>((resolve) => (unlock = resolve));
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      unlock();
    };
    return previous.then(() => {
      this.queuedReaders--;
      return release;
    });
  }

  hasQueuedReaders(): boolean {
    return this.queuedReaders > 0;
  }

  /** Forwards browser instructions to guacd as-is. */
  write(data: Uint8Array): Promise<void> {
    if (this.closed)
      return Promise.reject(
        new TunnelError(GuacStatus.RESOURCE_NOT_FOUND, "Tunnel is closed."),
      );
    return new Promise((resolve, reject) =>
      this.socket.write(data, (err) =>
        err
          ? reject(new TunnelError(GuacStatus.UPSTREAM_ERROR, err.message))
          : resolve(),
      ),
    );
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    tunnels.delete(this.token);
    this.socket.destroy();
    this.notify();
    console.info(`[guacd] tunnel ${this.uuid} closed (${this.label})`);
  }
}

// Registry. Kept on globalThis so a dev-server module reload doesn't orphan
// live sockets.
const registry = globalThis as typeof globalThis & {
  __ovcGuacdTunnels?: Map<string, GuacdTunnel>;
  __ovcGuacdSweeper?: NodeJS.Timeout;
};
const tunnels = (registry.__ovcGuacdTunnels ??= new Map());
registry.__ovcGuacdSweeper ??= setInterval(() => {
  const now = Date.now();
  for (const t of tunnels.values())
    if (t.idleFor(now) > TUNNEL_IDLE_TIMEOUT_MS) t.close();
}, SWEEP_INTERVAL_MS).unref();

/** The open tunnel for a token (marking it used), or null. */
export function getTunnel(token: string): GuacdTunnel | null {
  const t = tunnels.get(token) ?? null;
  t?.touch();
  return t;
}

/**
 * guacd's address from `GUACD_URL`: `host:port`, or any `scheme://host:port`
 * (`tcp://`, `http://`, ...). guacd speaks raw TCP, so the scheme is ignored;
 * a missing port means 4822.
 */
function guacdAddress(): { host: string; port: number } {
  const raw =
    process.env.GUACD_URL?.trim() || `${GUACD_DEFAULT_HOST}:${GUACD_DEFAULT_PORT}`;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `tcp://${raw}`);
  } catch {
    throw new TunnelError(GuacStatus.SERVER_ERROR, "GUACD_URL is invalid");
  }
  if (!url.hostname)
    throw new TunnelError(GuacStatus.SERVER_ERROR, "GUACD_URL has no host");
  return {
    host: url.hostname.replace(/^\[(.*)\]$/, "$1"), // IPv6 literal without brackets
    port: url.port ? Number(url.port) : GUACD_DEFAULT_PORT,
  };
}

/**
 * Connects to guacd, runs the Guacamole handshake for `target` and registers
 * the resulting tunnel. Rejects with a TunnelError on any failure.
 */
export async function openTunnel(target: RdpTarget): Promise<GuacdTunnel> {
  const guacd = guacdAddress();
  const label = `${target.hostname}:${target.port} via guacd ${guacd.host}:${guacd.port}`;
  const socket = net.connect(guacd);
  socket.setNoDelay(true);

  const splitter = new InstructionSplitter();
  const inbox: string[][] = [];
  let failure: TunnelError | null = null;
  let wake: (() => void) | null = null;
  const signal = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  const fail = (err: TunnelError) => {
    failure ??= err;
    signal();
  };

  const onData = (chunk: Buffer) => {
    try {
      const out = splitter.push(chunk);
      if (out.length > 0) inbox.push(...decodeInstructions(out));
      signal();
    } catch (e) {
      fail(new TunnelError(GuacStatus.UPSTREAM_ERROR, (e as Error).message));
    }
  };
  const onError = (err: NodeJS.ErrnoException) =>
    fail(
      err.code === "ECONNREFUSED" || err.code === "ENOTFOUND"
        ? new TunnelError(GuacStatus.UPSTREAM_NOT_FOUND, "guacd unreachable")
        : new TunnelError(GuacStatus.UPSTREAM_ERROR, err.message),
    );
  const onClose = () =>
    fail(new TunnelError(GuacStatus.UPSTREAM_ERROR, "guacd closed the connection"));
  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);
  const timer = setTimeout(
    () => fail(new TunnelError(GuacStatus.UPSTREAM_TIMEOUT, "guacd handshake timed out")),
    HANDSHAKE_TIMEOUT_MS,
  );

  const expect = async (opcode: string): Promise<string[]> => {
    for (;;) {
      if (failure) throw failure;
      const next = inbox.shift();
      if (next) {
        const [op, ...args] = next;
        if (op === "error")
          throw new TunnelError(
            statusFromCode(Number(args[1])),
            args[0] || "guacd error",
          );
        if (op === "disconnect")
          throw new TunnelError(GuacStatus.UPSTREAM_ERROR, "guacd disconnected");
        if (op !== opcode)
          throw new TunnelError(
            GuacStatus.SERVER_ERROR,
            `Expected "${opcode}" from guacd, got "${op}"`,
          );
        return args;
      }
      await new Promise<void>((resolve) => (wake = resolve));
    }
  };
  const send = (...elements: string[]) =>
    socket.write(encodeInstruction(...elements));

  try {
    send("select", "rdp");
    const argNames = await expect("args");

    // First arg is guacd's protocol version (1.1+); answer with the older of
    // the two. The rest are parameter names, answered in the same order.
    const params = rdpParameters(target);
    const argValues = argNames.map((name, i) => {
      const version = i === 0 ? parseVersion(name) : null;
      if (version) return `VERSION_${olderVersion(version, PROTOCOL_VERSION).join("_")}`;
      return params[name] ?? "";
    });

    send("size", target.width || "1024", target.height || "768", "96");
    send("audio"); // no audio mimetypes: guacd streams no sound
    send("video");
    send("image");
    send("connect", ...argValues);
    await expect("ready");
  } catch (e) {
    socket.on("error", () => {}); // late socket errors must not crash the process
    socket.destroy();
    const err =
      e instanceof TunnelError
        ? e
        : new TunnelError(GuacStatus.SERVER_ERROR, (e as Error).message);
    console.warn(`[guacd] handshake failed (${label}): ${err.message}`);
    throw err;
  } finally {
    clearTimeout(timer);
    socket.off("data", onData);
    socket.off("error", onError);
    socket.off("close", onClose);
  }

  // Instructions that arrived in the same read as "ready" belong to the
  // session. Re-encoding is lossless: guacd's encoding is canonical.
  const leftover = Buffer.from(
    inbox.map((elements) => encodeInstruction(...elements)).join(""),
  );
  const tunnel = new GuacdTunnel(socket, label);
  tunnel.start(splitter, leftover);
  tunnels.set(tunnel.token, tunnel);
  console.info(`[guacd] tunnel ${tunnel.uuid} opened (${label})`);
  return tunnel;
}
