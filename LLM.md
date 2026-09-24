# ovc-frontend - context for LLMs

Web console for **Open vCenter**. Part of a three-service suite:

- **ovc-backend** (Python) - owns Postgres + Valkey, talks to agents over RabbitMQ,
  exposes a REST API to this frontend.
- **ovc-agent** (Go, Windows) - runs on each Hyper-V host, executes operations,
  replies over RabbitMQ.
- **ovc-frontend** (this repo) - talks to `ovc-backend` over REST only. It never
  touches RabbitMQ.

## Conventions

All code, comments, identifiers, commit messages, docs and UI copy are in
**English**, regardless of the language a contributor chats in.

## What it does

A single Windows 95/98 **"Explorer" window**:

- Left pane: a tree. A cluster node's children, in order: its **hosts** (leaf
  nodes), then its **folders** (each holding the VMs assigned to it, from any host
  in the cluster), then its **loose VMs** (cluster VMs not in a folder). Standalone
  hosts sit at the tree **root**, right after the clusters (no "Standalone Hosts"
  wrapper node); each standalone host node holds its folders, then its loose VMs.
  See `features/inventory/tree/treeModel.ts`.
- Right pane: details of the selected node (Cluster / Host / Folder / VM), with tabs.
- Toolbar: Refresh · New Folder · Move to Folder · power actions.
- File menu: **Cluster Management** and **Hosts Management** - each opens a Win95
  `Dialog` (`organize/ManagementDialogs.tsx`) with a table of the entities and inline
  create / rename / edit / delete. Cluster delete requires an empty cluster; host
  remove cascades its VMs/folders. Action menu: Move VM to Folder, Move Host,
  Delete Folder. Folder creation is the toolbar's **New Folder** button. All via
  Win95 `Dialog`s in `features/inventory/organize/`.
- **Folders** are logical, app-created (not agent-reported), flat, scoped to exactly
  one of a cluster or a standalone host. VMs are moved in/out via `PATCH /vms/:id`
  `{folderId}` - a purely logical op, no agent involvement.
- Bottom dock: **Recent Tasks** - full-width, collapsible, shows task type, target,
  who initiated it, a progress bar, status, start time and completion time.
- Status bar: connection state, selection, host/VM counts, running-task count.

VM power actions (`start` / `stop` / `shutdown` / `restart` / `delete`) are
**asynchronous**: the backend turns them into RabbitMQ requests and returns a
`Task`; the UI updates the VM state optimistically and polls `GET /tasks/:id` until
the task reaches a terminal status, then refetches inventory.

RBAC is scoped Cluster > Host > Folder and enforced **server-side** - the frontend
never sends an identity or scope.

## Stack

- **TanStack Start** (SSR) + **TanStack Router** (file-based routes in `src/routes/`,
  `src/routeTree.gen.ts` is generated) + **TanStack Query** (polling, task tracking).
- **React 19**, **TypeScript** (strict), **Vite**.
- **Tailwind CSS v4** via `@tailwindcss/vite`: `src/styles/app.css` plus one file
  per theme in `src/styles/themes/`.
- **ag-grid-community v36** - used only for the VM list grid (`VmGrid`, client-only).
- **lucide-react** - icons.
- **redaxios** - HTTP.
- **Node 24** required (devDependencies alias `typescript` to a TS 6/7 preview;
  `npx tsc --noEmit` works under it).

## Themes

Five visual themes: **Windows Classic** (default), **Windows XP**, **Windows 7**
(Aero glass via `backdrop-filter`), **Modern (Light)** and **Modern (Dark)**.

- The choice lives in the `ovc-theme` cookie (1 year, `SameSite=Lax`). The root
  route's `beforeLoad` reads it (`getPreferences()`, isomorphic) so SSR renders
  `<html data-theme="…">` - no flash of the default theme.
- Users pick it in the login screen's "Theme" dropdown or in the Explorer's
  **Preferences › Theme** submenu (`useTheme().setTheme`).
- A theme is CSS only. Rules for new UI code:
  - visuals a theme may change go through a `ui-*` class (or a `bevel-*`
    utility) whose look comes from custom properties - never hard-code chrome
    with Tailwind colour/shadow utilities;
  - colours are semantic tokens only (`text-fg`, `text-danger`, `text-success`,
    `text-warning`, `text-accent`, `bg-window`, `bg-notice-bg`, chart series
    `var(--color-chart-N)`, …) - no raw hex values in components;
  - a new token needs a Classic value in `app.css`; themes override only what
    differs.
