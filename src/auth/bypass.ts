import { ADMIN_ROLE } from "./roles";
import type { AuthUser } from "./types";

/**
 * No-auth bypass. When `OVC_AUTH_MODE=stub`, every request is treated as a
 * fixed `ADMINISTRATOR` user and no OIDC provider is contacted. Server-only -
 * imported by `server.ts`, `token.server.ts` and the `/frontend-api/api`
 * proxy, never by client code.
 *
 * Same variable, same value as ovc-backend's `OVC_AUTH_MODE` - set it to
 * `stub` on both and neither side needs an IdP. Works in every build,
 * including the published `production` image - it's an operator choice, not
 * a dev-only escape hatch. The UI surfaces it with a standing warning dialog
 * (see `DevBypassWarning`) so it can't go unnoticed.
 */

const ENABLED = process.env.OVC_AUTH_MODE === "stub";

if (ENABLED) {
  console.warn(
    "[auth] ⚠  OVC_AUTH_MODE=stub active - every request is admin@ovc.debug.app " +
      "(ADMINISTRATOR), no login required. Anyone who can reach this instance " +
      "has full access.",
  );
}

export const isDevBypass = (): boolean => ENABLED;

export const DEV_BYPASS_USER: AuthUser = {
  id: "debug-admin",
  email: "admin@ovc.debug.app",
  displayName: "Debug Admin",
  roles: [ADMIN_ROLE],
};
