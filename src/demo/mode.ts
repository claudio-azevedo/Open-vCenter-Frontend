/**
 * Demo mode flag, isomorphic. The server decides it from `OVC_DEMO_MODE` (see
 * `demo/env.ts`) and hands it to the client through the root route context;
 * `__root` calls `setDemoMode()` while rendering, before any query runs, so
 * `api/client.ts` and components can read it synchronously.
 *
 * Demo mode = no backend, no agent, no login: `request()` is served by the
 * in-browser simulator in `demo/api.ts`, persisted in localStorage.
 */

/** The identity every demo visitor gets (see `demo/env.ts`). */
export const DEMO_USER_EMAIL = "demo@ovc.demo";

let demo = false

export function setDemoMode(value: boolean) {
  demo = value
}

export function isDemoMode(): boolean {
  return demo
}
