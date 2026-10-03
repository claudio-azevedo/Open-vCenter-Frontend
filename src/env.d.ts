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
   * Path prefix of the Guacamole HTTP tunnel. The consoles'
   * guacamole-common-js client talks to `${VITE_WEBRDP_URL}/tunnel`, always
   * same-origin. Default "/webrdp": this server's own tunnel
   * (src/routes/webrdp/tunnel.ts), which connects to guacd directly.
   */
  readonly VITE_WEBRDP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** package.json `version`, inlined at build time (vite.config.ts `define`). */
declare const __APP_VERSION__: string

/** Server-only environment variables (never exposed to the browser). */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Base URL of ovc-backend's REST API, e.g. http://localhost:8000/api */
    API_URL: string
    /**
     * guacd address for the console tunnel (src/routes/webrdp/tunnel.ts),
     * read per connection: `host:port` or `scheme://host:port` (the scheme is
     * ignored - guacd is raw TCP). No port ⇒ 4822. Default "localhost:4822".
     */
    GUACD_URL?: string
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
    /**
     * "true" ⇒ standalone demo: the login screen opens a demo session with no
     * IdP (like OVC_AUTH_MODE=stub; every visitor is demo@ovc.demo,
     * ADMINISTRATOR), no ovc-backend / agent / guacd. The browser serves
     * every API call from the simulator in src/demo/ and keeps a random
     * inventory in localStorage. Read at runtime - the same image serves both
     * modes; no other variable is needed.
     */
    OVC_DEMO_MODE?: string
  }
}
