# ovc-frontend

Web console for **Open vCenter** (Hyper-V manager). A single Win95-style "Explorer"
window: inventory tree on the left, a detail pane with tabs on the right, a Recent
Tasks dock and a status bar. It talks **only** to `ovc-backend` over REST, through
its own server proxy. Sibling services: `ovc-backend` (Python), `ovc-agent` (Go, on
each Hyper-V host, reached via RabbitMQ by the backend) and `guacd` (consoles: this
app's server serves the Guacamole HTTP tunnel itself, `src/routes/webrdp/tunnel.ts`
+ `src/guacd/`).

**Demo mode** (this `demo` branch only; CI publishes it as the `:demo` image;
`OVC_DEMO_MODE=true`, runtime env) runs it standalone for product
demos: no backend, and the login screen opens a demo session with no IdP (like
stub mode). `request()` hands every call to an in-browser simulator
(`src/demo/`) that keeps a random inventory in localStorage. See LLM.md › Demo mode.

**`LLM.md` is the full reference**: screens, every REST contract, the icon tables,
every business rule. Read the relevant section before changing behaviour. The REST
contract written for the backend team is `docs/api-contract.md`, reconciled with
the code on 2026-09-27; it holds the full error-code table.

## Commands

- Node 24 required. Commands: `npm run dev`, `npm run build`, and `npx tsc --noEmit`
  to typecheck. There are no automated tests.
- Releases: SemVer, tag without `v` (`0.1.2`). Load the `ovc-frontend-release`
  skill and follow it: `CHANGELOG.md` section, `npm version <patch|minor|major>`
  (bumps `package.json` + lock, commits, tags),
  `git push github main --follow-tags`, then a GitHub Release from the tag.
- Local backend: `docker compose up` in `../ovc-backend` with `OVC_AUTH_MODE=stub` on
  both sides. Set `VITE_API_URL=http://localhost:3000/frontend-api/api` in
  `.env.local`.
- No backend at all: `OVC_DEMO_MODE=true npm run dev`, or
  `docker compose -f docker-compose.demo.yml up --build`.
- Cloudflare Workers (the public demo): `NITRO_PRESET=cloudflare_module npm run
  build`, then `npx wrangler dev|deploy -c .output/server/wrangler.json`. Workers
  forbid random values, timers and I/O at module scope; the app screens stay
  `ssr: false` (10 ms CPU budget).

## Stack

TanStack Start (SSR) + Router (file routes in `src/routes/`; `routeTree.gen.ts` is
generated) + Query · React 19 · TS strict · Vite 8 · Tailwind v4 · lucide-react ·
redaxios · better-auth (OIDC, cookie mode) · ag-grid v36 (VM grid only) ·
guacamole-common-js · react-resizable-panels **v3** (pinned).

## Where things are

- `src/api/`: `types.ts` (entities), `client.ts` (`request()`, `ApiError`),
  `endpoints/*`, `queries.ts` (polling), `queryKeys.ts` (`qk`).
- `src/features/inventory/`: the Explorer. `tree/` (model, icons, VM search
  dialog), `detail/` (per-entity views, `VmActionsBar`, `HostActionsMenu`,
  `vmActions/`, `panels/`), `organize/` (dialogs, mutations, folder scope),
  `create/` (VM wizard), `actions/` (power, tasks, status bar), `tasks/`, `locks/`,
  `events/` (audit log, admin).
- `src/components/win95/`: UI primitives. `src/auth/`: all auth logic.
  `src/preferences/`: theme + tree behaviour cookies. `src/styles/`: tokens + themes.
- `src/demo/`: demo mode. `api.ts` (simulated endpoints), `sim.ts` (tasks + agent
  effects), `seed.ts` (random inventory), `metrics.ts`, `store.ts` (localStorage).

## Hard rules

- **English everywhere**: code, comments, UI copy, commits, docs.
- **Menu items have no trailing ellipsis** (`Hosts Management`, not
  `Hosts Management`) - menu bar, VM More ▾ and host Actions ▾ alike.
- **No `window.confirm` / `alert` / `prompt`.** Use `await confirm({...})` or
  `confirmWithCheckbox` from `features/inventory/confirm.tsx`. Report errors and
  outcomes with `statusMessage.set(...)`.
- **Theming is CSS only.** Use the `ui-*` classes / `bevel-*` utilities and the
  semantic colour tokens (`text-success`, `text-danger`, `bg-window`,
  `var(--color-chart-N)`, `bg-console-bg`, `bg-backdrop/20`, …). Never use raw
  hex, `black`/`white` utilities or hard-coded chrome, and never branch on the
  theme id (the only exception is `ScrollArea`). A new token needs a Classic value
  in `app.css`.
- **Icons**: `lucide-react` through the `Icon` wrapper only. **VM icons are always
  the transport set**: `Play` green, `Square` red, `Pause` amber (Saved = blue
  `Square`, Unknown = gray `Square`, transitional = same icon + `animate-pulse`).
  Reuse `tree/nodeIcons.tsx` `STATE_ICON` / `VmIcon` and `actions/powerActions.ts`.
- **HTTP only via `api/client.ts` `request()`** (`requestBlob()` for binary GETs
  such as the VM console thumbnail). A new call means an endpoint
  function, a type, a `queryOptions` factory with a `qk` key, an update to
  `docs/api-contract.md`, **and the matching handler in `src/demo/api.ts`** (plus
  `sim.ts` / `taskProfiles.ts` for a new agent function), so demo mode keeps working.
