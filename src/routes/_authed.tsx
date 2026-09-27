import { createFileRoute } from '@tanstack/react-router'
import { requireAnyRole } from '~/auth'

/**
 * Every app screen sits under this layout. Guard: must be authenticated AND
 * carry at least one role (or ADMINISTRATOR). No roles → /access-denied.
 * What each role can actually see is enforced by ovc-backend's scope filter.
 *
 * For an admin-only screen, add a route with `beforeLoad: ({context, location})
 * => requireAdmin(context, location)`.
 */
export const Route = createFileRoute('/_authed')({
  // Demo branch: the app screens render in the browser only. Their data lives
  // in the browser anyway (src/demo/), so SSR would only paint an empty
  // Explorer - and it costs far more CPU than the Cloudflare Workers free plan
  // allows per request. /login keeps SSR (it is tiny).
  ssr: false,
  beforeLoad: ({ context, location }) => requireAnyRole(context, location),
})
