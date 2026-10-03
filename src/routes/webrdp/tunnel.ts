import { createFileRoute } from "@tanstack/react-router";
import { getAccessToken } from "~/auth/token.server";
import { isDevBypass } from "~/auth/bypass";
import { demoUnavailable, isDemoEnv } from "~/demo/env";
import {
  GuacStatus,
  HYPERV_CONSOLE_PORT,
  RDP_PORT,
  TunnelError,
  getTunnel,
  openTunnel,
  type GuacdTunnel,
} from "~/guacd/tunnel.server";

/**
 * Guacamole HTTP tunnel, served by this server and connected straight to
 * guacd (`GUACD_URL`). The browser's `new Guacamole.HTTPTunnel(VITE_WEBRDP_URL + "/tunnel")` (default
 * "/webrdp") calls it with one of three literal query strings, the same
 * contract as Guacamole's GuacamoleHTTPTunnelServlet:
 *
 * - `POST ?connect` - body is the urlencoded connection parameters. Needs a
 *   signed-in session. Opens a guacd connection and answers with the tunnel
 *   UUID plus a `Guacamole-Tunnel-Token` header.
 * - `GET ?read:<uuid>:<n>` - streams guacd's instructions. The response stays
 *   open until the next read request arrives, then ends with `0.;`.
 * - `POST ?write:<uuid>` - body is instructions forwarded to guacd.
 *
 * read/write are authorised by the tunnel token (256 random bits) rather than
 * the session: the browser writes a `nop` every 500 ms, too often to
 * re-validate the OIDC session each time.
 */

const TOKEN_HEADER = "Guacamole-Tunnel-Token";
const END_OF_RESPONSE = new TextEncoder().encode("0.;");
const HOSTNAME_RE = /^[A-Za-z0-9.\-:[\]]{1,253}$/;

function tunnelError(err: TunnelError): Response {
  return new Response(null, {
    status: err.status.http,
    headers: {
      "Cache-Control": "no-cache",
      "Guacamole-Status-Code": String(err.status.code),
      // Header values must be printable ASCII
      "Guacamole-Error-Message": err.message.replace(/[^\x20-\x7e]/g, "?"),
    },
  });
}

async function connect(request: Request): Promise<Response> {
  if (request.method !== "POST")
    throw new TunnelError(GuacStatus.CLIENT_BAD_REQUEST, "connect needs POST");
  if (!isDevBypass() && !(await getAccessToken()))
    throw new TunnelError(GuacStatus.CLIENT_UNAUTHORIZED, "No valid session");

  const p = new URLSearchParams(await request.text());
  const get = (name: string) => p.get(name) || undefined;
  const hostname = get("hostname");
  const port = get("port") ?? RDP_PORT;
  if (!hostname || !HOSTNAME_RE.test(hostname))
    throw new TunnelError(GuacStatus.CLIENT_BAD_REQUEST, "Invalid hostname");
  // Only the two consoles the app offers: Hyper-V vmconnect and host RDP
  if (port !== HYPERV_CONSOLE_PORT && port !== RDP_PORT)
    throw new TunnelError(GuacStatus.CLIENT_BAD_REQUEST, "Invalid port");

  const tunnel = await openTunnel({
    hostname,
    port,
    username: get("username"),
    password: get("password"),
    domain: get("domain"),
    security: get("security"),
    vmGuid: get("vm-guid"),
    width: get("width"),
    height: get("height"),
  });

  return new Response(tunnel.uuid, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-cache",
      [TOKEN_HEADER]: tunnel.token,
    },
  });
}

/** The tunnel this read/write request addresses (`<op>:<uuid>[:<n>]`). */
function tunnelFor(request: Request, query: string): GuacdTunnel {
  const token = request.headers.get(TOKEN_HEADER);
  if (!token)
    throw new TunnelError(
      GuacStatus.CLIENT_BAD_REQUEST,
      "The HTTP tunnel session token is required for all requests after connecting.",
    );
  const uuid = query.split(":")[1];
  const tunnel = getTunnel(token);
  if (!tunnel || tunnel.uuid !== uuid)
    throw new TunnelError(GuacStatus.RESOURCE_NOT_FOUND, "No such tunnel.");
  return tunnel;
}

function read(tunnel: GuacdTunnel): Response {
  let release: (() => void) | null = null;
  let done = false;

  const finish = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    done = true;
    controller.enqueue(END_OF_RESPONSE);
    controller.close();
    release?.();
  };

  const body = new ReadableStream<Uint8Array>({
    async start() {
      release = await tunnel.acquireReader();
      if (done) release();
    },
    async pull(controller) {
      const chunk = await tunnel.nextChunk();
      if (done) return;
      // guacd gone: end this response; the next read gets "No such tunnel",
      // which the client takes as end of stream
      if (chunk === null) return finish(controller);
      controller.enqueue(chunk);
      if (tunnel.hasQueuedReaders()) finish(controller);
    },
    cancel() {
      // The browser dropped the response mid-stream (tab closed, network)
      done = true;
      release?.();
      tunnel.close();
    },
  });

  return new Response(body, {
    headers: {
      // Not text/*: WebKit buffers 1 KiB of text before streaming it
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-cache",
    },
  });
}

async function write(request: Request, tunnel: GuacdTunnel): Promise<Response> {
  await tunnel.write(new Uint8Array(await request.arrayBuffer()));
  return new Response(null, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-cache",
    },
  });
}

async function handle(request: Request): Promise<Response> {
  // Demo mode has no guacd (the console panels say so before connecting).
  if (isDemoEnv()) return demoUnavailable("The remote console");
  const query = new URL(request.url).search.slice(1);
  try {
    if (query === "connect") return await connect(request);
    if (query.startsWith("read:")) return read(tunnelFor(request, query));
    if (query.startsWith("write:"))
      return await write(request, tunnelFor(request, query));
    throw new TunnelError(GuacStatus.CLIENT_BAD_REQUEST, "Invalid tunnel operation");
  } catch (e) {
    if (e instanceof TunnelError) return tunnelError(e);
    console.error("[guacd] tunnel request failed", e);
    return tunnelError(
      new TunnelError(GuacStatus.SERVER_ERROR, "Internal server error."),
    );
  }
}

export const Route = createFileRoute("/webrdp/tunnel")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