- **Reads use `useQuery`, not suspense**, so a backend outage shows "Disconnected"
  instead of crashing. Invalidate by prefix (`['vms']`, `['hosts']`, `['tasks']`).
- **Route VM operations by `vm.id`**, never by `vmUuid` (the Hyper-V GUID, which can
  repeat across hosts).
- **Don't add `@tanstack/react-router-with-query`**, and don't upgrade
  `react-resizable-panels` to v4.
- **Guards `redirect()`; they never throw.** ag-grid and Guacamole are client-only
  (`<ClientOnly>`, lazy import).
- **RBAC is server-side.** Never send an identity or scope. Admin-only UI is gated by
  `useAuth().isAdmin`.

## How operations work

- Agent-backed operations are **async**:
  1. `POST` returns `{ task }`;
  2. `activeTasks.add(task.id)`;
  3. `<TaskWatcher/>` polls `GET /tasks/:id` every 1.5 s;
  4. on a terminal status it sets the status message and invalidates
     `vms` / `tasks` / `hosts`.
- Power actions also set an optimistic transitional state and roll back on error.
- Organization changes (clusters, hosts, folders, VLANs, VM → folder, tags) are
  synchronous DB operations.
- The selection lives in the URL: `/inventory?sel=<kind>:<id>&tab=<tab>`. Dialogs
  open through the `organizeDialog` / `vmActionDialog` stores.

## Key business rules (details in LLM.md › Business rules)

- **Power matrix**:

  | Action    | Allowed from        |
  | --------- | ------------------- |
  | Start     | Off, Saved, Paused  |
  | Pause     | Running             |
  | Shut Down | Running             |
  | Turn Off  | Running, Paused     |
  | Restart   | Running             |
  | Delete    | Off, Saved          |

  Turn Off and Restart ask for confirmation. Delete asks with an opt-in "remove
  files" checkbox (`?remove_files=true`).
- **Locked VM** (`vm.lock`) or **offline host** (its VMs read `Unknown`, and the
  backend answers `409`): every VM action is disabled. The exceptions are
  admin-only "Force unlock" and DB-only "Remove from Inventory" (offline host only).
- **Off-only**: Rename, Clone, Export as Template, and most Edit VM settings (CPU,
  memory, nested virtualization, Secure Boot, auto-stop). AutoStart and notes are
  always editable.
- **Edit VM disks**: blocked while snapshots exist; a BIOS (gen 1) VM must be Off;
  the boot disk (`0:0`) can't be removed; an expanded size must be larger than the
  current one.
- **HA and Migrate**: clustered hosts only; Migrate needs `highlyAvailable`.
- **Storage placement**: a clustered host → Cluster Shared Volumes only; a standalone
  host → any volume except `C:`, unless the Hyper-V default VM path is on C:
  (`vmStorageTargets`).
- **Folders**: flat, scoped to one cluster or one standalone host. A VM only moves
  into folders of its host's scope. Deleting a folder detaches its VMs; changing a
  host's cluster clears its VMs' folders. Only an **empty** cluster can be deleted.
- **Tags**: a global catalog that only admins manage (File ▸ Tag Management). A tag
  is standalone or in one category, and a VM holds **at most one tag per category**.
  Names are `[A-Za-z0-9_-]{1,64}`, unique per category (case-insensitive). Each tag
  has a colour from a fixed 10-name palette (tokens `--color-tag-<name>` / `-fg`;
  render it through `organize/TagChip.tsx`). Deleting a tag removes it from its VMs;
  deleting a category also deletes its tags. Anyone who can see a VM can tag it
  (Summary ▸ Tags ▸ Assign Tag…), even while it is locked.
- **VM wizard**:
  - names: `[A-Za-z0-9_-]+`; disk names: 1–6 alphanumerics;
  - memory: ≥ 256 MB, and dynamic memory needs 1 GB ≤ min ≤ startup ≤ max;
  - clone sources must be Off with a `vmUuid`;
  - a template deploys to its own host or to that host's cluster;
  - HA is offered only on a clustered host.
- **Host actions**: Pause/Resume Node and Restart Host are admin-only. Restart is
  blocked while VMs run or while a cluster node isn't Paused. A host whose agent has
  never checked in shows only the "Setup Agent" tab (plus "Events" for an admin).
- **Audit log** (admin only): View ▸ Events History and an **Events** tab on
  clusters, hosts and VMs (`GET /audit-events`, cursor-paged). Every successful
  mutation invalidates `['audit-events']` (router `MutationCache`).
- **Consoles**: the VM console needs the host online, a host FQDN/IP and the VM's
  `vmUuid` (Guacamole port 2179, `security=vmconnect`), and is unavailable while the
  VM is Off or Paused (Console tab greyed out, Summary console buttons disabled);
  the host console uses RDP on 3389. The tunnel always disables audio, drive /
  file transfer and printing, accepts only ports 2179 / 3389, and keeps tunnels in
  process memory (one replica or sticky sessions).

## Keep docs in sync (always, no need to ask)

Every change ships with its doc update:

- a contract, icon, business rule, screen, route, env var or token changed → update
  the matching section of `LLM.md`;
- a hard rule or a headline business rule changed → update this file too;
- the REST surface changed (endpoint, body, param, response, error code, polling) →
  update `docs/api-contract.md` and the demo simulator (`src/demo/`).

A new rule violation you can't fix right away goes in `LLM.md` › Known deviations.
