import { betterAuth } from "better-auth/minimal";
import { genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { jwtDecode } from "jwt-decode";
import type { GenericOAuthUserInfo } from "better-auth/plugins";
import { DEFAULT_ROLES_CLAIM, rolesFromClaims } from "./roles";
import { isDemoEnv } from "~/demo/env";

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

/**
 * Demo mode (OVC_DEMO_MODE) never signs anyone in, so a demo container needs no
 * auth env at all. better-auth still initialises eagerly, though: it refuses to
 * start in production without a secret, and warns about a missing base URL -
 * hand it throwaway values. The OIDC provider is left out entirely (see
 * `plugins`), so no discovery request is attempted either.
 */
const DEMO = isDemoEnv();

function demoOverrides(): { secret?: string; baseURL?: string } {
  if (!DEMO) return {};
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return {
    secret:
      process.env.BETTER_AUTH_SECRET ||
      [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""),
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000/frontend-api/auth",
  };
}

export const auth = betterAuth({
  ...demoOverrides(),
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
    ...(DEMO
      ? []
      : [
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
        ]),
    tanstackStartCookies(),
  ],
});

type InferSession = typeof auth.$Infer.Session;

export type Session = {
  user: InferSession["user"];
} & InferSession["session"];