- Components don't branch on the theme id. The one exception is `ScrollArea`,
  which renders a native scroller for themes with `nativeScrollbars`.

## Tree behaviour

**Preferences › Tree Behavior** (`ovc-tree-behavior` cookie): `Collapsed`
(default) opens nothing; `Expanded` opens every cluster and host, never folders.
It seeds the tree on the first populated render and again when the preference
changes - not on data refetches, so manual expand/collapse sticks. In both modes
the ancestors of the selected node are opened, so a deep link (`?sel=vm:…`) is
never hidden. See `initialExpansion` in `features/inventory/tree/treeModel.ts`.

## Layout / architecture

```
src/
  styles/app.css              Token contract with Windows Classic values: @theme
                              colour tokens, component custom properties
                              (--btn-*, --titlebar-*, --menu-*, ...), @utility
                              bevel classes and the semantic `ui-*` classes.
  styles/themes/              xp.css, win7.css, modern.css (light + dark) - each
                              only redefines tokens under
                              :root[data-theme='<id>'].
  preferences/                User preferences, persisted in cookies (cookies.ts):
                              theme list (theme.ts), tree behaviour
                              (treeBehavior.ts), SSR + client read
                              (getPreferences.ts), PreferencesProvider with
                              useTheme / useTreeBehavior (provider.tsx).
  components/win95/            Presentational Win95 primitives - Window, TitleBar,
                              MenuBar, Toolbar, TreeView, SplitPane, Tabs, GroupBox,
                              Table/PropertyList, ProgressBar, Button, TextField,
                              Select, StatusBar, Icon, ClientOnly. `bevel.ts` has
                              cn() + cva recipes.
  components/                 Login.tsx ("Sign in" card),
                              DefaultCatchBoundary, NotFound.
  auth/                       The ONLY place auth logic lives.
                              - auth.ts        better-auth client (cookie mode, no
                                               DB) - genericOAuth via OIDC discovery;
                                               getUserInfo decodes the token and
                                               reads roles at OIDC_ROLES_CLAIM
                              - types.ts       AuthUser / AuthContextValue
                              - roles.ts       ADMIN_ROLE, isAdminRole / hasAnyRole,
                                               claimByPath / rolesFromClaims
                              - server.ts      server fns: fetchCurrentUser, signInFn,
                                               clearAuthCookies, logoutFn
                              - token.server.ts getAccessToken() - server-only, for the proxy
                              - bypass.ts      OVC_AUTH_MODE=stub (server-only, every build)
                              - DevBypassWarning.tsx  standing warning dialog while bypass is active
                              - provider.tsx   <AuthProvider>; exposes user / isAdmin
                                               / hasAnyRole / logout
                              - guard.ts       requireAuth / requireAnyRole / requireAdmin
                              - useAuth.ts     useAuth() hook
  api/                        Typed HTTP layer.
                              - types.ts       domain entities + enums (mirror of
                                               docs/api-contract.md)
                              - client.ts      redaxios wrapper, VITE_API_URL,
                                               error envelope
                              - endpoints/*    thin per-resource request functions
                              - queries.ts     queryOptions() factories with polling
                                               intervals
                              - queryKeys.ts   central key factory
  features/inventory/          The Explorer screen.
                              - InventoryExplorer.tsx   window shell composition
                              - InventoryMenuBar / InventoryToolbar / InventoryStatusBar
                              - selection.ts            selection lives in the URL
                                                        (?sel=vm:<id>&tab=hardware)
                              - tree/                   treeModel + InventoryTree + icons
                              - organize/               dialogStore + mutations +
                                                        OrganizeDialogs (new folder, move
                                                        VM/host, delete folder) +
                                                        ManagementDialogs (Cluster / Hosts
                                                        Management tables)
                              - detail/                 DetailPane + Cluster/Host/Folder/
                                                        Vm details + panels/ + VmGrid.
                                                        HostDetail: agent never seen
                                                        (agent.lastSeen == null) ⇒ only a
                                                        "Setup Agent" tab (config.ini from
                                                        GET /hosts/:id/agent-config); once
                                                        the agent checks in, the normal
                                                        tabs replace it.
                              - actions/                powerActions table,
                                                        useVmPowerAction (optimistic
                                                        mutation), TaskWatcher,
                                                        activeTasks + statusMessage stores
                              - tasks/                  TasksDock (bottom panel) + labels
                              - format.ts               bytes / duration / time helpers
  routes/
    __root.tsx               providers (QueryClientProvider, AuthProvider), <head>,
                              devtools. Root beforeLoad loads the current user.
    index.tsx                redirect → /inventory
    _authed.tsx              guard: requireAnyRole() → /login or /access-denied
    _authed/inventory.tsx    the Explorer route (validateSearch + loader)
    login.tsx / logout.tsx / access-denied.tsx
    frontend-api/auth/$.ts   better-auth OAuth endpoints (sign-in, callback, sign-out)
    frontend-api/api/$.ts    server proxy → ovc-backend, injects the OIDC bearer
  router.tsx                 getRouter(): QueryClient in router context, no SSR
                              query dehydration (see gotchas).
```

