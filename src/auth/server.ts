import { createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  getRequest,
  setCookie,
} from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { auth, OIDC_PROVIDER_ID } from "./auth";
import { DEV_BYPASS_USER, isDevBypass } from "./bypass";
import { DEMO_SESSION_COOKIE, DEMO_USER, isDemoEnv } from "~/demo/env";
import type { AuthUser } from "./types";

/**
 * The ONLY place server-side auth logic runs. Everything talks to better-auth
 * (cookie session) - swapping IdPs is a config change in `auth.ts`, not here.
 */

export const fetchCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    user: AuthUser | null;
    authDisabled: boolean;
    /** OVC_DEMO_MODE - standalone demo, no backend (see src/demo/). */
    demo: boolean;
  }> => {
    // Demo: signed in once "Sign in" set the demo session cookie - no IdP.
    if (isDemoEnv()) {
      return {
        user: getCookie(DEMO_SESSION_COOKIE) ? DEMO_USER : null,
        authDisabled: false,
        demo: true,
      };
    }
    if (isDevBypass()) return { user: DEV_BYPASS_USER, authDisabled: true, demo: false };

    const data = await auth.api.getSession({ headers: getRequest().headers });
    if (!data?.session) return { user: null, authDisabled: false, demo: false };
    const u = data.user as {
      id: string;
      email: string;
      name?: string;
      roles?: unknown;
    };
    return {
      user: {
        id: u.id,
        email: u.email,
        displayName: u.name,
        roles: Array.isArray(u.roles) ? (u.roles as string[]) : [],
      },
      authDisabled: false,
      demo: false,
    };
  },
);

/** Kick off the OIDC redirect. Returns the URL for the browser to navigate to. */
export const signInFn = createServerFn({ method: "POST" })
  .validator((d: { callbackURL?: string }) => d)
  .handler(async ({ data }) => {
    // Demo mode: like the stub, no provider is contacted - just open a demo
    // session and go straight to the app.
    if (isDemoEnv()) {
      setCookie(DEMO_SESSION_COOKIE, "1", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
      return { url: data.callbackURL || "/inventory" };
    }
    // better-auth's genericOAuth plugin registers each configured provider as
    // a first-class social provider (no plugin-specific sign-in endpoint) -
    // go through the core signInSocial API, not a dedicated OAuth2 method.
    const result = await auth.api.signInSocial({
      headers: getRequest().headers,
      body: {
        provider: OIDC_PROVIDER_ID,
        callbackURL: data.callbackURL || "/inventory",
        errorCallbackURL: "/login?error=oauth",
      },
    });
    // Only undefined on the id-token/session branch, which this call never
    // takes (no idToken in the body) - guard instead of navigating to
    // "undefined" if that ever stops being true.
    if (!result.url) throw new Error("signInSocial returned no redirect URL");
    return { url: result.url };
  });

/** Clear stale better-auth cookies before starting a fresh OAuth flow. */
export const clearAuthCookies = createServerFn({ method: "POST" }).handler(
  async () => {
    if (isDemoEnv()) return; // no better-auth session in demo mode
    try {
      await auth.api.signOut({ headers: getRequest().headers });
    } catch {
      // already invalid / expired - nothing to clear
    }
  },
);

export const logoutFn = createServerFn().handler(async () => {
  // Nothing to sign out of while the dev bypass is active.
  if (isDevBypass()) throw redirect({ href: "/inventory" });
  // Demo: end the demo session and show the login screen again.
  if (isDemoEnv()) {
    deleteCookie(DEMO_SESSION_COOKIE, { path: "/" });
    throw redirect({ href: "/login" });
  }
  try {
    await auth.api.signOut({ headers: getRequest().headers });
  } catch {
    // ignore - session may already be gone
  }
  throw redirect({ href: "/login" });
});
