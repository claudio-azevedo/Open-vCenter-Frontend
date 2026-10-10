<h1 align="center">
  <a href="https://openvcenter.com/">
    <img src=".github/ovc-logo.svg" alt="Open vCenter" width="512">
  </a>
</h1>

<p align="center">
  <strong>An open source virtualization center to manage hundreds of thousands of VMs</strong>
</p>

<p align="center">
  <a href="https://openvcenter.com">Website</a> ·
  <a href="https://openvcenter.com/architecture">Architecture</a> ·
  <a href="https://openvcenter.com/running">Run it</a> ·
  <a href="https://openvcenter.com/docker-compose">Docker Compose</a> ·
  <a href="https://openvcenter.com/kubernetes">Kubernetes</a> ·
  <a href="https://github.com/claudio-azevedo/Open-Virtualization-Manager/releases">Release Notes</a>
</p>

# ovc-frontend

This is a component of the Open vCenter stack.

It is one of three services:

| Service                    | Role                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| `ovc-frontend` (this repo) | React SSR web UI. Talks to `ovc-backend` over REST.                         |
| `ovc-backend`              | Python API + worker. Owns Postgres/Valkey, talks to agents over RabbitMQ.   |
| `ovc-agent`                | Go binary on each Hyper-V host. Executes operations, replies over RabbitMQ. |