## Data flow

- Loaders call `queryClient.ensureQueryData(...)` for a spinner-free SSR first paint.
- Components use `useQuery` (not suspense) so a backend outage degrades to a
  "Disconnected" status bar instead of throwing.
- Polling cadence (in `api/queries.ts`): clusters 30s, hosts 15s, VMs 10s,
  a running task 1.5s, the tasks dock 1.5s while active / 4s idle.
- Power action → `useVmPowerAction`: optimistic transitional state → `POST` returns a
  `Task` → id added to the `activeTasks` store → `TaskWatcher` polls it → on terminal
  status: invalidate `['vms']` / `['tasks']` / `['hosts']`, report to the status bar
  and the Tasks tab.

## Auth (OIDC)

`better-auth` in **cookie mode** (no database) brokers login against **any**
OpenID Connect provider with a discovery document (Keycloak, Auth0, Okta, Entra
ID, …) - `genericOAuth` with `discoveryUrl = ${OIDC_ISSUER}/.well-known/openid-configuration`,
`providerId = "oidc"`. The provider/realm/client are dedicated to ovc.
infra-containers ships a Keycloak realm as the default.

- `/login` → "Sign in" button → `signInFn` → redirect to the provider.
- Callback at `/frontend-api/auth/callback/oidc`; `getUserInfo` decodes the token
  (access, else id) and reads the roles array at the dot-path `OIDC_ROLES_CLAIM`
  (default `resource_access.${client_id}.roles`; `${client_id}` is substituted),
  persisted on the session user as `roles`.
- `__root` `beforeLoad` → `fetchCurrentUser()` → `context.user = { …, roles }`.
- `_authed` guard `requireAnyRole`: no session → `/login`; session but zero roles
  → `/access-denied`; `ADMINISTRATOR` or any role → in. `requireAdmin` guards
  admin-only routes.
- API calls go to `/frontend-api/api/*` (browser, cookie) → server proxy attaches
  `Authorization: Bearer <access token>` → ovc-backend re-verifies the JWT and
  derives roles the same way. The token never reaches the browser.

Env (server-only): `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
`OIDC_SCOPES?`, `OIDC_ROLES_CLAIM?`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`API_URL`; client-visible `VITE_OIDC_PROVIDER_NAME?` (login-button label). See
`.env.example`. `ADMINISTRATOR` = full access, mirrored by ovc-backend's
`OVC_ADMIN_ROLE` / `OVC_OIDC_ROLES_CLAIM`.

**No-auth bypass** - `OVC_AUTH_MODE=stub` (server-only, `src/auth/bypass.ts`):
`fetchCurrentUser` returns a fixed `admin@ovc.debug.app` / `[ADMINISTRATOR]`
user, no provider contacted, no login screen; the API proxy forwards with **no**
bearer, so it's the same variable, same value as ovc-backend's `OVC_AUTH_MODE`
- set both to `stub`. Logs a warning on boot and shows a standing warning
dialog in the UI (`DevBypassWarning`) - works in every build, including
`production`.

## Backend API

The REST contract is in **`docs/api-contract.md`**, mirrored in `src/api/types.ts`.
`ovc-backend` **implements it** (milestone 1) and is the only data source - there
is no in-frontend mock. Run it: `docker compose up` in `../ovc-backend` (its
`OVC_AUTH_MODE=stub` / seed give you data without a provider), then set
`VITE_API_URL=http://localhost:3000/frontend-api/api` in `.env.local`.

## Deployment / path namespacing

The browser only ever calls the frontend origin. REST goes to `/frontend-api/api/*`
(default when `VITE_API_URL` is unset); that server route proxies to `ovc-backend`
at `API_URL` (container-to-container) and injects the OIDC bearer. RPC lives under
`/frontend-api/fn/*` (`vite.config.ts` → `tanstackStart({ serverFns: { base:
'/frontend-api/fn' } })`), OAuth under `/frontend-api/auth/*`; pages at `/`, assets
at `/assets/*`. So the public proxy needs just the frontend (+ `/webrdp`). See
README "Deploying behind one domain".

