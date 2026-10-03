import { ADMIN_ROLE } from "~/auth/roles";
import type { AuthUser } from "~/auth/types";
import { DEMO_USER_EMAIL } from "./mode";

/**
 * `OVC_DEMO_MODE=true` (server-only, read at runtime - the same image serves
 * both modes). Imported only by server code: `auth/server.ts` handlers, the
 * `/frontend-api/api` proxy and the `/webrdp/tunnel` proxy - never by
 * client code.
 *
 * In demo mode the frontend runs standalone: the login screen shows, but
 * "Sign in" only opens a demo session (like OVC_AUTH_MODE=stub, no IdP is
 * contacted) as a fixed administrator; no ovc-backend, no guacd. The browser
 * serves every API call from the simulator in `src/demo/` and keeps the
 * state in localStorage.
 */

const ENABLED =
  typeof process !== "undefined" &&
  /^(1|true|yes|on)$/i.test(process.env.OVC_DEMO_MODE ?? "");

if (ENABLED) {
  console.warn(
    "[demo] OVC_DEMO_MODE active - no backend; the login screen opens a demo " +
      "session without any IdP. Every visitor is demo@ovc.demo (ADMINISTRATOR) " +
      "with simulated data kept in their own browser.",
  );
}

export const isDemoEnv = (): boolean => ENABLED;

/** Set by "Sign in" in demo mode (no IdP) - its presence is the session. */
export const DEMO_SESSION_COOKIE = "ovc-demo-session";

export const DEMO_USER: AuthUser = {
  id: "demo-admin",
  email: DEMO_USER_EMAIL,
  displayName: "Demo Administrator",
  roles: [ADMIN_ROLE],
};

/** The JSON body a server route answers with while demo mode is on. */
export function demoUnavailable(what: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "DEMO_MODE",
        message: `${what} is not available in demo mode`,
      },
    }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}
