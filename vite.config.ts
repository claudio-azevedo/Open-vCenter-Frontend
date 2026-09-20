import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // `loadEnv(mode, cwd, "")` pulls every key (no prefix filter) from .env*, so
  // WEBRDP_ORIGIN can live in .env.local; a real shell env var still wins.
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };

  // The app talks to ovc-webrdp same-origin under /webrdp - a cross-origin
  // tunnel needs credentialed CORS that ovc-webrdp doesn't send, and the
  // long-poll/websocket stalls (guacd then drops the session as "user not
  // responding"). Matches the single-domain reverse-proxy setup used in
  // production. Keep VITE_WEBRDP_URL=/webrdp so the client uses the relative
  // URL.
  //
  // WEBRDP_ORIGIN is the full base URL of the ovc-webrdp deployment, INCLUDING
  // its context path (e.g. http://host:8080/webrdp for WEBAPP_CONTEXT=webrdp).
  const webrdp = new URL(env.WEBRDP_ORIGIN || "http://localhost:8090/webrdp");
  const webrdpBase = webrdp.pathname.replace(/\/+$/, ""); // "" or "/webrdp"

  return {
    server: {
      port: 3000,
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      tailwindcss(),
      // Nitro bundles the built server into a single self-contained
      // dist/server/index.mjs (assets served straight from disk via
      // serveStatic) - matches weg-hyperv-manager-frontend's setup, and
      // avoids the separate srvx runtime dependency + its --static path
      // quirks (relative to the entry file's dir, not cwd).
      nitro({
        serveStatic: true,
        // Forwards /webrdp/tunnel to ovc-webrdp, server-to-server, baked into
        // the *built* server - so it never needs its own reverse-proxy/Ingress
        // rule in production. This is a build-only feature: `vite dev` doesn't
        // run it (Nitro's Vite plugin intercepts requests ahead of Vite's own
        // server.proxy too, so neither proxying mechanism reaches the tunnel
        // under `vite dev`). guacamole-common-js's HTTPTunnel needs a stable
        // long-poll GET/POST cycle, which doesn't survive Nitro's dev-only
        // `devProxy` shim either (confirmed: guacd sees the stream close mid-
        // handshake) - same conclusion as weg-hyperv-manager-frontend, which
        // also only wires this through routeRules. Test the console locally
        // via a production build (`npm run build && node .output/server/index.mjs`),
        // not `vite dev`.
        routeRules: {
          "/webrdp/tunnel": {
            proxy: { to: `${webrdp.origin}${webrdpBase}/tunnel` },
            headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
          },
        },
      }),
      tanstackStart({
        // This app's server-function (RPC) endpoints live under /frontend-api/* so a
        // reverse proxy can send /api/* to ovc-backend and everything else here,
        // with no path clash. See README "Deploying behind one domain".
        serverFns: { base: "/frontend-api/fn" },
      }),
      viteReact(),
    ],
  };
});
