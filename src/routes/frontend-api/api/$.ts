import { createFileRoute } from "@tanstack/react-router";
import { getAccessToken } from "~/auth/token.server";
import { isDevBypass } from "~/auth/bypass";

/**
 * Server-side reverse proxy to ovc-backend's REST API. The browser calls
 * `/frontend-api/api/*` (relative, carrying the session cookie); this handler
 * swaps the cookie for the OIDC bearer token and forwards to the backend.
 * The access token is never exposed to the browser.
 *
 * Point the API client at it with VITE_API_URL=/frontend-api/api (dev: the
 * absolute origin, e.g. http://localhost:3000/frontend-api/api).
 */

const PREFIX = "/frontend-api/api";

function backendBase(): string {
  const base = process.env.API_URL;
  if (!base)
    throw new Error(
      "API_URL is not set (base URL of ovc-backend, e.g. http://localhost:8000/api)",
    );
  return base.replace(/\/$/, "");
}

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function proxy(request: Request): Promise<Response> {
  // Dev bypass: forward with no bearer - ovc-backend must run OVC_AUTH_MODE=stub.
  const token = isDevBypass() ? null : await getAccessToken();
  if (!token && !isDevBypass()) {
    return jsonError(401, "UNAUTHORIZED", "No valid session");
  }

  const incoming = new URL(request.url);
  const path = incoming.pathname.slice(PREFIX.length) || "/";
  const target = `${backendBase()}${path}${incoming.search}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const hasBody = !["GET", "HEAD"].includes(request.method);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
  } catch {
    return jsonError(502, "NETWORK", "ovc-backend unreachable");
  }

  const out = new Headers();
  for (const h of ["content-type", "content-disposition", "content-length"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const Route = createFileRoute("/frontend-api/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxy(request),
      POST: ({ request }) => proxy(request),
      PUT: ({ request }) => proxy(request),
      PATCH: ({ request }) => proxy(request),
      DELETE: ({ request }) => proxy(request),
    },
  },
});
