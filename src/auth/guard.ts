import { redirect } from '@tanstack/react-router'
import { hasAnyRole, isAdminRole } from './roles'
import type { AuthUser } from './types'

type Ctx = { user: AuthUser | null }
type Loc = { href: string }

/** Unauthenticated → /login (remembering where they were headed). */
export function requireAuth(context: Ctx, location: Loc) {
  if (!context.user) {
    throw redirect({ to: '/login', search: { redirect: location.href } })
  }
}

/**
 * Authenticated but no roles at all (and not an admin) → /access-denied.
 * Any role, or ADMINISTRATOR, is allowed through.
 */
export function requireAnyRole(context: Ctx, location: Loc) {
  requireAuth(context, location)
  const roles = context.user!.roles
  if (!isAdminRole(roles) && !hasAnyRole(roles)) {
    throw redirect({ to: '/access-denied' })
  }
}

/** ADMINISTRATOR only → otherwise /access-denied. */
export function requireAdmin(context: Ctx, location: Loc) {
  requireAuth(context, location)
  if (!isAdminRole(context.user!.roles)) {
    throw redirect({ to: '/access-denied' })
  }
}
