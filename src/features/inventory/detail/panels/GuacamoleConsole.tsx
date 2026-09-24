import * as React from "react";
import {
  Clipboard as ClipboardIcon,
  Keyboard as KeyboardIcon,
  Maximize2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import type * as Guacamole from "guacamole-common-js";
import {
  Button,
  StatusBar,
  StatusBarPanel,
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
} from "~/components/win95";

type ConnState = "connecting" | "connected" | "disconnected" | "error";

export interface GuacamoleConsoleProps {
  /** Base URL of the Guacamole HTTP tunnel servlet (…/tunnel). */
  tunnelUrl: string;
  hostname: string;
  /** 2179 for the Hyper-V vmconnect (VM) console; 3389 for a host RDP console. */
  port: string;
  /** Hyper-V VM GUID - the vmconnect preconnection-blob. Omit for a host console. */
  vmGuid?: string;
  /** RDP security mode. Default "vmconnect" (VM console); use "any"/"nla" for a host. */
  security?: string;
  /** Label shown in the status bar (VM name, or host name for a host console). */
  vmName: string;
  username: string;
  password: string;
  /** Back to the credentials form. */
  onExit: () => void;
  /**
   * VM-specific controls (power, DVD) rendered at the head of the toolbar,
   * before the connection buttons. Lets the operator drive the VM without
   * leaving the console - same as the standalone (new-tab) console.
   */
  toolbarExtra?: React.ReactNode;
}

const STATE_LABEL: Record<ConnState, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
};
const STATE_DOT: Record<ConnState, string> = {
  connecting: "bg-[#808000]",
  connected: "bg-success",
  disconnected: "bg-[#808080]",
  error: "bg-[#800000]",
};