## Gotchas

- **Never use `window.confirm` / `alert` / `prompt`.** All confirmations go through
  the Win95 `Dialog` - `await confirm({ title, message, danger })` from
  `features/inventory/confirm.tsx` (`<ConfirmHost/>` mounted in InventoryExplorer).
- **VM iconography** is one set of transport-control icons everywhere: `Play`
  (green) / `Square` (red) / `Pause` (amber). Power buttons: `actions/powerActions.ts`
  (`icon` + `color`). Tree + detail-header state icon: `tree/nodeIcons.tsx`
  `STATE_ICON` (Running→Play, Off→Square, Paused→Pause, Saved/Saving→blue Square,
  transitional→same icon + `animate-pulse`).
- **Do not add `@tanstack/react-router-with-query`** - it is stuck at 1.130.x, skews
  against router 1.170, and throws a query-stream hydration error. We use a plain
  `<QueryClientProvider>` in `__root`; server and client get separate QueryClients
  and there is no SSR query dehydration (fine - SSR already paints data, client
  refetches on mount).
- **The auth guard redirects, never throws.** Throwing an `Error` in `beforeLoad`
  produced an SSR 500 and broke client hydration.
- **`react-resizable-panels` is pinned to v3** - v4 renamed every export.
- **ag-grid is client-only** - rendered through `<ClientOnly>`, modules registered
  on the client. It uses the JS Theming API (`themeQuartz.withParams`), not CSS themes.
- **Type is the native UI sans per OS** - `Segoe UI` on Windows (the deploy
  target), San Francisco on macOS, Roboto elsewhere - 12px base, anti-aliased.
  An earlier build listed `MS Sans Serif`/`Tahoma` + `font-smooth: none` chasing a
  bitmap Win95 look, but browsers substitute a thin vector face for the bitmap and
  `font-smooth` is a no-op, so it was just a dated 11px face (unreadable on macOS
  Retina). The retro feel is carried by the bevels/palette/geometry. For an
  authentic pixel look, vendor `W95FA` via `@font-face` (works on every OS).

## VM Console tab

`detail/panels/VmConsolePanel.tsx` (shell) + `GuacamoleConsole.tsx` (client) run a
**native `guacamole-common-js` client in the page** - no iframe. Flow: resolve the
VM's host `fqdn` → Win95 credentials form → `<ClientOnly>` mounts `GuacamoleConsole`,
which `await import('guacamole-common-js')` (client-only chunk), opens
`new Guacamole.HTTPTunnel(`${VITE_WEBRDP_URL}/tunnel`)` and connects with
`hostname=<fqdn>&port=2179&vm-guid=<vm.id>&security=vmconnect` (+ username/password
from the form). The tunnel servlet lives in the `ovc-webrdp` Java service (guacd
behind it); the browser calls it at `/webrdp/tunnel` same-origin by default, which
`src/routes/webrdp/tunnel.ts` proxies to `WEBRDP_ORIGIN` (a runtime env var, read
per-request) - or the `VITE_WEBRDP_URL` origin directly in split-origin dev
(`ovc-webrdp` sends permissive CORS for that case).
`GuacamoleConsole` = Win95 `Toolbar` (Disconnect / Reconnect / Clipboard /
Ctrl+Alt+Del / Fullscreen) + `StatusBar` + a black display area + connecting/error
overlays.
`VITE_WEBRDP_URL` defaults to `/webrdp` (single-domain proxy).

## Agent Management

File ▸ **Agent Management…** (admin) - `organize/AgentManagementDialog.tsx`. Upload
`ovc-agent` builds (multipart `POST /agent-binaries`), set the active build per
hypervisor, delete, and roll out (`POST /agent-binaries/:id/rollout` or per-host
`POST /hosts/:id/actions/update-agent`). Rollout task ids feed the `activeTasks`
store so the dock tracks them. Binary storage backend (`local`/`s3`) is
env-configured on the backend and shown read-only. The host "Setup Agent" tab
adds a **Download install bundle (.zip)** link (`GET /hosts/:id/agent-bundle` via
a plain `<a href>` through the cookie proxy); a connected host's detail header
shows **Update Agent → <version>** when it is behind the active build
(`detail/HostAgentUpdateButton.tsx`).

## Not in milestone 1

Create-VM wizard, `vm_edit`, templates & ISO management screens, RBAC admin UI,
nested folders, real-time push (SSE/WebSocket), i18n, mobile layout, automated
tests.