> A pre-built image is published to GHCR as
> [`ghcr.io/claudio-azevedo/ovc-frontend`](https://github.com/claudio-azevedo/Open-vCenter-Frontend/pkgs/container/ovc-frontend) -
> see [Docker Compose](https://openvcenter.com/docker-compose) or
> [Kubernetes](https://openvcenter.com/kubernetes) to run the whole stack with it.
> Everything from here down is for **local development**, running this app
> straight from source.

## Stack

- **TanStack Start** (SSR) + **TanStack Router** + **TanStack Query**
- **React 19**, **TypeScript** (strict), **Vite**
- **Tailwind CSS v4** - one stylesheet, `src/styles/app.css`
- **ag-grid-community** - the VM list grid
- **lucide-react** - icons
- Custom Windows 95/98 component kit - `src/components/win95/`

## Requirements

- **Node 24** (`brew install node@24`). The devDependencies alias `typescript` to a
  TS 6/7 preview that needs a current Node.
- **npm** (there is a `package-lock.json`; a project `.npmrc` pins the public registry).

## Getting started

```sh
npm install
cp .env.example .env.local        # then edit - see "Environment" below
npm run dev                       # http://localhost:3000
```

Open http://localhost:3000. You are redirected to `/login` → **Sign in**.

**Auth is OIDC** (`better-auth`, cookie mode) against any OpenID Connect provider
with a discovery document - Keycloak, Auth0, Okta, Entra ID, … Point `OIDC_ISSUER`
at it and register `${app}/frontend-api/auth/callback/oidc` as a redirect URI.
`../infra-containers` ships a Keycloak realm (`ovc`, client `ovc-frontend`) as the
default. Roles are read from the token at `OIDC_ROLES_CLAIM` (default
`resource_access.${client_id}.roles`): `ADMINISTRATOR` = full access; a signed-in
user with no roles lands on `/access-denied`. Configure `OIDC_*` / `BETTER_AUTH_*`
/ `API_URL` in `.env.local` (`.env.example`).

For local UI work without a provider, set **`OVC_AUTH_MODE=stub`** on both this app
and ovc-backend - same variable, same value on both sides: no login screen, every
request is `admin@ovc.debug.app` with the `ADMINISTRATOR` role. Works in every
build, including `production` - the UI shows a standing warning dialog while it's
active.

## Environment

Client vars are read by Vite and prefixed `VITE_`; the rest (`API_URL`, `OIDC_*`,
`BETTER_AUTH_*`) are server-only and never reach the browser. `ovc-backend` is the
only data source - run it (its `OVC_AUTH_MODE=stub` + seed give you data without a
provider). There is no in-frontend mock.

| Variable                                | Required     | Default                              | Purpose                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`                          | no           | `/frontend-api/api`                  | Base URL the browser uses. Hits the frontend's own proxy, which attaches the OIDC bearer server-side. Split-origin dev: `http://localhost:3000/frontend-api/api`. Single-domain deploy: leave unset.                                                                                                      |
| `VITE_OIDC_PROVIDER_NAME`               | no           | -                                    | Name on the login button ("Sign in with …"). Unset ⇒ "Sign in".                                                                                                                                                                                                                                           |
| `VITE_WEBRDP_URL`                       | no           | `/webrdp`                            | Path prefix of the Guacamole HTTP tunnel the **Console** tabs use (`${VITE_WEBRDP_URL}/tunnel`, always same-origin - this app serves it). Leave unset.                                                                                                                                                    |
| `API_URL`                               | yes (server) | -                                    | Base URL of the `ovc-backend` REST API, used by the `/frontend-api/api` proxy. Local dev: `http://localhost:8000/api`.                                                                                                                                                                                    |
| `GUACD_URL`                             | no (server)  | `localhost:4822`                     | guacd address for the console tunnel (`/webrdp/tunnel`), read per connection: `host:port` or `scheme://host:port` (scheme ignored - guacd is raw TCP; no port ⇒ 4822).                                                                                                                                    |
| `OIDC_ISSUER`                           | yes (server) | -                                    | OIDC issuer / discovery base, e.g. `http://localhost:8080/realms/ovc`, `https://ORG.okta.com`, `https://ORG.auth0.com`.                                                                                                                                                                                   |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | yes (server) | -                                    | A confidential OIDC client for this app.                                                                                                                                                                                                                                                                  |
| `OIDC_SCOPES`                           | no           | `openid profile email`               | Space-separated scopes to request.                                                                                                                                                                                                                                                                        |
| `OIDC_ROLES_CLAIM`                      | no           | `resource_access.${client_id}.roles` | Dot-path to the roles array in the token; `${client_id}` is substituted. Keycloak realm roles → `realm_access.roles`; Auth0/Okta → `roles` or a namespaced claim.                                                                                                                                         |
| `BETTER_AUTH_SECRET`                    | yes (server) | -                                    | 32-byte hex (`openssl rand -hex 32`) - seals the session cookies.                                                                                                                                                                                                                                         |
| `BETTER_AUTH_URL`                       | yes (server) | -                                    | Public URL of the auth endpoints, e.g. `http://localhost:3000/frontend-api/auth`.                                                                                                                                                                                                                         |
| `OVC_AUTH_MODE`                         | no (server)  | `oidc`                               | `stub` ⇒ skip OIDC, every request is `admin@ovc.debug.app` / `[ADMINISTRATOR]`. Same variable, same value as ovc-backend's `OVC_AUTH_MODE` - set both to `stub` and neither side needs an IdP. Works in every build, including `production`. When set, `OIDC_*` / `BETTER_AUTH_*` are not required.       |

Put them in `.env.local` (git-ignored). `.env.example` is the template.

```sh
# .env.local - against a local backend + infra-containers Keycloak
VITE_API_URL=http://localhost:3000/frontend-api/api
VITE_OIDC_PROVIDER_NAME=Keycloak
API_URL=http://localhost:8000/api
OIDC_ISSUER=http://localhost:8080/realms/ovc
OIDC_CLIENT_ID=ovc-frontend
OIDC_CLIENT_SECRET=...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000/frontend-api/auth
```

## Deploying behind one domain

The frontend and backend are meant to sit under a single hostname, split by a
reverse proxy on the `/api` prefix:

```
ovc.domain.net/         →  ovc-frontend   (SSR pages, assets, /frontend-api/*, /webrdp/tunnel)
ovc.domain.net/api/     →  ovc-backend    (the REST API)
```

Its own server surface is:

| Path                                   | Served by the frontend                                 |
| -------------------------------------- | ------------------------------------------------------ |
| `/`, `/inventory`, `/login`, …         | SSR page routes                                        |
| `/assets/*`                            | built JS / CSS                                         |
| `/frontend-api/fn/*`                   | server-function (RPC) calls                            |
| `/frontend-api/auth/*`                 | better-auth OAuth endpoints (OIDC redirect + callback) |
| `/frontend-api/api/*`                  | reverse proxy to `ovc-backend` (adds the bearer token) |
| `/webrdp/tunnel`                       | Guacamole HTTP tunnel, connected to guacd (see below)  |
| `/favicon.ico`, `/site.webmanifest`, … | files in `public/`                                     |

The browser only ever calls the frontend: REST goes through `/frontend-api/api/*`
(the frontend server then reaches `ovc-backend` at `API_URL`, container-to-container),
and the Guacamole tunnel is `/webrdp/tunnel` on the frontend itself (it reaches
guacd at `GUACD_URL`). So the public proxy needs just **one** rule -
the frontend - plus an optional `/api/` one for direct/manual access (curl,
Swagger). Leave `VITE_API_URL` and `VITE_WEBRDP_URL` unset (defaults
`/frontend-api/api` and `/webrdp`).

nginx sketch:

```nginx
server {
  server_name ovc.domain.net;

  location /api/ {
    proxy_pass http://ovc-backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://ovc-frontend:3000;   # the SSR server; also serves /webrdp/tunnel
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

**Consoles** need only a `guacd` container, reachable from the frontend's
server at `GUACD_URL` (default `localhost:4822`; any internal address, e.g. a
Compose service name or a ClusterIP Service - the browser never connects to
guacd. `scheme://host:port` URLs work too, only host and port are used). `src/routes/webrdp/tunnel.ts` is a plain server route, the same kind
as `frontend-api/api/$.ts`, that implements Guacamole's HTTP tunnel and speaks
the Guacamole protocol to guacd directly (`src/guacd/`). Its details:

- `connect` needs a signed-in session (or `OVC_AUTH_MODE=stub`); read/write are
  authorised by the per-tunnel token it hands out.
- Only ports 2179 (Hyper-V console) and 3389 (RDP) are accepted.
- Audio, drive redirection / file transfer and printing are always disabled in
  the guacd parameters, whatever the browser sends.
- Tunnels live in this process's memory: **run one replica, or use sticky
  sessions**. A tunnel with no traffic for 15 s is closed.

The `/frontend-api/fn` prefix for RPC is configured in `vite.config.ts`
(`tanstackStart({ serverFns: { base: '/frontend-api/fn' } })`); `/frontend-api/auth`
and `/frontend-api/api` are plain file routes under `src/routes/frontend-api/`.

## Scripts

| Command                         | What it does                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                   | Dev server with HMR on port 3000.                                                                                                                                   |
| `npm run build`                 | Production build → `.output/` (Nitro: `.output/public/` assets + self-contained `.output/server/index.mjs`, deps bundled in - no `node_modules` needed at runtime). |
| `npm run preview`               | Serve the production build locally (Vite).                                                                                                                          |
| `node .output/server/index.mjs` | Run the built server directly (what the Dockerfile's `CMD` does). Needs the same env vars as dev (`API_URL`, `OIDC_*`, `BETTER_AUTH_*`).                            |
| `npx tsc --noEmit`              | Type-check.                                                                                                                                                         |

## Project structure

```
src/
  styles/app.css              Win95 theme - @theme color tokens + @utility bevel
                              classes. Light-only, square corners; clean
                              anti-aliased system UI sans (12px base).

  components/win95/            Presentational Win95 primitives: Window, TitleBar,
                              MenuBar, Toolbar, TreeView, SplitPane, Tabs, GroupBox,
                              Table / PropertyList, ProgressBar, Button, TextField,
                              Select, StatusBar, Icon, ClientOnly. `bevel.ts` = cn()
                              helper + cva recipes.
  components/                 Login.tsx ("Sign in" card),
                              DefaultCatchBoundary, NotFound.

  auth/                       The single place auth logic lives.
    auth.ts                   better-auth client (cookie mode), genericOAuth via
                              OIDC discovery; getUserInfo → roles at OIDC_ROLES_CLAIM
    types.ts                  AuthUser / AuthContextValue
    roles.ts                  ADMIN_ROLE, isAdminRole/hasAnyRole, claimByPath/rolesFromClaims
    server.ts                 server fns: fetchCurrentUser, signInFn,
                              clearAuthCookies, logoutFn
    token.server.ts           getAccessToken() - server-only, used by the proxy
    bypass.ts                 OVC_AUTH_MODE=stub (server-only, every build)
    DevBypassWarning.tsx      standing warning dialog shown while bypass is active
    provider.tsx              <AuthProvider>; user / isAdmin / hasAnyRole / logout
    guard.ts                  requireAuth / requireAnyRole / requireAdmin
    useAuth.ts                useAuth() hook

  routes/frontend-api/        auth/$.ts  - better-auth OAuth endpoints
                              api/$.ts   - server proxy to ovc-backend (+ bearer)

  api/                        Typed HTTP layer.
    types.ts                  domain entities + enums (mirror of docs/api-contract.md)
    client.ts                 redaxios wrapper → /frontend-api/api, error envelope
    endpoints/*               thin per-resource request functions
    queries.ts                queryOptions() factories with polling intervals
    queryKeys.ts              central query-key factory

  features/inventory/         The Explorer screen.
    InventoryExplorer.tsx     window-shell composition
    InventoryMenuBar / InventoryToolbar / InventoryStatusBar
    selection.ts              selection is stored in the URL
                              (?sel=vm:<id>&tab=hardware)
    tree/                     tree model + InventoryTree + node icons
    detail/                   DetailPane + Cluster/Host/Vm detail + panels/ + VmGrid
    actions/                  power-action table, useVmPowerAction (optimistic
                              mutation), TaskWatcher, activeTasks + statusMessage
    tasks/                    TasksDock - the bottom "Recent Tasks" panel
    format.ts                 bytes / duration / time helpers

  routes/                     File-based routes (routeTree.gen.ts is generated).
    __root.tsx                providers, <head>, devtools; loads the current user
    index.tsx                 redirect → /inventory
    _authed.tsx               guard - requireAuth() → redirect to /login
    _authed/inventory.tsx     the Explorer route
    login.tsx / logout.tsx / signup.tsx

  router.tsx                  getRouter(): QueryClient in router context

docs/api-contract.md          The REST contract ovc-backend must implement.
```

## How it works

- **Layout** - one maximised Win95 window: menu bar, toolbar, a resizable split
  (left: Cluster → Host → Folder → VM tree; right: detail tabs for the selection),
  a full-width **Recent Tasks** dock, and a status bar.
- **Data** - TanStack Query polls the backend (clusters 30s, hosts 15s, VMs 10s).
  Route loaders prime the cache with `ensureQueryData` for a spinner-free first paint.
- **Power actions** are async: the UI flips the VM to a transitional state
  optimistically, the backend returns a `Task`, and `TaskWatcher` polls
  `GET /tasks/:id` until it finishes, then refetches inventory. Every task shows up
  in the Recent Tasks dock with initiator, progress, status and timestamps.
- **RBAC** (Cluster > Host > Folder) is enforced server-side - the frontend never
  sends an identity or a scope.

See [`LLM.md`](LLM.md) for a deeper architecture note and known gotchas, and
[`docs/api-contract.md`](docs/api-contract.md) for the backend API.

## Credits

The Win95/98 visual language inspired and some parts borrowed from
[**98.css**](https://github.com/jdan/98.css) by Jordan Scales (MIT licensed), big thanks!

The Windows XP and Windows 7 themes port colours and gradients from
[**XP.css**](https://github.com/botoxparty/XP.css) and
[**7.css**](https://github.com/khang-nd/7.css) (both MIT
licensed)
The Modern theme uses [shadcn/ui](https://ui.shadcn.com)'s zinc palette.
The VMware Nostalgia theme follows the colours and component styles of VMware's
[**Clarity Design System**](https://github.com/vmware-clarity/ng-clarity) (MIT licensed).

The Classic MacOS theme ports the Platinum colours, bevels, title bar, tabs and
scrollbars from [**MacOS9**](https://github.com/wieslawsoltes/MacOS9) by Wiesław
Šoltés and contributors (MIT licensed), a browser recreation of the Mac OS 9
desktop. It uses the [**ChicagoFLF**](https://fontlibrary.org/en/font/chicagoflf)
font by Robin Casady (public domain). No Apple artwork is included; Mac OS is a
trademark of Apple Inc., and this project is not affiliated with Apple.

The 16bit Overload theme takes its palette and pixel-frame style from
[**snes.css**](https://github.com/devMiguelCarrero/snes.css) by Miguel Carrero
(MIT licensed) and uses the
[**Press Start 2P**](https://fonts.google.com/specimen/Press+Start+2P) font
(SIL Open Font License).

## Disclaimer

Open vCenter is an independent, community-driven open source project. It is
not affiliated with, endorsed by, sponsored by or supported by Microsoft,
VMware, Broadcom or any other vendor whose products it works with or is
compared to.

Microsoft, Windows, Windows Server and Hyper-V are trademarks of the Microsoft
group of companies. VMware, ESXi, vSphere, vCenter and vMotion are trademarks
of Broadcom Inc. and/or its subsidiaries. All other trademarks belong to their
respective owners.

The "vCenter" in the project's name refers to
the general idea of a virtualization management center, not to VMware's
product.

The software is provided "as is", without warranty of any kind - see
[`LICENSE`](LICENSE). Use it at your own risk, and try it on machines you can
afford to lose before trusting it with the ones you cannot.
