import * as React from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { logoutFn } from './server'
import { hasAnyRole, isAdminRole } from './roles'
import { DevBypassWarning } from './DevBypassWarning'
import type { AuthContextValue, AuthUser } from './types'

const AuthContext = React.createContext<AuthContextValue | null>(null)
export { AuthContext }

/**
 * Wraps the app below the root route. Reads the current user from route context
 * (populated by `fetchCurrentUser` in `__root`) and exposes the auth surface.
 *
 * There is no client-side token: API calls go through the `/frontend-api/api/*`
 * proxy, which injects the OIDC bearer server-side.
 */
export function AuthProvider({
  user,
  authDisabled,
  children,
}: {
  user: AuthUser | null
  authDisabled: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const callLogout = useServerFn(logoutFn)

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isAdmin: isAdminRole(user?.roles),
      hasAnyRole: hasAnyRole(user?.roles),
      authDisabled,
      async logout() {
        await callLogout()
        await router.invalidate()
      },
    }),
    [user, authDisabled, callLogout, router],
  )

  return (
    <AuthContext.Provider value={value}>
      {/* Re-mounts (and re-shows) on every full page load, not on client-side
          route changes - that's enough to keep it from going unnoticed
          without nagging on every navigation. */}
      {authDisabled ? <DevBypassWarning /> : null}
      {children}
    </AuthContext.Provider>
  )
}