export function GuacamoleConsole({
  tunnelUrl,
  hostname,
  port,
  vmGuid,
  security = "vmconnect",
  vmName,
  username,
  password,
  onExit,
  toolbarExtra,
}: GuacamoleConsoleProps) {
  const displayRef = React.useRef<HTMLDivElement>(null);
  const clientRef = React.useRef<Guacamole.Client | null>(null);
  const keyboardRef = React.useRef<Guacamole.Keyboard | null>(null);

  const [connState, setConnState] = React.useState<ConnState>("connecting");
  const [statusText, setStatusText] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [showClipboard, setShowClipboard] = React.useState(false);
  const [clipboardText, setClipboardText] = React.useState("");

  // (re)connect whenever `attempt` changes
  React.useEffect(() => {
    let cancelled = false;
    const container = displayRef.current;
    if (!container) return;

    setConnState("connecting");
    setStatusText("Connecting…");

    let client: Guacamole.Client | null = null;
    let keyboard: Guacamole.Keyboard | null = null;
    let onWindowResize: (() => void) | null = null;

    void (async () => {
      // CJS interop: some bundlers nest the namespace under `.default`
      const mod = await import("guacamole-common-js");
      const G: typeof import("guacamole-common-js") =
        (mod as { default?: typeof import("guacamole-common-js") }).default ??
        mod;
      if (cancelled || !displayRef.current) return;

      const width = Math.max(container.offsetWidth, 640);
      const height = Math.max(container.offsetHeight, 480);
      const query = new URLSearchParams({
        hostname,
        port,
        security,
        width: String(width),
        height: String(height),
      });
      if (vmGuid) query.set("vm-guid", vmGuid);
      if (username) query.set("username", username);
      if (password) query.set("password", password);

      // Cross-origin when VITE_WEBRDP_URL points at another origin (split-origin
      // dev). ovc-webrdp's ResponseHeaderFilter serves the CORS headers.
      const crossDomain =
        /^https?:\/\//i.test(tunnelUrl) &&
        !tunnelUrl.startsWith(window.location.origin);
      const tunnel = new G.HTTPTunnel(tunnelUrl, crossDomain);
      tunnel.onerror = (status: Guacamole.Status) => {
        setStatusText(
          `Tunnel error: ${status.message || `code ${status.code}`}`,
        );
        setConnState("error");
      };

      client = new G.Client(tunnel);
      clientRef.current = client;

      const displayEl = client.getDisplay().getElement();
      container.replaceChildren(displayEl);

      client.onstatechange = (state: Guacamole.Client.State) => {
        // 0 idle 1 connecting 2 waiting 3 connected 4 disconnecting 5 disconnected
        if (state === 3) {
          setConnState("connected");
          setStatusText("Connected");
        } else if (state === 5) {
          setConnState("disconnected");
          setStatusText("Disconnected");
        } else if (state === 1 || state === 2) {
          setConnState("connecting");
        }
      };
      client.onerror = (error: Guacamole.Status) => {
        setStatusText(`Error: ${error.message || `code ${error.code}`}`);
        setConnState("error");
      };
      client.onclipboard = (
        stream: Guacamole.InputStream,
        mimetype: string,
      ) => {
        if (mimetype !== "text/plain") return;
        const reader = new G.StringReader(stream);
        let data = "";
        reader.ontext = (text: string) => {
          data += text;
        };
        reader.onend = () => setClipboardText(data);
      };

      client.connect(query.toString());

      // --- input ---
      const mouse = new G.Mouse(displayEl);
      mouse.onEach(
        ["mousedown", "mouseup", "mousemove"],
        (e: Guacamole.Event) => {
          client?.sendMouseState((e as Guacamole.Mouse.Event).state);
        },
      );

      keyboard = new G.Keyboard(displayEl);
      keyboardRef.current = keyboard;
      keyboard.onkeydown = (keysym: number) => client?.sendKeyEvent(1, keysym);
      keyboard.onkeyup = (keysym: number) => client?.sendKeyEvent(0, keysym);

      displayEl.setAttribute("tabindex", "0");
      displayEl.style.outline = "none";
      displayEl.addEventListener("mousedown", () => displayEl.focus());

      const fit = () => {
        const c = clientRef.current;
        if (!c || !displayRef.current) return;
        const d = c.getDisplay();
        if (d.getWidth() <= 0 || d.getHeight() <= 0) return;
        const box = displayRef.current;
        if (box.offsetWidth <= 0 || box.offsetHeight <= 0) return;
        d.scale(
          Math.min(
            box.offsetWidth / d.getWidth(),
            box.offsetHeight / d.getHeight(),
          ),
        );
      };
      client.getDisplay().onresize = () => setTimeout(fit, 50);
      onWindowResize = fit;
      window.addEventListener("resize", onWindowResize);
      setTimeout(() => displayEl.focus(), 300);
    })();

    return () => {
      cancelled = true;
      if (onWindowResize) window.removeEventListener("resize", onWindowResize);
      try {
        client?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        keyboard?.reset();
      } catch {
        /* ignore */
      }
      clientRef.current = null;
      keyboardRef.current = null;
      container?.replaceChildren();
    };
  }, [
    attempt,
    tunnelUrl,
    hostname,
    port,
    vmGuid,
    security,
    username,
    password,
  ]);

  const reconnect = () => setAttempt((n) => n + 1);

  const disconnect = () => {
    try {
      clientRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    setConnState("disconnected");
  };

  const sendCtrlAltDel = () => {
    const c = clientRef.current;
    if (!c) return;
    for (const k of [0xffe3, 0xffe9, 0xffff]) c.sendKeyEvent(1, k);
    for (const k of [0xffff, 0xffe9, 0xffe3]) c.sendKeyEvent(0, k);
  };

  const toggleFullscreen = () => {
    const el = displayRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const sendClipboard = async () => {
    const c = clientRef.current;
    if (!c || !clipboardText) return;
    const mod = await import("guacamole-common-js");
    const G: typeof import("guacamole-common-js") =
      (mod as { default?: typeof import("guacamole-common-js") }).default ??
      mod;
    const stream = c.createClipboardStream("text/plain");
    const writer = new G.StringWriter(stream);
    writer.sendText(clipboardText);
    writer.sendEnd();
  };

  const typeClipboard = () => {
    const c = clientRef.current;
    if (!c || !clipboardText) return;
    let i = 0;
    const next = () => {
      if (i >= clipboardText.length || !clientRef.current) return;
      const ch = clipboardText[i];
      const code = ch.charCodeAt(0);
      const keysym =
        ch === "\n" || ch === "\r"
          ? 0xff0d
          : ch === "\t"
            ? 0xff09
            : code <= 0xff
              ? code
              : 0x01000000 + code;
      c.sendKeyEvent(1, keysym);
      c.sendKeyEvent(0, keysym);
      i += 1;
      setTimeout(next, 30);
    };
    next();
    setShowClipboard(false);
  };

  const live = connState === "connected";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar>
        {toolbarExtra ? (
          <>
            {toolbarExtra}
            <ToolbarSeparator />
          </>
        ) : null}
        <ToolbarButton
          icon={Unplug}
          label="Disconnect"
          showLabel
          onClick={disconnect}
          disabled={connState === "disconnected"}
        />
        <ToolbarButton
          icon={RefreshCw}
          label="Reconnect"
          showLabel
          onClick={reconnect}
        />
        <ToolbarSeparator />
        <ToolbarButton
          icon={ClipboardIcon}
          label="Clipboard"
          showLabel
          active={showClipboard}
          onClick={() => setShowClipboard((s) => !s)}
          disabled={!live}
        />
        <ToolbarButton
          icon={KeyboardIcon}
          label="Ctrl+Alt+Del"
          showLabel
          onClick={sendCtrlAltDel}
          disabled={!live}
        />
        <ToolbarButton
          icon={Maximize2}
          label="Fullscreen"
          onClick={toggleFullscreen}
        />
      </Toolbar>

      {showClipboard ? (
        <div className="bevel-thin-raised flex items-start gap-2 bg-surface p-2">
          <textarea
            className="ui-field h-16 flex-1 resize-none px-1.5 py-1 font-mono text-base outline-none"
            placeholder="Paste text to push to the remote clipboard, or copy from the remote…"
            value={clipboardText}
            onChange={(e) => setClipboardText(e.target.value)}
          />
          <div className="flex shrink-0 flex-col gap-1">
            <Button
              className="px-2"
              onClick={sendClipboard}
              disabled={!clipboardText || !live}
            >
              Send to clipboard
            </Button>
            <Button
              className="px-2"
              onClick={typeClipboard}
              disabled={!clipboardText || !live}
            >
              Type text
            </Button>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-black">
        <div
          ref={displayRef}
          className="bevel-sunken flex h-full w-full items-center justify-center overflow-hidden"
          style={{ cursor: live ? "none" : "default" }}
        />

        {connState === "connecting" ? (
          <Overlay>
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <p>Connecting to {hostname}…</p>
          </Overlay>
        ) : null}
        {connState === "disconnected" ? (
          <Overlay>
            <p className="mb-2 text-base">Disconnected</p>
            <OverlayButton onClick={reconnect}>Reconnect</OverlayButton>
          </Overlay>
        ) : null}
        {connState === "error" ? (
          <Overlay>
            <p className="mb-1 text-[#ff8080]">Connection error</p>
            <p className="mb-3 max-w-sm text-[#c0c0c0]">{statusText}</p>
            <OverlayButton onClick={reconnect}>Retry</OverlayButton>
          </Overlay>
        ) : null}
      </div>

      <StatusBar>
        <StatusBarPanel>
          <span
            className={`inline-block h-2 w-2 rounded-full ${STATE_DOT[connState]}`}
          />
          {STATE_LABEL[connState]}
        </StatusBarPanel>
        <StatusBarPanel grow>
          {vmName} @ {hostname}
        </StatusBarPanel>
        <StatusBarPanel>
          <button type="button" className="underline" onClick={onExit}>
            Credentials
          </button>
        </StatusBarPanel>
      </StatusBar>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 text-center text-white">
      <div>{children}</div>
    </div>
  );
}

function OverlayButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick}>{children}</Button>
  );
}
