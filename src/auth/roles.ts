/** The one role that grants unconditional full access. Matches ovc-backend's OVC_ADMIN_ROLE. */
export const ADMIN_ROLE = "ADMINISTRATOR";

export const isAdminRole = (roles: readonly string[] | undefined) =>
  !!roles?.includes(ADMIN_ROLE);

export const hasAnyRole = (roles: readonly string[] | undefined) =>
  (roles?.length ?? 0) > 0;

/**
 * Where the roles array sits in the OIDC token. Provider-specific - configure
 * with OIDC_ROLES_CLAIM. `${client_id}` is substituted with the OIDC client id.
 *   Keycloak client roles : resource_access.${client_id}.roles   (default)
 *   Keycloak realm roles   : realm_access.roles
 *   Auth0 / Okta / generic : roles   (or a namespaced "https://ovc.example/roles")
 */
export const DEFAULT_ROLES_CLAIM = "resource_access.${client_id}.roles";

/** Walk a dot-path (`a.b.c`) into a decoded-token object. */
export function claimByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

/** Extract the roles array from token claims at `claimPath` (array or space-delimited string). */
export function rolesFromClaims(claims: unknown, claimPath: string): string[] {
  const value = claimByPath(claims, claimPath);
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}
