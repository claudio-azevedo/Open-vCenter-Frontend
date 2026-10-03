import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// package.json's version (bumped by `npm version`, see README "Releasing"),
// shown in the About dialog.
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
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
    }),
    tanstackStart({
      // This app's server-function (RPC) endpoints live under /frontend-api/* so a
      // reverse proxy can send /api/* to ovc-backend and everything else here,
      // with no path clash. See README "Deploying behind one domain".
      serverFns: { base: "/frontend-api/fn" },
    }),
    viteReact(),
  ],
});
