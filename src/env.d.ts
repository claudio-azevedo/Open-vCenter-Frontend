/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL the browser uses for API calls. Points at the frontend's own
   * proxy (`/frontend-api/api`), which injects the OIDC bearer server-side.
   * Split-origin dev: the absolute origin, e.g.
   * "http://localhost:3000/frontend-api/api".
   */
  readonly VITE_API_URL?: string
  /**
   * Optional display name of the identity provider, shown on the login button
   * ("Sign in with <name>"). Unset ⇒ just "Sign in".
   */
  readonly VITE_OIDC_PROVIDER_NAME?: string
  /**
   * Base URL of the ovc-webrdp service. The VM Console tab embeds a
   * guacamole-common-js client that talks to its Guacamole HTTP tunnel at
   * `${VITE_WEBRDP_URL}/tunnel`. Default "/webrdp" (same-domain proxy). Use an
   * absolute URL like "http://localhost:8090/webrdp" for split-origin local dev.
   */
  readonly VITE_WEBRDP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Server-only environment variables (never exposed to the browser). */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Base URL of ovc-backend's REST API, e.g. http://localhost:8000/api */
    API_URL: string
    /** OIDC issuer / discovery base, e.g. http://localhost:8080/realms/ovc */
    OIDC_ISSUER: string
    OIDC_CLIENT_ID: string
    OIDC_CLIENT_SECRET: string
    /** Space-separated scopes. Default "openid profile email". */
    OIDC_SCOPES?: string
    /**
     * Dot-path to the roles array in the token. "${client_id}" is substituted.
     * Default "resource_access.${client_id}.roles" (Keycloak client roles).
     */
    OIDC_ROLES_CLAIM?: string
    /** 32+ byte random secret used by better-auth to seal cookies */
    BETTER_AUTH_SECRET: string
    /** Public base URL of the auth endpoints, e.g. http://localhost:3000/frontend-api/auth */
    BETTER_AUTH_URL: string
    /**
     * "stub" ⇒ skip the OIDC login: every request is admin@ovc.debug.app
     * (ADMINISTRATOR), no provider needed. Same variable, same value as
     * ovc-backend's OVC_AUTH_MODE - set both to "stub" and neither side
     * needs an IdP. Works in every build, including `production` - the UI
     * shows a standing warning dialog while it's active. Any other value
     * (or unset) uses real OIDC login.
     */
    OVC_AUTH_MODE?: "stub" | "oidc"
  }
}
