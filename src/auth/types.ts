export interface AuthUser {
  id: string
  email: string
  displayName?: string
  /** Roles from the OIDC token (see OIDC_ROLES_CLAIM). Empty ⇒ access-denied screen. */
  roles: string[]
}

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  /** True when the user carries the ADMINISTRATOR role (full access). */
  isAdmin: boolean
  /** Whether the user has at least one role (any role ⇒ can enter the app). */
  hasAnyRole: boolean
  /** True when OVC_AUTH_MODE=stub is active - no login, everyone is admin. */
  authDisabled: boolean
  logout(): Promise<void>
}
