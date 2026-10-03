import type { VmState } from "~/api/types";

/**
 * Shared console URLs.
 *
 * `WEBRDP_BASE` - path prefix of the Guacamole HTTP tunnel, which lives at
 * `${base}/tunnel` on this app's own server (`src/routes/webrdp/tunnel.ts`,
 * connected straight to guacd). Default "/webrdp".
 */
export const WEBRDP_BASE = (
  import.meta.env.VITE_WEBRDP_URL ?? "/webrdp"
).replace(/\/+$/, "");

/** Guacamole HTTP tunnel endpoint used by the console (embedded and standalone). */
export const TUNNEL_URL = `${WEBRDP_BASE}/tunnel`;

/**
 * In-app standalone console route (opens in its own browser tab). Same UI as the
 * embedded Console tab - credentials form, Guacamole session, and the VM
 * power/DVD toolbar - so the operator can keep a console open while working on
 * other VMs. See `src/routes/_authed/console.tsx`.
 */
export function vmConsoleTabUrl(vmId: string): string {
  return `/console?vm=${encodeURIComponent(vmId)}`;
}

/**
 * Why the VM has no console to open in its current state, or `null`. An Off or
 * Paused VM has no live screen, so the Console tab and the Summary console
 * buttons are disabled for it.
 */
export function vmConsoleStateBlock(state: VmState): string | null {
  return state === "Off" || state === "Paused"
    ? `VM is ${state.toLowerCase()}`
    : null;
}

/** Standalone host RDP console (port 3389) in its own browser tab. */
export function hostConsoleTabUrl(hostId: string): string {
  return `/console?host=${encodeURIComponent(hostId)}`;
}
