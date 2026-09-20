import { betterAuth } from "better-auth/minimal";
import { genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { jwtDecode } from "jwt-decode";
import type { GenericOAuthUserInfo } from "better-auth/plugins";
import { DEFAULT_ROLES_CLAIM, rolesFromClaims } from "./roles";

/**
 * OIDC login, brokered by better-auth in **cookie mode** (no database) - the
 * session, the OAuth state and the provider tokens all live in sealed cookies.
 *
 * Provider-agnostic: any OpenID Connect provider with a discovery document works
 * (Keycloak, Auth0, Okta, Entra ID, Google, …). Point OIDC_ISSUER at it and set
 * OIDC_ROLES_CLAIM to wherever that provider puts roles in the token.
 */

/** Stable provider id - used for the callback path and token lookups. */
export const OIDC_PROVIDER_ID = "oidc";

const oidc = {
  clientId: process.env.OIDC_CLIENT_ID as string,
  clientSecret: process.env.OIDC_CLIENT_SECRET as string,
  issuer: (process.env.OIDC_ISSUER as string)?.replace(/\/$/, ""),
};

const ROLES_CLAIM = (
  process.env.OIDC_ROLES_CLAIM || DEFAULT_ROLES_CLAIM
).replace("${client_id}", oidc.clientId ?? "");

const SCOPES = (process.env.OIDC_SCOPES || "openid profile email")
  .split(/\s+/)
  .filter(Boolean);

/** Decode a JWT's claims, or null if it isn't a decodable JWT (opaque token). */
function decodeClaims(token: unknown): Record<string, unknown> | null {
  if (typeof token !== "string") return null;
  try {
    return jwtDecode<Record<string, unknown>>(token);
  } catch {
    return null;
  }
}

export const auth = betterAuth({
  telemetry: { enabled: false },
  basePath: "/frontend-api/auth",
  user: {
    additionalFields: {
      roles: { type: "json", fieldName: "roles" },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60,
    cookieCache: {
      enabled: true,
      refreshCache: true,
      maxAge: 60 * 60 * 24,
    },
  },
  account: {
    storeStateStrategy: "cookie",
    storeAccountCookie: true,
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: OIDC_PROVIDER_ID,
          discoveryUrl: `${oidc.issuer}/.well-known/openid-configuration`,
          clientId: oidc.clientId,
          clientSecret: oidc.clientSecret,
          scopes: SCOPES,
          overrideUserInfo: true,
          getUserInfo: (tokens) => {
            // Roles usually ride the access token; fall back to the id token.
            const accessClaims = decodeClaims(tokens.accessToken);
            const claims = accessClaims ?? decodeClaims(tokens.idToken) ?? {};
            const roles = rolesFromClaims(claims, ROLES_CLAIM);

            return Promise.resolve({
              // `sub` (not `id`) is what better-auth's default accountSubject
              // resolver reads for discovery-based providers - keep both,
              // `id` is still used elsewhere (getUserInfo() below).
              id: String(claims.sub ?? ""),
              sub: String(claims.sub ?? ""),
              email: String(claims.email ?? claims.sub ?? ""),
              name: String(
                claims.name ??
                  claims.preferred_username ??
                  claims.email ??
                  claims.sub ??
                  "",
              ),
              emailVerified: claims.email_verified === true,
              roles,
            } as GenericOAuthUserInfo);
          },
          // Without this, `roles` on the object returned by getUserInfo above
          // is silently dropped: better-auth only carries email/emailVerified/
          // image/name from the raw profile onto the user record by default,
          // then spreads mapProfileToUser's result on top for anything else -
          // if this isn't set, that's `{}`. This is what actually wires our
          // custom `roles` additionalField.
          mapProfileToUser: (profile) => {
            const roles = (profile as { roles?: unknown }).roles;
            return { roles: Array.isArray(roles) ? roles.map(String) : [] };
          },
        },
      ],
    }),
    tanstackStartCookies(),
  ],
});

type InferSession = typeof auth.$Infer.Session;

export type Session = {
  user: InferSession["user"];
} & InferSession["session"];
