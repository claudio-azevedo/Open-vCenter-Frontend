import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./auth";

/**
 * The current OIDC access token, refreshed if expired. Server-only (`.server.ts`)
 * - imported by the `/frontend-api/api/*` proxy, never by client code. The token
 * never reaches the browser. Returns null on any failure (no session, refresh
 * rejected, provider down).
 *
 * `useAccountCookie: true` picks the account from the signed cookie set at
 * sign-in (`account.storeAccountCookie` in auth.ts) instead of an explicit
 * accountId - there's only ever one (OIDC_PROVIDER_ID) here anyway.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const data = await auth.api.getAccessToken({
      body: { useAccountCookie: true },
      headers: getRequest().headers,
    });
    return data.accessToken ?? null;
  } catch {
    return null;
  }
}
