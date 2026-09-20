/**
 * Shared URLs for the ovc-webrdp service.
 *
 * `WEBRDP_BASE` - base URL of ovc-webrdp. The Guacamole HTTP tunnel servlet
 * lives at `${base}/tunnel`. Default "/webrdp" resolves against the app origin
 * (single domain proxy - see README "Deploying behind one domain"); set an
 * absolute URL (e.g. http://localhost:8090/webrdp) for split-origin local dev.
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

/** Standalone host RDP console (port 3389) in its own browser tab. */
export function hostConsoleTabUrl(hostId: string): string {
  return `/console?host=${encodeURIComponent(hostId)}`;
}
