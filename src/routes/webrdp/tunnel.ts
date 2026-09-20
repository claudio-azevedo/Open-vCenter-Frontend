import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-side reverse proxy to ovc-webrdp's Guacamole HTTP tunnel. The
 * browser's Guacamole client (`new Guacamole.HTTPTunnel(VITE_WEBRDP_URL +
 * "/tunnel")`, default VITE_WEBRDP_URL "/webrdp") calls this path directly,
 * same-origin; this handler forwards to the real ovc-webrdp origin at
 * request time via WEBRDP_ORIGIN - unlike the Nitro `routeRules` proxy this
 * replaces, that base URL is a normal runtime env var (like API_URL), not
 * baked into the image at build time.
 *
 * guacamole-common-js's HTTPTunnel only ever calls this exact path with one
 * of three literal (non key=value) query strings - "?connect", "?read:
 * <uuid>:<id>", "?write:<uuid>" - never a sub-path, so there's no catch-all
 * route segment here. "read" is a long poll guacd can hold open and flush
 * progressively as data arrives; the response body is streamed straight
 * through (never buffered into memory) to preserve that, the same technique
 * ../frontend-api/api/$.ts already uses for its own upstream responses.
 */

const TOKEN_HEADER = "guacamole-tunnel-token";

function webrdpBase(): string {
  const base = process.env.WEBRDP_ORIGIN;
  if (!base)
    throw new Error(
      "WEBRDP_ORIGIN is not set (base URL of ovc-webrdp, e.g. http://localhost:8090/webrdp)",
    );
  return base.replace(/\/$/, "");
}

async function proxy(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${webrdpBase()}/tunnel${incoming.search}`;

  const headers: Record<string, string> = {};
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;
  const token = request.headers.get(TOKEN_HEADER);
  if (token) headers["Guacamole-Tunnel-Token"] = token;

  const hasBody = request.method === "POST";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
  } catch {
    return new Response("ovc-webrdp unreachable", { status: 502 });
  }

  // Guacamole-Tunnel-Token comes back on a successful "connect"; the error
  // pair comes back instead of a body on a failed request - both are read
  // directly off the response by guacamole-common-js, so both must survive
  // the proxy hop.
  const out = new Headers();
  for (const h of [
    "content-type",
    "guacamole-tunnel-token",
    "guacamole-status-code",
    "guacamole-error-message",
  ]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const Route = createFileRoute("/webrdp/tunnel")({
  server: {
    handlers: {
      GET: ({ request }) => proxy(request),
      POST: ({ request }) => proxy(request),
    },
  },
});
