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
  beforeLoad: ({ context, location }) => requireAnyRole(context, location),
})
