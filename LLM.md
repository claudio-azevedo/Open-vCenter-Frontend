# ovc-frontend - context for LLMs

Web console for **Open vCenter**, a vCenter-style manager for Hyper-V. Part of a
multi-service suite:

- **ovc-backend** (Python) - owns Postgres + Valkey, talks to agents over RabbitMQ,
  exposes the REST API this frontend consumes.
- **ovc-agent** (Go, Windows) - runs on each Hyper-V host, executes operations,
  replies over RabbitMQ.
- **ovc-webrdp** (Java, Guacamole tunnel servlet + guacd) - browser consoles
  (Hyper-V VM console on port 2179, host RDP on 3389).
- **ovc-frontend** (this repo) - talks to `ovc-backend` over REST only, through
  its own server proxy. It never touches RabbitMQ.

Companion docs: `CLAUDE.md` (short working summary of this file),
`docs/api-contract.md` (REST contract written for the backend team),
`README.md` (setup and deployment).

## Conventions

- All code, comments, identifiers, commit messages, docs and UI copy are in
  **English**, regardless of the language a contributor chats in.
- Keep this file current. A change to a contract, icon, business rule or screen
  updates the matching section here, and `CLAUDE.md` when it touches a headline rule.
- A change to the REST surface also updates `docs/api-contract.md`.

## Stack

- **TanStack Start** (SSR) + **TanStack Router** (file-based routes in `src/routes/`,
  `src/routeTree.gen.ts` is generated) + **TanStack Query** (polling, task tracking).
- **React 19**, **TypeScript** (strict), **Vite 8**.
- **Tailwind CSS v4** via `@tailwindcss/vite`: `src/styles/app.css` plus one file
  per theme in `src/styles/themes/`.
- **ag-grid-community v36**: used only for the VM list grid (`VmGrid`, client-only).
- **lucide-react**: the only icon library.
- **redaxios**: HTTP.
- **better-auth** (cookie mode, no DB): OIDC login.
- **guacamole-common-js**: in-page RDP / Hyper-V console.
- **react-resizable-panels v3** (pinned), **class-variance-authority** + `clsx` +
  `tailwind-merge` (`cn()`).
- **Node 24** required. devDependencies alias `typescript` to a TS 6/7 preview, and
  `npx tsc --noEmit` works under it. Scripts: `npm run dev | build | preview`. There
  are no automated tests.

---

## How the application works

### Routes

| Route                    | What                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `/`                      | redirect → `/inventory`                                                                                  |
| `/login`                 | "Sign in" card, with a Theme dropdown                                                                    |
| `/logout`                | clears the session                                                                                      |
| `/access-denied`         | signed in, but the token carries zero roles                                                              |
| `/inventory` (`_authed`) | the Explorer. Search params `?sel=<kind>:<id>&tab=<tabId>`                                               |
| `/console` (`_authed`)   | standalone console in its own browser tab: `?vm=<vmId>` (Hyper-V console) or `?host=<hostId>` (host RDP) |
| `/frontend-api/api/*`    | server proxy → ovc-backend. Injects the OIDC bearer                                                 |
| `/frontend-api/auth/*`   | better-auth OAuth endpoints (sign-in, callback, sign-out)                                                |
| `/frontend-api/fn/*`     | TanStack Start server functions                                                                          |
| `/webrdp/tunnel`         | server proxy → ovc-webrdp (`WEBRDP_ORIGIN`, read per request)                                       |

### The Explorer window

`features/inventory/InventoryExplorer.tsx` is a single Windows-style window titled
"Open vCenter". Closing it signs you out. From top to bottom it contains:

1. **Menu bar** (`InventoryMenuBar.tsx`):
   - **File**: Cluster Management…, Hosts Management…, Agent Management… (admin),
     Tag Management… (admin), Refresh (labelled F5; invalidates every query), Sign Out.
   - **Action**: Move VM to Folder… (needs a VM selected with ≥ 1 reachable folder),
     Move Host… (needs a host selected), Delete Folder… (needs a folder selected).
   - **View**: Refresh, Task History…, VM Locks… (admin).
   - **Preferences**: Theme ▸ (5 themes), Tree Behavior ▸ (Collapsed / Expanded).
   - **Help**: About Open vCenter…, plus Auth Debug… in dev builds only.
2. **Split pane**: tree toolbar + inventory tree on the left, detail pane on the right.
3. **Recent Tasks dock** (`tasks/TasksDock.tsx`).
4. **Status bar** (`InventoryStatusBar.tsx`), with these panels in order:
   - a transient message (`statusMessage` store, default "Ready");
   - "N tasks running";
   - the selection as `kind: id`;
   - "H hosts · V VMs";
   - the connection state: `● Connected` (green), `Refreshing…`, or `● Disconnected`
     (accent). Disconnected shows only when the clusters, hosts and VMs queries all
     fail and no data is cached.

Mounted once inside the Explorer: `<TaskWatcher/>`, `<OrganizeDialogs/>`,
`<VmActionDialogs/>`, `<ConfirmHost/>`. The `/console` route mounts its own
`<TaskWatcher/>`, `<VmActionDialogs/>` and `<ConfirmHost/>`.

### Inventory tree (`tree/treeModel.ts`, `tree/InventoryTree.tsx`)

Built from `/clusters`, `/hosts`, `/folders`, `/vms` and `/templates`:

```
<cluster>                    Layers icon
  <host>…                    leaf nodes (a clustered host has no children)
  Templates                  pseudo-folder, only if the cluster's hosts have templates
    <template>…              sorted by name
  <folder>…                  cluster-scoped folders, each holding its VMs (from any member host)
  <vm>…                      loose cluster VMs (no folder, or a folder outside this cluster)
<standalone host>            at the ROOT, after every cluster (no wrapper node)
  Templates                  only if the host has templates
  <folder>…                  host-scoped folders with their VMs
  <vm>…                      loose VMs
```

- **Node ids**, which are also the `?sel=` value: `cluster:<id>`, `host:<id>`,
  `folder:<id>`, `vm:<id>`, `template:<id>`, and `templatefolder:host:<id>` or
  `templatefolder:cluster:<id>`. Each `TreeView` row carries its id as
  `data-node-id`.
- Folders are always expandable (`hasChildren: true`), even when empty.
- **Tree toolbar**, from left to right:
  - **Refresh**: invalidates clusters, hosts, vms, folders and vlans.
  - **New VM**: disabled when no host is online. Pre-targeted by `useNewVmTarget`.
  - **New Cluster**: opens Cluster Management.
  - **New Host**: opens Hosts Management.
  - **New Folder**: shown only while a **host** is selected.
  - **Search VMs**: pinned to the right end. Opens the VM search dialog.
- **VM search dialog** (`tree/VmSearchDialog.tsx`):
  - Filters the cached `GET /vms` list (`vmsQuery()`) in the browser. It sends no
    request of its own, and the backend has no name filter.
  - The match is a case-insensitive substring of the VM name. Nothing is searched
    until the trimmed query has **3 characters**.
  - Results are sorted by name (natural order), then by host. They show in pages
    of **10**, with the columns Name · State (`VmIcon` + state) · Host.
  - The results area has a fixed height, so the dialog doesn't resize while you
    type.
  - Reopening the dialog restores the last query, pre-selected.
  - Clicking a VM name closes the dialog and selects `vm:<id>`. The tree then
    opens the VM's ancestors and scrolls its row into view (`block: 'nearest'`).

### Detail pane (`detail/DetailPane.tsx`)

| Selection                                                  | Header (icon · title · subtitle · actions)                                                     | Tabs / body                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none                                                       | -                                                                                              | `EmptyDetail`: "Select a cluster, host, or virtual machine."                                                                                                                                                                      |
| cluster                                                    | Layers · name · "N host(s) · M VM(s)"                                                          | **Hosts** (click a row to select the host) · **VM Startup Ordering** · **Virtual Networks** (cluster VLANs)                                                                                                                       |
| host whose agent was never seen (`agent.lastSeen == null`) | host icon · name · fqdn · Console                                                              | **Setup Agent** only                                                                                                                                                                                                              |
| host whose agent checked in at least once                  | host icon · name · fqdn · [Update Agent → vX] [Actions ▾] [Console]                            | **Summary** (Host Information + hardware) · **Virtual Machines** (ag-grid) · **Host Metrics** · **Configuration** (VM Startup Ordering, Network Adapters, Virtual Switches, Virtual Networks, Fibre Channel Adapters) · **Tasks** |
| folder                                                     | Folder · name · "Cluster: X" or "Host: Y" · Delete                                             | VM count + VM table (click a row to select the VM)                                                                                                                                                                                |
| templatefolder                                             | Folder · "Templates" · scope                                                                   | template table (click a row to select the template)                                                                                                                                                                               |
| template                                                   | Package · name · "cluster › host" · Deploy new VM…                                             | property list + notes                                                                                                                                                                                                             |
| vm                                                         | state icon · name · "state · firmware" · power buttons, Refresh, Console ▾, More ▾, lock badge | **Summary** · **VM Metrics** (only when `metricsEnabled`) · **Snapshots** · **Console** · **Tasks**                                                                                                                               |

The VM **Summary** tab (`panels/VmSummaryPanel.tsx`) stacks: the offline-host notice,
Virtual Machine Information + Configuration, Advanced, then **Notes** and **Tags**
side by side (half width each, `VmTagsBox`), then Network adapters and Disks.

The active tab lives in `?tab=`. An unknown tab falls back to the first one.
Selecting a node of the same kind keeps the current tab; selecting a node of a
different kind resets it.

### Async operations (the task model)

Every agent-backed operation is asynchronous:

1. The mutation returns `{ task }` (`202`), or `{ vm, task }` (`201`) for create
   and clone.
2. The task id goes into the `activeTasks` store (`actions/activeTasks.ts`), and the
   task is seeded into the cache at `qk.task(id)`.
3. `<TaskWatcher/>` polls every active task with `GET /tasks/:id` every 1.5 s until
   the task reaches a terminal status (`succeeded` / `failed` / `timeout`).
4. On a terminal status, the watcher:
   - removes the id from the store;
   - sets the status bar to `"<label> completed"`, `"<label> completed - <advisory>"`
     (a succeeded task that carries `error`), or `"<label> failed|timeout: <error>"`;
   - invalidates `['vms']`, `['tasks']` and `['hosts']`, plus `['templates']` after
     `vm_export_template`.

Power actions also flip the VM to a transitional state optimistically
(`useVmPowerAction`). On error they roll back and refetch the VMs, which brings back
the real state and lock (for example after `VM_LOCKED`).

Organization mutations (clusters, hosts, folders, VLANs, moving a VM to a folder) are
synchronous DB operations. They invalidate `clusters/hosts/folders/vlans/vms` and set
the status message (`organize/mutations.ts`). Tag mutations are synchronous too: catalog
writes invalidate `tags/tag-categories/vms`; `useSetVmTags` writes the returned VM into
`qk.vm(id)` and invalidates `vms` and `tags`.

Components read data with `useQuery` (not suspense), so a backend outage degrades to
"Disconnected" instead of throwing. The `/inventory` loader calls `ensureQueryData`
for clusters, hosts and VMs to give SSR a first paint, and swallows any error.

### Tasks UI

- **Recent Tasks dock**:
  - Polls `GET /tasks` every 1.5 s while any task is active, otherwise every 4 s.
  - Shows at most 15 rows and drops finished tasks older than 1 h.
  - Columns: Task, Target, Initiated by, Progress, Details (`progressMessage` while
    running, `error` once terminal), Status, Started, Completed, and a **Details**
    button that opens `TaskDetailsDialog`.
  - `TaskDetailsDialog` shows the full `TaskDetail`, including the raw agent
    request/response payloads, with a Copy button.
  - The collapsed state is stored in `localStorage` under `ovc-tasks-dock-collapsed`.
- **Task History** (View menu): `GET /tasks?limit=200`, polled every 10 s. Free-text
  search over the task label, kind, target, user and status.
- **Tasks tab** on a VM or host: `GET /tasks?vmId=` or `?hostId=`, polled every 6 s.
- **Progress bar**: uses `task.progress` when the agent reports it; otherwise
  queued = 0, running = 50, terminal = 100 (`taskProgress`). It is indeterminate
  while the task is queued.

---

## Contracts

### REST: frontend → ovc-backend

**Transport**: browser → `/frontend-api/api/*` (same origin, session cookie) → server
proxy (`routes/frontend-api/api/$.ts`) → `${API_URL}`. The proxy adds
`Authorization: Bearer <access token>`. Only the `content-type`,
`content-disposition` and `content-length` headers are passed back.

`api/client.ts` `request<T>()` (redaxios, `withCredentials`) is the only HTTP entry
point. To add a call:

1. add a thin function in `api/endpoints/<resource>.ts`;
2. add or extend the types in `api/types.ts`;
3. add a `queryOptions` factory in `api/queries.ts`, using a key from
   `api/queryKeys.ts`;
4. update `docs/api-contract.md`.

- JSON is camelCase, timestamps are ISO-8601 UTC, and lists are bare arrays.
- IDs are opaque strings:
  - `vm.id` (backend UUID) routes every VM operation;
  - `vm.vmUuid` is the Hyper-V GUID. It is null until the agent reports the VM, and
    the console and `.rdp` file need it;
  - `host.shortId` is the agent's queue prefix and the `host_id` in `config.ini`.
    It is for display only.
- **Errors**: the backend returns `{ error: { code, message, details? } }`, which the
  client throws as `ApiError(status, code, message, details)`. The UI shows
  `error.message` in the status bar. Codes by source (the full table with HTTP
  statuses and triggers is in `docs/api-contract.md` › Error codes):

  | Source                    | Codes                                                                                                                                                                                                                |
  | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | client                    | `NETWORK` (status 0, "Backend unreachable"), `HTTP_ERROR`                                                                                                                                                            |
  | proxy                     | `401 UNAUTHORIZED` (no session), `502 NETWORK`                                                                                                                                                                       |
  | backend, generic          | `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `UNKNOWN_ACTION`, `INVALID`, `VALIDATION_ERROR`, `INTERNAL`                                                                                                             |
  | backend, VMs              | `VM_LOCKED`, `VM_NOT_READY`, `HOST_OFFLINE`, `HOST_ONLINE`, `HA_REQUIRED`, `STORAGE_NOT_ALLOWED`, `SOURCE_NOT_OFF`, `CROSS_HOST_CLONE`, `TEMPLATE_UNREACHABLE`                                                       |
  | backend, hosts and agents | `NOT_CLUSTERED`, `HOST_ACTION_IN_PROGRESS`, `DUPLICATE`, `TOO_LARGE`, `STORAGE_ERROR`, `ACTIVE_BINARY`, `AGENT_UPGRADE_IN_PROGRESS`, `AGENT_ALREADY_CURRENT`, `NO_ACTIVE_AGENT_BINARY`, `AGENT_DOWNLOAD_UNAVAILABLE` |
  | backend, tags             | `DUPLICATE` (name in use), `TAG_CONFLICT` (two tags of one category on a VM), `INVALID` (bad name)                                                                                                                  |

#### Endpoints the frontend calls (source of truth: `src/api/endpoints/*`)

| Resource     | Method & path                                                           | Body / query                                                                                                         | Response                                               |
| ------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| clusters     | `GET /clusters` · `GET /clusters/:id`                                   | -                                                                                                                    | `Cluster[]` · `Cluster`                                |
|              | `POST /clusters`                                                        | `{ name }`                                                                                                           | `Cluster`                                              |
|              | `PATCH /clusters/:id`                                                   | `{ name }`                                                                                                           | `Cluster`                                              |
|              | `DELETE /clusters/:id`                                                  | - (empty cluster only)                                                                                               | `204`                                                  |
| hosts        | `GET /hosts`                                                            | `?clusterId`                                                                                                         | `Host[]`                                               |
|              | `GET /hosts/:id`                                                        | -                                                                                                                    | `HostDetail` (+ `hardware`)                            |
|              | `GET /hosts/:id/vms` · `/metrics` · `/templates` · `/isos`              | -                                                                                                                    | `Vm[]` · `HostMetricSample[]` · `Template[]` · `Iso[]` |
|              | `GET /hosts/:id/agent-config` (admin)                                   | -                                                                                                                    | `HostAgentConfig`                                      |
|              | `GET /hosts/:id/agent-install-url` (admin)                              | -                                                                                                                    | `HostAgentInstall`                                     |
|              | `POST /hosts`                                                           | `{ name, clusterId }`                                                                                                | `HostDetail`                                           |
|              | `PATCH /hosts/:id`                                                      | any of `{ name, fqdn, clusterId }` (`clusterId: null` = standalone)                                                  | `HostDetail`                                           |
|              | `DELETE /hosts/:id`                                                     | - (cascades)                                                                                                         | `204`                                                  |
|              | `POST /hosts/:id/actions/update-agent`                                  | `{ binaryId: string \| null }`                                                                                       | `{ task }`                                             |
|              | `POST /hosts/:id/actions/<action>`                                      | action ∈ `suspend`, `suspend_drain`, `resume`, `resume_fallback`, `restart`, `refresh_hardware`, `refresh_inventory` | `{ task }`                                             |
| folders      | `GET /folders`                                                          | `?hostId&clusterId`                                                                                                  | `Folder[]`                                             |
|              | `POST /folders`                                                         | `{ name, clusterId? \| hostId? }` (exactly one)                                                                      | `Folder`                                               |
|              | `PATCH /folders/:id` · `DELETE /folders/:id`                            | `{ name }` · -                                                                                                       | `Folder` · `204`                                       |
| vlans        | `GET /vlans`                                                            | `?hostId&clusterId` (hostId → host + cluster VLANs)                                                                  | `Vlan[]`                                               |
|              | `POST /vlans`                                                           | `{ name, vlanId, description?, isDefault?, clusterId? \| hostId? }`                                                  | `Vlan`                                                 |
|              | `PATCH /vlans/:id` · `DELETE /vlans/:id`                                | any of `{ name, description, isDefault }` · -                                                                        | `Vlan` · `204`                                         |
| vms          | `GET /vms`                                                              | `?hostId&folderId&state`                                                                                             | `Vm[]`                                                 |
|              | `GET /vms/:id` · `GET /vms/:id/metrics`                                 | -                                                                                                                    | `Vm` · `VmMetricSample[]`                              |
|              | `POST /vms`                                                             | `VmCreateBody`                                                                                                       | `201 { vm, task }`                                     |
|              | `POST /vms/clone`                                                       | `VmCloneBody` (`source: 'vm' \| 'template'`)                                                                         | `202 { vm, task }`                                     |
|              | `PATCH /vms/:id`                                                        | `{ folderId: string \| null }`                                                                                       | `Vm`                                                   |
|              | `POST /vms/:id/actions/<action>`                                        | `{ params }` (omitted when there are no params)                                                                      | `202 { task }`                                         |
|              | `DELETE /vms/:id`                                                       | `?remove_files=true` to also wipe the files                                                                          | `202 { task }`                                         |
|              | `DELETE /vms/:id/from-inventory`                                        | - (DB only)                                                                                                          | `{ removed }`                                          |
|              | `PUT /vms/:id/tags`                                                     | `{ tagIds: string[] }` (the complete set; ≤ 1 per category)                                                          | `Vm`                                                   |
| tags         | `GET /tag-categories` · `GET /tags`                                     | -                                                                                                                    | `TagCategory[]` · `Tag[]` (with `vmCount`)             |
|              | `POST /tag-categories` · `PATCH /tag-categories/:id` (admin)            | `{ name }`                                                                                                           | `TagCategory`                                          |
|              | `DELETE /tag-categories/:id` (admin)                                    | - (also deletes its tags)                                                                                            | `204`                                                  |
|              | `POST /tags` · `PATCH /tags/:id` (admin)                                | `{ name, categoryId, color }` · any of `{ name, categoryId, color }` (`null` = standalone)                           | `Tag`                                                  |
|              | `DELETE /tags/:id` (admin)                                              | -                                                                                                                    | `204`                                                  |
| vm locks     | `GET /vm-locks` · `DELETE /vm-locks/:vmId` · `DELETE /vm-locks` (admin) | -                                                                                                                    | `VmLockEntry[]` · `{ released }`                       |
| tasks        | `GET /tasks`                                                            | `?vmId&hostId&status&limit` (limit: default 50, max 200)                                                             | `Task[]` (newest first)                                |
|              | `GET /tasks/:id`                                                        | -                                                                                                                    | `TaskDetail`                                           |
| images       | `GET /templates` · `GET /isos`                                          | -                                                                                                                    | flat cross-host lists                                  |
| agent builds | `GET /agent-binaries` · `GET /agent-binaries/storage` (admin)           | -                                                                                                                    | `AgentBinary[]` · `AgentStorageInfo`                   |
|              | `POST /agent-binaries` (admin)                                          | multipart: `file`, `version`, `hypervisor?`, `notes?`, `makeActive?`                                                 | `AgentBinary`                                          |
|              | `PATCH /agent-binaries/:id` · `DELETE /agent-binaries/:id`              | any of `{ notes, isActive }` · -                                                                                     | `AgentBinary` · `204`                                  |
|              | `POST /agent-binaries/:id/rollout`                                      | `{ hostIds: string[] \| null }` (null = every outdated online host)                                                  | `{ tasks, skipped[] }`                                 |

#### VM action wire params (`POST /vms/:id/actions/<action>` → agent `AgentRequest.params`)

Power actions (`start`, `stop`, `shutdown`, `restart`, `pause`) take no params. The
management actions take these params, in snake_case:

| Action                                 | Task kind                                  | Params                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rename`                               | `vm_rename`                                | `new_name`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `edit`                                 | `vm_edit`                                  | **changed keys only**: `cpu_count`, `memory_mb`, `memory_dynamic`, `memory_min_mb`, `memory_max_mb`, `nested_virtualization`, `secure_boot`, `secure_boot_template`, `automatic_start`, `automatic_start_delay`, `automatic_stop`, `notes`, `add_nic[{name, vlan_id, switch_name?}]`, `edit_nic[{nic_id, name?, vlan_id?, switch_name?}]`, `remove_nic[{nic_id}]`, `add_disk[{path, type, size_gb}]`, `edit_disk[{path, size_gb}]`, `remove_disk[{path, delete_from_disk}]`. `vlan_id: 0` = untagged |
| `migrate`                              | `vm_migrate`                               | `target_host` (a node name from `hardware.cluster.nodes`)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `move_storage`                         | `vm_move`                                  | `destination_storage`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `startup_change`                       | `vm_startup_change`                        | `automatic_start` (`Nothing` / `StartIfRunning` / `Start`), `automatic_start_delay` (s)                                                                                                                                                                                                                                                                                                                                                                                                              |
| `mount_dvd` · `eject_dvd`              | `mount_dvd` · `eject_dvd`                  | `path` · -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `enable_ha` · `disable_ha`             | same                                       | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `export_template`                      | `vm_export_template`                       | `template_name`, `notes?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `notes_edit`                           | `notes_edit`                               | `notes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `snapshot_create`                      | `snapshot_create`                          | `name?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `snapshot_remove` · `snapshot_restore` | same                                       | `snapshot_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `enable_metrics` · `disable_metrics`   | `vm_enable_metrics` · `vm_disable_metrics` | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `refresh`                              | `refresh_status`                           | - (re-inventory one VM; takes no lock)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Task `kind` → display label: `tasks/taskLabels.ts` (`KIND_LABELS`). An unknown kind
is shown raw, so add a label whenever the backend adds a kind.

#### Keeping `docs/api-contract.md` in sync

`docs/api-contract.md` was reconciled with the frontend code, the ovc-backend routes
and the ovc-agent handlers on 2026-09-27. It holds the full error-code table, the
clone/deploy preconditions, the host-action errors, the storage placement errors and
the polling table. Any change to an endpoint, body, param, response, error code or
polling interval updates it in the same change.

Every VM management action is implemented by ovc-agent; none are stubs anymore. A
task whose agent never answers still ends as `timeout` through the backend sweeper.

### Query keys and polling (`api/queryKeys.ts`, `api/queries.ts`)

| Data                                   | Key                                                                              | Refetch                                |
| -------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| clusters / cluster                     | `['clusters']` / `['clusters', id]`                                              | 30 s                                   |
| hosts / host / host VMs / host metrics | `['hosts', {clusterId}]` / `['hosts', id]` / `[… , 'vms']` / `[…, 'metrics']`    | 15 s (host VMs 10 s)                   |
| host templates / ISOs                  | `['hosts', id, 'templates' \| 'isos']`                                           | no polling                             |
| agent config / install URL             | `['hosts', id, 'agent-config' \| 'agent-install']`                               | staleTime 5 min / 30 s (tokenized URL) |
| folders                                | `['folders', params]`                                                            | 15 s                                   |
| vlans                                  | `['vlans', params]`                                                              | no polling                             |
| tags / tag categories                  | `['tags']` / `['tag-categories']`                                                | 30 s                                   |
| vms / vm / vm metrics / locks          | `['vms', params]` / `['vms', id]` / `['vms', id, 'metrics']` / `['vms','locks']` | 10 s                                   |
| task                                   | `['tasks', id]`                                                                  | 1.5 s until terminal                   |
| VM or host tasks                       | `['tasks', {vmId} \| {hostId}]`                                                  | 6 s                                    |
| recent tasks (dock)                    | `['tasks', {}]`                                                                  | 1.5 s while any active, else 4 s       |
| task history                           | `['tasks', 'history']`                                                           | 10 s                                   |
| templates / isos (flat)                | `['templates']` / `['isos']`                                                     | 15 s / none                            |
| agent binaries / storage               | `['agent-binaries']` / `['agent-binaries', 'storage']`                           | 30 s / none                            |

Always invalidate by prefix: `['vms']`, `['hosts']`, `['tasks']` and so on.

### URL, state and UI-module contracts

- **Selection** lives in the URL: `/inventory?sel=<kind>:<id>&tab=<id>`. It is
  validated by `validateInventorySearch` and updated with `replace: true` by
  `useInventorySelection().select()` / `.setTab()`.
- **Console tabs**: `vmConsoleTabUrl(id)` → `/console?vm=`, `hostConsoleTabUrl(id)` →
  `/console?host=`. Both open with `window.open(url, '_blank', 'noopener')`.
- **Module-level stores** use `useSyncExternalStore`, not React context:
  - `activeTasks`: task ids in flight.
  - `statusMessage`: the status bar text.
  - `organizeDialog` (`organize/dialogStore.ts`): `cluster-management`,
    `host-management`, `agent-management`, `tag-management`,
    `new-folder {clusterId?|hostId?}`,
    `new-vm {clusterId?, hostId?, mode?: 'new'|'template'|'clone', sourceVmId?, templateId?}`,
    `move-vm`, `move-host`, `delete-folder`.
  - `vmActionDialog` (`detail/vmActions/dialogStore.ts`): `rename`,
    `edit {tab?: general|network|disks}`, `migrate`, `move-storage`, `autostart`,
    `mount-dvd`, `export-template`, `notes`, `snapshot-create`.

  Each store keeps at most one open dialog.

- **Confirmations** (`features/inventory/confirm.tsx`):
  - `await confirm({ title, message, confirmLabel?, cancelLabel?, danger? })` →
    `boolean`;
  - `await confirmWithCheckbox({ …, checkbox: { label, defaultChecked?, danger? } })`
    → `{ confirmed, checked }`.

  `danger` makes the confirm button bold.

- **Cookies**: `ovc-theme` and `ovc-tree-behavior` (1 year, `SameSite=Lax`, `Secure`
  on https), readable during SSR. **localStorage**: `ovc-tasks-dock-collapsed` only.

### Environment variables

| Variable                                                                                   | Side             | Purpose                                                                                     |
| ------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------- |
| `API_URL`                                                                                  | server           | ovc-backend base URL (e.g. `http://localhost:8000/api`)                                     |
| `VITE_API_URL`                                                                             | client           | API base as seen by the browser. Default `/frontend-api/api`; absolute in split-origin dev  |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_SCOPES?`, `OIDC_ROLES_CLAIM?` | server           | OIDC provider (discovery). The roles claim defaults to `resource_access.${client_id}.roles` |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                                                    | server           | better-auth                                                                                 |
| `VITE_OIDC_PROVIDER_NAME?`                                                                 | client           | login button label                                                                          |
| `OVC_AUTH_MODE=stub`                                                                       | server           | auth bypass (set the same value on ovc-backend)                                             |
| `VITE_WEBRDP_URL`                                                                          | client           | Guacamole base. Default `/webrdp`                                                           |
| `WEBRDP_ORIGIN`                                                                            | server (runtime) | where `/webrdp/tunnel` proxies to (the ovc-webrdp base, including its path)                 |

---

## Icons

- **Library**: `lucide-react` only. Always render icons through `Icon` from
  `~/components/win95`: default `size` 16, `strokeWidth` 2, `aria-hidden`, `shrink-0`.
- **Components** take a `LucideIcon` type: `Button icon=`, `ToolbarButton icon=`,
  `MenuItemDef.icon`.
- **Colors** come from semantic tokens only:

  | Token                | Use                |
  | -------------------- | ------------------ |
  | `text-success`       | green              |
  | `text-danger`        | red                |
  | `text-warning`       | amber              |
  | `text-info`          | blue               |
  | `text-disabled-text` | gray               |
  | `text-accent`        | accent             |
  | `text-fg`            | default foreground |
  | `text-title-text`    | title bar text     |
  | `text-running`       | running tasks      |
  | `text-notice-text`   | notices            |

- **Usual sizes**: tree nodes 16 (VM 13, template 14); header and menu buttons 14;
  table and tree-toolbar buttons 13; empty state 28; console placeholder 32.
- **Rule: VM iconography is one set of transport-control icons everywhere**: `Play`
  (green), `Square` (red) and `Pause` (amber). Reuse `VmIcon` / `STATE_ICON` and
  `POWER_ACTIONS`, and never introduce alternatives.

### Entity icons (`tree/nodeIcons.tsx`)

| Entity                                         | Icon                   | Color                            |
| ---------------------------------------------- | ---------------------- | -------------------------------- |
| Cluster (`ClusterIcon`)                        | `Layers`               | `text-accent`                    |
| Host online / offline (`HostIcon`)             | `Server` / `ServerOff` | `text-fg` / `text-disabled-text` |
| Folder, Templates pseudo-folder (`FolderIcon`) | `Folder`               | `text-warning`                   |
| Template (`TemplateIcon`, 14 px)               | `Package`              | `text-info`                      |
| VM (`VmIcon`, 13 px)                           | by state (next table)  | by state                         |
| App window (title bar)                         | `HardDrive`            | `text-title-text`                |

### VM state icon (`STATE_ICON`; used in the tree and the VM detail header)

A transitional state uses the same icon plus `animate-pulse`.

| State                                      | Icon     | Color                     |
| ------------------------------------------ | -------- | ------------------------- |
| Running · Starting · Resuming · Restarting | `Play`   | green `text-success`      |
| Off · Stopping · Deleting                  | `Square` | red `text-danger`         |
| Paused · Pausing                           | `Pause`  | amber `text-warning`      |
| Saved · Saving                             | `Square` | blue `text-info`          |
| Unknown                                    | `Square` | gray `text-disabled-text` |

### Power actions (`actions/powerActions.ts`)

| Action     | Label     | Icon        | Color | Offered from       | Confirmation                                   |
| ---------- | --------- | ----------- | ----- | ------------------ | ---------------------------------------------- |
| `start`    | Start     | `Play`      | green | Off, Saved, Paused | -                                              |
| `pause`    | Pause     | `Pause`     | amber | Running            | -                                              |
| `shutdown` | Shut Down | `Power`     | -     | Running            | -                                              |
| `stop`     | Turn Off  | `Square`    | red   | Running, Paused    | "Unsaved data in the guest will be lost."      |
| `restart`  | Restart   | `RotateCcw` | -     | Running            | "Restart this VM?"                             |
| `delete`   | Delete    | `Trash2`    | red   | Off, Saved         | danger + checkbox "Also delete all its files…" |

VM grid batch actions: **Power On** `Play` (green) · **Power Off** `Power` (red).

### Icons by screen

| Where                                    | Item → icon                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tree toolbar                             | Refresh `RefreshCw` · New VM `MonitorUp` · New Cluster `Network` · New Host `Server` · New Folder `FolderPlus` · Search VMs `Search`                                                                                                                                                                                                                                                          |
| VM search dialog                         | field `Search` · state column `VmIcon` · Previous / Next page `ChevronLeft` / `ChevronRight`                                                                                                                                                                                                                                                                                                  |
| VM header                                | Refresh `RefreshCw` · Console ▾ `Monitor` (Open HTML5 console in new tab `ExternalLink`, Download .rdp file `Download`) · More ▾ `MoreHorizontal` · lock badge `Lock`                                                                                                                                                                                                                         |
| VM "More" menu                           | Edit VM `Pencil` · Rename `TextCursorInput` · Edit Notes `Pencil` · Move to Folder `FolderInput` · Move Storage `HardDrive` · Edit AutoStart `AlarmClock` · Mount / Eject DVD `Disc` · Migrate `Move` · Enable HA `ShieldCheck` · Disable HA `ShieldX` · Clone `Copy` · Export as Template `FileUp` · Enable / Disable Metrics `Gauge` · Remove from Inventory `Trash2` · Force unlock `Lock` |
| VM Summary                               | Edit Network… `Network` · Edit Disks… `HardDrive` · Assign Tag… `Tag` · tag chip `Tag` · remove a tag `X`                                                                                                                                                                                                                                                                                    |
| Host header                              | Console `Monitor` · Actions ▾ `MoreHorizontal`                                                                                                                                                                                                                                                                                                                                                |
| Host Actions menu                        | Refresh Hardware `Cpu` · Refresh VMs `RefreshCw` · Resume Node `Play` · Pause Node `Pause` · Restart Host `Power` (danger item)                                                                                                                                                                                                                                                               |
| Console toolbar (`GuacamoleConsole`)     | Disconnect `Unplug` · Reconnect `RefreshCw` · Clipboard `Clipboard` · Ctrl+Alt+Del `Keyboard` · Fullscreen `Maximize2`                                                                                                                                                                                                                                                                        |
| Console VM controls (`ConsoleVmActions`) | Start `Play` · Shut Down `Power` · Turn Off `Square` · Restart `RotateCcw` · Mount DVD `Disc` · Eject DVD `DiscAlbum`                                                                                                                                                                                                                                                                         |
| Console unavailable | `MonitorOff` (`text-console-muted` on `bg-console-bg`, text `text-console-fg`)                                                                                                                                                                                                                                                                                                                |
| Cluster / Hosts / Tag Management tables  | Rename / Edit `Pencil` · Delete / Remove `Trash2` · Save `Check` · Cancel `X` · Create / Add `Plus`                                                                                                                                                                                                                                                                                           |
| Virtual Networks panel                   | Add VLAN `Plus` · Edit `Pencil` · Delete `Trash2`                                                                                                                                                                                                                                                                                                                                             |
| Create VM wizard                         | add disk / New VLAN `Plus` · remove disk `Trash2`                                                                                                                                                                                                                                                                                                                                             |
| Edit VM dialog                           | add NIC / disk `Plus` · remove `Trash2` · Undo `RotateCcw` · notices `TriangleAlert`                                                                                                                                                                                                                                                                                                          |
| VM Startup Ordering                      | per-row Edit `ArrowUpWideNarrow`                                                                                                                                                                                                                                                                                                                                                              |
| Agent Management                         | Delete build `Trash2` · "up to date" `Check`                                                                                                                                                                                                                                                                                                                                                  |
| VM Locks dialog                          | `Lock` · Refresh `RefreshCw` · Release all `Trash2`                                                                                                                                                                                                                                                                                                                                           |
| Recent Tasks dock                        | title `ListChecks` · collapse / expand `ChevronDown` / `ChevronUp`                                                                                                                                                                                                                                                                                                                            |
| Task History / Task Details              | Search `Search` · Refresh `RefreshCw` · Copy `Copy`                                                                                                                                                                                                                                                                                                                                           |
| Window title bar                         | Minimize `Minus` · Maximize `Square` · Close `X`                                                                                                                                                                                                                                                                                                                                              |
| Misc                                     | Login `KeyRound` · Access denied `ShieldAlert` · Dev-bypass warning `TriangleAlert` · Empty detail `MousePointerClick`                                                                                                                                                                                                                                                                        |

### Status colors

| What                                                    | Colors                                                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Task status (`statusClass`)                             | succeeded `text-success` · failed / timeout bold `text-danger` · running `text-running` · queued `text-disabled-text`                     |
| Status bar connection                                   | Connected `text-success` · Disconnected `text-accent`                                                                                     |
| Console connection dot (`GuacamoleConsole` `STATE_DOT`) | connecting `bg-warning` · connected `bg-success` · disconnected `bg-disabled-text` · error `bg-danger`                                    |
| Console display and overlays                            | `bg-console-bg` (overlay `bg-console-bg/80`) · text `text-console-text` · detail `text-console-subtle` · error title `text-console-error` |
| Metric chart series                                     | `var(--color-chart-1…5)`: CPU 1, memory 2, network rx 3 / tx 4, disk 5                                                                    |

---

## Business rules

### Access control

- Roles come from the OIDC token at `OIDC_ROLES_CLAIM`:
  - no session → `/login`;
  - a session with zero roles → `/access-denied`;
  - `ADMINISTRATOR` = full access; any other role gets in and is scoped by the backend.
- RBAC (Cluster > Host > Folder scope grants) is enforced **server-side**. Lists come
  back pre-filtered and forbidden reads return `403 FORBIDDEN`. The frontend never
  sends an identity or a scope.
- **Admin-only UI** (`useAuth().isAdmin`):
  - File ▸ Agent Management;
  - File ▸ Tag Management (creating, renaming and deleting tags and categories;
    assigning tags to a VM is open to anyone who can see the VM);
  - View ▸ VM Locks;
  - "Force unlock (admin)";
  - the host "Update Agent → vX" button;
  - Pause / Resume Node and Restart Host;
  - the data behind the Setup Agent tab (admin-only endpoints).
- Everything else is visible to any role, and the backend has the final say.

### Clusters and hosts

- **Hypervisor**: every cluster is hypervisor-homogeneous. Only `hyperv` exists today.
- **Cluster Management** (File menu, or tree toolbar New Cluster): create, rename,
  delete. **Only an empty cluster can be deleted**: `hostCount > 0` disables the
  button, and the backend answers `400 INVALID` otherwise. Deleting a cluster also
  drops its folders; their VMs are detached.
- **Hosts Management**:
  - **Add** a host with a name and an optional cluster. FQDN and IP are filled in
    by the agent on its first check-in. The backend provisions the RabbitMQ queues
    and the agent user.
  - **Edit** the name, override the FQDN, or change the cluster (standalone allowed).
  - **Changing a host's cluster clears every folder assignment of its VMs and drops
    its host-scoped folders.** The UI warns about this in both Hosts Management and
    Move Host.
  - **Remove** cascades: VM records, host-scoped folders, templates and ISOs are
    deleted. The physical host is not touched, and the confirmation says so.
- **Online/offline**: a host reads `online: false` once its agent has not sent
  `agent_status` for `agent_offline_after_seconds` (backend setting, default 120 s).

### Folders

- Folders are logical and app-created: flat (no nesting), scoped to exactly one
  cluster **or** one standalone host, and never reported by the agent.
- **New Folder scope** (`organize/scope.ts` `folderScopeForSelection`):

  | Selection       | Folder scope          |
  | --------------- | --------------------- |
  | cluster         | that cluster          |
  | clustered host  | its cluster           |
  | standalone host | that host             |
  | folder          | the same scope        |
  | VM              | resolved via its host |

  The UI entry point is the tree toolbar **New Folder**, shown while a host is
  selected.

- **Moving a VM**:
  - A VM can only go into folders reachable from its host: cluster folders when the
    host is clustered, otherwise the host's own folders (`useVmFolderTargets`).
  - "Move to Folder" is disabled when no such folder exists; "(no folder)" removes
    the VM from its folder.
  - It is `PATCH /vms/:id {folderId}`, a DB-only change with no agent involved.
- **Deleting a folder** detaches its VMs; they are not deleted. If the folder was
  selected, the selection clears.

### VLANs (Virtual Networks)

- VLANs are application-managed 802.1Q definitions:
  - name: required; the wizard's quick-add also restricts it to `[A-Za-z0-9_-]+`;
  - tag: 1–4094, **immutable after creation**;
  - optional description;
  - `isDefault`.
- **Scope**: a cluster or a standalone host. A clustered host uses its cluster's
  VLANs, so the host Configuration ▸ Virtual Networks section shows the cluster list.
- Setting `isDefault` clears it on the other VLANs of the scope. Deleting a VLAN
  does not change VMs already tagged with it.
- "Untagged" = no VLAN: `vlanId: null` in create/clone bodies, `vlan_id: 0` in
  `vm_edit` NIC specs.

### Tags

- **Catalog** (`organize/TagManagementDialog.tsx`, File ▸ Tag Management…, admin):
  global, not scoped to a cluster or host. A tag is standalone or belongs to one
  **category**; a VM carries **at most one tag per category** (e.g. OS: Windows /
  Linux / Others / Appliances; Datacenter: Datacenter-1…3).
- **Colour**: every tag has one from a fixed palette of 10 names (`TAG_COLORS` in
  `api/types.ts`: gray, red, orange, yellow, green, teal, blue, navy, purple, pink;
  the backend rejects anything else with `INVALID`). Each name maps to the theme
  tokens `--color-tag-<name>` (background) and `--color-tag-<name>-fg` (text), with
  Classic values in `app.css`; no raw colour is stored or rendered. New tags default
  to blue; tags created before colours existed are gray. `organize/TagChip.tsx` holds
  `TagChip` (the coloured `Tag`-icon label used everywhere), `ColorSwatch` and
  `TagColorDropdown`.
- **Names** (tags and categories): `[A-Za-z0-9_-]`, 1–64 characters, no spaces
  (`organize/tags.ts` `TAG_NAME_RE`; the backend re-checks). Unique
  case-insensitively: categories among categories, tags within their category,
  standalone tags among standalone tags. The dialog shows the rule under an invalid
  name and disables Create; backend errors (`DUPLICATE`, `TAG_CONFLICT`) show inline
  in red.
- The dialog has a Categories table (Name · Tags · VMs) and a Tags table (the tag as a
  chip · Category · VMs) with a **Show** filter (all / standalone / one category);
  picking a category in the filter makes it the default for a new tag. New tag = name ·
  category · colour. Editing a tag can rename it, recolour it and move it to another
  category (or make it standalone); the backend refuses the move with `TAG_CONFLICT`
  when a VM would end up with two tags of that category.
- **Deleting a tag** removes it from every VM (the VMs stay). **Deleting a category
  deletes its tags** too, so they leave every VM. Both confirm first and give the
  number of affected VMs (`vmCount` is counted within the caller's scope).
- **VM Tags box** (`detail/panels/VmTagsBox.tsx`, Summary tab): the VM's tags as
  coloured chips laid straight on the group box (no field around them), labelled
  `Category: Tag` (category part dimmed) or just `Tag`, in catalog order, each with a
  remove `X`, under an **Assign Tag…** button at the top right.
  Any user who can see the VM may tag it. It is a DB-only `PUT /vms/:id/tags`, so it
  stays enabled while the VM is locked or its host is offline.
- **Assign Tags dialog** (`detail/panels/AssignTagsDialog.tsx`, local state of the
  Tags box): a Filter field (tag or category name) over the tags the VM doesn't have,
  grouped one section per category ("one per VM", plus "replaces X" when the VM
  already has one) and then "Standalone tags", each row a checkbox · chip · VM count.
  Ticking a tag unticks any other tag of its category. **Assign (N)** sends one PUT
  that adds the ticked tags and drops the VM's current tag of each touched category.
  Admins also get **Manage Tags…**, which closes it and opens Tag Management.
- Tags stay on the VM through inventory refreshes and in-cluster migrations; clones
  and new VMs start untagged.

### VM power actions

- The state → allowed-actions matrix is in the "Power actions" table above. A Paused
  VM resumes with `start`.
- The buttons are disabled while the mutation is pending, while the VM is in a
  transitional state, or while it is locked. When no action applies (transitional
  or `Unknown`), the header shows the state text instead of buttons.
- **Optimistic states**: start → Starting, stop/shutdown → Stopping, restart →
  Restarting, pause → Pausing, delete → Deleting.
- **Delete** asks for a danger confirmation with the checkbox "Also delete all its
  files and folders from disk", which sends `DELETE /vms/:id?remove_files=true`.
- **Console toolbar** (`ConsoleVmActions`): Start only when Off; Shut Down, Turn Off
  and Restart only when Running, each with a confirmation.
- **Batch** (host ▸ Virtual Machines grid):
  - only Running or Off VMs are selectable;
  - the first selected row locks the state, so a batch is all Running (Power Off)
    or all Off (Power On);
  - one request per VM (`start` / `stop`), since there is no batch endpoint;
  - a confirmation lists the VMs, and partial failures are reported by name.

### VM locks

- Every mutating agent task locks the VM for the task's lifetime:
  `vm.lock = {taskId, kind, requestedBy, acquiredAt}`. Meanwhile the backend answers
  `409 VM_LOCKED`.
- **UI while locked**:
  - a `Lock` badge "<task label>…" in the VM header (the tooltip shows who and when);
  - the power buttons and every "More" item are disabled;
  - Edit VM shows a notice and cannot save.
- **Admin tools**:
  - "Force unlock (admin)" in the More menu (danger confirmation);
  - View ▸ VM Locks… lists every lock with its TTL and task status, a per-row force
    unlock, and "Release all". A failed release shows inline in the dialog (the
    status bar sits behind the modal) and is mirrored to the status bar.
- Locks release at the task's terminal status, or on their own after a TTL.

### Offline hosts and `Unknown` VMs

- When a host is offline, all its VMs read `Unknown`, and every agent-backed call
  returns `409 HOST_OFFLINE`.
- **UI**:
  - every More item is disabled and the Console menu is hidden;
  - Refresh only invalidates the cache (no task is queued);
  - **Remove from Inventory…** appears.
- **Remove from Inventory** is `DELETE /vms/:id/from-inventory`: a DB-only delete
  behind a danger confirmation, after which the host becomes selected.
  - The backend refuses it with `409 HOST_ONLINE` if the host is online and has
    reported the VM (the next inventory would recreate it).
  - A never-reported placeholder (`vmUuid: null`) can always be removed.

### VM "More" menu (`detail/VmActionsBar.tsx`)

When the VM is locked or its host is offline, every item below is disabled.

| Item                     | Available when                                                                                                                                            | Result                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Edit VM…                 | always                                                                                                                                                    | Edit VM dialog → `vm_edit`                 |
| Rename VM…               | VM **Off**. OK stays disabled while the name is empty or unchanged                                                                                        | `vm_rename`                                |
| Edit Notes…              | always                                                                                                                                                    | `notes_edit`                               |
| Move to Folder…          | ≥ 1 reachable folder                                                                                                                                      | `PATCH /vms/:id`                           |
| Move Storage…            | ≥ 1 allowed volume other than the current one                                                                                                             | `vm_move`                                  |
| Edit AutoStart…          | always                                                                                                                                                    | `vm_startup_change`                        |
| Mount DVD… / Eject DVD   | Mount when `dvdPath` is empty (pick one of the host's ISOs); Eject when a DVD is mounted (confirmation)                                                   | `mount_dvd` / `eject_dvd`                  |
| Migrate VM…              | shown only on a clustered host; enabled only when `highlyAvailable` (otherwise "(requires HA)"). The target is another node from `hardware.cluster.nodes` | `vm_migrate`                               |
| Enable HA / Disable HA   | clustered host only (confirmation)                                                                                                                        | `enable_ha` / `disable_ha`                 |
| Clone VM…                | shown only when the VM is **Off**                                                                                                                         | wizard in clone mode                       |
| Export as Template…      | VM **Off**. Name `[A-Za-z0-9_-]+`, optional notes                                                                                                         | `vm_export_template`                       |
| Enable / Disable Metrics | toggles on `metricsEnabled`                                                                                                                               | `vm_enable_metrics` / `vm_disable_metrics` |
| Remove from Inventory…   | host offline only                                                                                                                                         | DB-only delete                             |
| Force unlock (admin)     | VM locked **and** the user is an admin                                                                                                                    | `DELETE /vm-locks/:vmId`                   |

- **Header Refresh**: runs the `refresh` action (the agent re-inventories this VM,
  with no lock). When the host is offline it only invalidates the cache.
- **Console ▾**: shown only when the host is online, the host has an FQDN or IP, and
  the VM has a `vmUuid`. It offers:
  - "Open HTML5 console in new tab" → `/console?vm=`;
  - "Download .rdp file" → `<vm name>.rdp`, which targets the host on port 2179 with
    `pcb:s:<vmUuid>` and `negotiate security layer:i:0`.
- **Snapshots tab**: Create snapshot… (optional name), Restore (confirmation) and
  Remove (danger confirmation), sending `snapshot_*` with `snapshot_id`.

### Create / Clone / Deploy wizard (`create/CreateVmDialog.tsx`)

**Flow**

- Three steps: **Identification → Configuration → Review**. You can jump back only to
  steps already reached, and Next needs the current step to be valid.
- Three modes: **New VM**, **Deploy from template**, **Clone from VM**. Opening the
  wizard from a template ("Deploy new VM…") or from a VM ("Clone VM…") locks the
  mode and the source.
- **Pre-targeting** (`useNewVmTarget`):
  - host selected → that host, fixed;
  - cluster selected → the cluster's hosts, defaulting to the first one;
  - VM selected → its host;
  - folder selected → its scope;
  - nothing selected → free choice.
- The host dropdown reads "<name> - N running" and is sorted by fewest running VMs.
  **New VM** is disabled when no host is online.

**Identification step**

- **Name** must match `^[a-zA-Z0-9_-]+$`.
- **Clone sources**: VMs that are **Off and have a `vmUuid`**. The target host is
  forced to the source VM's host.
- **Deploy targets**: the template's own host plus the members of its cluster.
- Sizing (vCPU, memory, notes, the VLAN of the first NIC, nested virtualization) is
  prefilled once per source.
- **Storage** is required and always sent explicitly (see _Storage placement_):
  - the default is the volume that holds the Hyper-V default VM path, when allowed;
    otherwise the volume with the most free space;
  - when no volume is allowed, the wizard shows an error and cannot proceed;
  - a "VM path" preview mirrors the agent's `resolveVMFolder` (see the table below).

  | Destination                            | VM path preview          |
  | -------------------------------------- | ------------------------ |
  | none                                   | `<defaultVmPath>\<name>` |
  | a CSV                                  | `<CSV>\VMS\<name>`       |
  | the same volume as the default VM path | `<defaultVmPath>\<name>` |
  | any other volume                       | `<X:>\HyperV\VMS\<name>` |

**Configuration step**

- **New-VM-only fields**:
  - OS: windows / linux / other;
  - firmware: UEFI (default) or BIOS;
  - disks;
  - virtual switch: defaults to the host's first vSwitch;
  - DVD ISO: from the host's ISO list, or "None".
- **CPU**: 1–256 (default 2).
- **Memory**:
  - startup ≥ 256 MB (default 4096; the UI edits it in GB);
  - dynamic memory (new VMs only) requires 1 GB ≤ min ≤ startup ≤ max (defaults
    1024 / 8192). Clone and deploy never send dynamic memory.
- **Disks** (new VMs): at least one; the default is `OS` / Fixed / 60 GB.
  - Name: alphanumeric, 1–6 characters. It becomes `<vm>-<disk>.vhdx`.
  - Size ≥ 1 GB.
  - Type: Fixed (recommended) or Dynamic.
- **Clone and deploy** copy disks, firmware and NICs from the source. Deploy adds
  "Expand disks to Fixed" (checked by default).
- **HA**: the checkbox appears only when the target host is in a cluster;
  `haEnabled` is forced to false otherwise.
- **Nested virtualization**: a checkbox.
- **VLAN**:
  - "Untagged" or one of the scope's VLANs;
  - a new VM preselects the scope's default VLAN;
  - "New VLAN" quick-adds one in the host's scope (the cluster when clustered) and
    selects it.

**Review step and submit**

- A checkbox "Start the VM once it is created/ready" sets `startNow`.
- Submit calls `POST /vms` (`201`) or `POST /vms/clone` (`202`). The backend inserts
  a placeholder VM (`vmUuid: null`, `Unknown`) and returns it with the task; if the
  task fails, the backend removes the placeholder.
- The backend re-checks the wizard's rules and answers with a code the status bar
  shows: `SOURCE_NOT_OFF`, `VM_NOT_READY`, `CROSS_HOST_CLONE`,
  `TEMPLATE_UNREACHABLE`, `STORAGE_NOT_ALLOWED`, `HOST_OFFLINE`.

### Storage placement (`detail/vmActions/storage.ts`, mirrors the backend check)

- **Clustered host**: only Cluster Shared Volumes (`X:\ClusterStorage\<Volume>`). A
  host counts as clustered when it has an app `clusterId` **or** reports
  `hardware.cluster.clustered`.
- **Standalone host**: every reported volume except the system drive `C:`. The
  exception: C: is allowed when the Hyper-V default VM path is on it, and the agent
  then uses that path, never the drive root.
- One entry per location. `storageKey` is the CSV path or the drive letter,
  lowercased.
- **Move Storage** targets are the allowed volumes minus the one the VM is on (its
  config path, or else its first disk).
- These rules apply to create, clone, deploy and move alike.

### Edit VM (`detail/vmActions/EditVmDialog.tsx`, tabs General / Network / Disks)

- **Save**: the dialog sends only the changed keys. Save is disabled when nothing
  changed, when there are validation errors, while the VM is locked, and while the
  request is pending.

**General tab**

- **Off-only settings** (disabled while the VM runs):
  - vCPU;
  - memory in whole GB, at least 1 GB;
  - static / dynamic memory with min ≤ startup ≤ max and min ≤ max;
  - nested virtualization;
  - **Secure Boot** and its template (Windows / Linux / Others (UEFI CA)). These
    are UEFI-only: a BIOS (generation 1) VM cannot enable them;
  - automatic stop: Turn off / Shut down (recommended) / Save state.
- **Always editable**:
  - automatic start: Nothing / Start if it was running (recommended) / Always start;
  - the start delay, sent only when the start action is not Nothing;
  - notes.

**Network tab**

- Add a NIC: name restricted to `[A-Za-z0-9 _-]`, plus VLAN and switch.
- Edit an existing NIC's name, VLAN or switch.
- Remove a NIC: it is marked, and the removal applies on save. Undo reverts it.
- The switch options are the host's vSwitches plus any switch a NIC already uses.

**Disks tab**

- **Blocked entirely while the VM has snapshots.**
- **BIOS (generation 1) VM**: the disks sit on the IDE controller, so the VM must be
  Off to add, expand or remove disks.
- **Running UEFI VM**: add and expand work live; removing a disk shows a danger
  warning.
- **Boot disk** (controller location `0:0`) can never be removed.
- **Expand**: the new size must be greater than the current one (GB, rounded up).
  The default is current + 10.
- **New disk**: name of 1–6 alphanumerics; the path is
  `<folder of the first disk>\<vm>-<name>.vhdx`.
- **Remove** has an optional "delete file". Saving with any removal requires a
  danger confirmation that lists the paths.

### Templates, ISOs and metrics

- **Templates** are agent-inventoried exports, one list per host. They appear in the
  tree only where they exist.
  - Export: the VM must be Off and the name must match `[A-Za-z0-9_-]+`.
  - Deploy: see the wizard.
- **ISOs** are per-host lists, used by Mount DVD and by the wizard's DVD drive. There
  is no ISO or template management screen.
- **Host Metrics**: the tab is always present once the agent has checked in. Charts:
  CPU %, memory %, network rx/tx bps, disk latency ms.
- **VM Metrics**: the tab appears only when `metricsEnabled`, toggled from the More
  menu.
  - Charts: CPU %, memory, network, disk.
  - `diskBytes` and the `net*Bytes` values are cumulative counters, so the charts
    diff consecutive samples.
- Both keep the last hour of samples, oldest first.

### Host operations (`detail/HostActionsMenu.tsx`)

The Actions menu appears only after the agent has responded at least once.

- **Refresh Hardware** / **Refresh VMs**: open to any user; disabled while the agent
  is disconnected.
- **Admin, clustered hosts only**:
  - **Pause Node…**: only when the node state is `Up`. The "Drain roles" checkbox
    picks `suspend_drain`, otherwise `suspend`.
  - **Resume Node…**: shown when the node state is `Paused`. The "Failback" checkbox
    picks `resume_fallback`, otherwise `resume`.
- **Admin: Restart Host…** (danger confirmation) is disabled while any VM is Running
  (the label shows the count), and on a cluster node unless the node is Paused. The
  agent re-checks both conditions.
- Every host action returns a task that goes to `activeTasks`.
- The backend re-checks the rules:
  - `NOT_CLUSTERED`: a node action on a host that isn't a cluster node;
  - `HOST_ACTION_IN_PROGRESS`: a disruptive action (suspend / resume / restart) is
    already running;
  - `HOST_OFFLINE`;
  - `403`: a non-admin sent a disruptive action.

### Agent onboarding and management (admin)

- **New host**: until the agent checks in, the host shows only the **Setup Agent** tab.
  - A tokenized elevated-PowerShell one-liner comes from
    `GET /hosts/:id/agent-install-url`. The link is short-lived; the tab offers
    Regenerate and Copy.
  - The installer creates `C:\Program Files\ovc-agent`, downloads and checksums the
    agent, writes `config.ini`, installs the service and opens the config.
  - The operator sets the two storage paths and runs `Start-Service ovc-agent`.
  - The tab also shows `config.ini` (`GET /hosts/:id/agent-config`), which carries
    the per-host RabbitMQ credentials.
  - The tab disappears once `agent.lastSeen` is set.
- **Agent Management dialog**:
  - **Binary storage**: read-only info (`local` / `s3`).
  - **Upload**: `.exe` only; version required; optional notes; optional "make
    active".
  - **Active build**: a radio per hypervisor (with confirmation).
  - **Roll out**: confirmation, then queues an upgrade on every online outdated host
    and reports "N queued, M skipped".
  - **Delete**: disabled for the active build; the backend answers `409
ACTIVE_BINARY`.
  - **Hosts section**: shows each host's version against the active build, with
    either "up to date" or an Update button. Update is disabled when there is no
    active build, the host is already current, or it is disconnected.
- **Host header "Update Agent → <version>"**: shown to admins when the agent is
  connected, an active build exists for the host's hypervisor, and its version
  differs. It asks for confirmation; the agent then restarts itself in drain mode.

### Console access

- **Hyper-V VM console**: requires the host to be online, a host FQDN or IP, and the
  VM `vmUuid`.
  - Available as the embedded Console tab or in its own browser tab (`/console?vm=`).
  - A Win95 credentials form asks for host Windows credentials. On submit,
    `<ClientOnly>` mounts `GuacamoleConsole`, which lazy-imports
    `guacamole-common-js`.
  - It connects through `HTTPTunnel(${VITE_WEBRDP_URL}/tunnel)` with
    `hostname=<fqdn|ip>&port=2179&vm-guid=<vmUuid>&security=vmconnect`.
  - The toolbar holds the VM power and DVD controls, then Disconnect, Reconnect,
    Clipboard, Ctrl+Alt+Del and Fullscreen, with a status bar and connecting/error
    overlays.
- **Host RDP console**: the host header's Console button (host online, with an
  address) opens `/console?host=`, which connects on port 3389 with `security=any`.
- **Tunnel routing**: the browser calls `/webrdp/tunnel` on the same origin, and
  `src/routes/webrdp/tunnel.ts` proxies it to `WEBRDP_ORIGIN`. In split-origin dev,
  `VITE_WEBRDP_URL` can point straight at ovc-webrdp, which sends permissive CORS.

---

## Themes

Five visual themes: **Windows Classic** (`classic`, the default), **Windows XP**
(`xp`), **Windows 7** (`win7`, Aero glass via `backdrop-filter`), **Modern (Light)**
(`modern-light`) and **Modern (Dark)** (`modern-dark`).

- **Persistence**: the `ovc-theme` cookie. The root route's `beforeLoad` reads it
  (`getPreferences()`, isomorphic), so SSR renders `<html data-theme="…">` without a
  flash of the default theme.
- **Picking a theme**: the login screen's "Theme" dropdown, or Preferences ▸ Theme
  (`useTheme().setTheme`).
- **A theme is CSS only.** Rules for new UI code:
  - visuals a theme may change go through a `ui-*` class (`ui-btn`, `ui-field`,
    `ui-menu`, `ui-tab`, `ui-toolbar`, …) or a `bevel-*` utility (`bevel-raised`,
    `bevel-sunken`, `bevel-thin-raised`, `bevel-thin-sunken`, `bevel-pressed`,
    `bevel-window`), whose look comes from custom properties. Never hard-code chrome
    with Tailwind colour or shadow utilities;
  - colours are semantic tokens only: `fg`, `window`, `surface`, `surface-2`,
    `accent`, `success`, `danger`, `danger-bg`, `warning`, `info`, `info-bg`,
    `running`, `notice-bg`, `notice-text`, `selection`, `selection-text`,
    `disabled-text`, `link`, `line`, `bevel-*`, `title-*`,
    `var(--color-chart-1..5)`, the tag palette `tag-<color>` / `tag-<color>-fg`
    (through `organize/TagChip.tsx` only), the remote-console set `console-bg`, `console-fg`,
    `console-muted`, `console-text`, `console-subtle`, `console-error` (a screen,
    not chrome, so themes leave them alone), and `backdrop` (the modal backdrop,
    used as `bg-backdrop/20`). No raw hex values, and no `black`/`white` palette
    utilities, in components;
  - a new token needs a Classic value in `app.css`; themes override only what
    differs.
- Components never branch on the theme id. The one exception is `ScrollArea`, which
  renders a native scroller for themes with `nativeScrollbars` (the two Modern
  themes).

## Tree behaviour

**Preferences ▸ Tree Behavior** (`ovc-tree-behavior` cookie):

- `Collapsed` (the default) opens nothing.
- `Expanded` opens every top-level node and every cluster's hosts, but never folders.

The preference seeds the tree on the first populated render, and again when the
preference changes. Data refetches do not re-seed it, so manual expand/collapse
sticks. In both modes the ancestors of the selected node are opened, so a deep link
(`?sel=vm:…`) is never hidden. See `initialExpansion` in `tree/treeModel.ts`.

Selecting a node later does not expand the tree, with one exception: a VM picked
in the **VM search dialog**. `InventoryTree` adds that VM's `ancestorsOf` to the
expanded set, keeping whatever else is open, then scrolls the row into view.

## Layout / architecture

```
src/
  styles/app.css              Token contract with Windows Classic values: @theme colour
                              tokens, component custom properties (--btn-*, --titlebar-*,
                              --menu-*, ...), @utility bevel classes, semantic `ui-*` classes.
  styles/themes/              xp.css, win7.css, modern.css (light + dark) - each only
                              redefines tokens under :root[data-theme='<id>'].
  preferences/                cookies.ts, theme.ts (THEMES), treeBehavior.ts,
                              getPreferences.ts (SSR + client), provider.tsx
                              (useTheme / useTreeBehavior).
  components/win95/           Presentational primitives: Window, TitleBar, MenuBar, Menu,
                              Toolbar (+ToolbarButton/Separator), TreeView, SplitPane, Tabs,
                              GroupBox, Table/Th/Td/PropertyList, ProgressBar, Button,
                              TextField, Select, Dropdown, Dialog, StatusBar(+Panel),
                              ScrollArea, Icon, ClientOnly. bevel.ts = cn() + cva recipes.
  components/                 Login.tsx, DefaultCatchBoundary, NotFound.
  auth/                       The ONLY place auth logic lives (see Auth).
  api/                        types.ts (entities, mirror of docs/api-contract.md),
                              client.ts (request + ApiError), endpoints/* (clusters, hosts,
                              folders, vlans, tags, vms, tasks, inventory, agentBinaries),
                              queries.ts (queryOptions + polling), queryKeys.ts (qk).
  features/inventory/         The Explorer.
    InventoryExplorer.tsx     window shell composition
    InventoryMenuBar.tsx      File / Action / View / Preferences / Help
    InventoryStatusBar.tsx    status bar
    selection.ts              URL-backed selection (?sel=&tab=)
    useNewVmTarget.ts         New VM pre-targeting + "any host online"
    confirm.tsx               confirm() / confirmWithCheckbox() + <ConfirmHost/>
    format.ts                 bytes, bitsPerSec, duration, relTime, dateTime,
                              shortDateTime, uptimeSince, percent, timeOnly, clock
    AboutDialog, AuthDebugDialog (dev only)
    tree/                     treeModel.ts, InventoryTree.tsx (+ tree toolbar), nodeIcons.tsx,
                              VmSearchDialog.tsx (tree toolbar › Search VMs)
    organize/                 dialogStore, mutations (all org + create/clone mutations),
                              scope (folder scope / reachable folders), OrganizeDialogs
                              (new folder, move VM, move host, delete folder, new VM),
                              ManagementDialogs (Cluster / Hosts Management),
                              AgentManagementDialog
    create/                   CreateVmDialog (new / template / clone wizard + New VLAN)
    detail/                   DetailPane, DetailHeader, EmptyDetail, ClusterDetail,
                              HostDetail, FolderDetail, TemplatesFolderDetail,
                              TemplateDetail, VmDetail, VmActionsBar (More menu),
                              VmPowerButtons, HostActionsMenu, HostAgentUpdateButton,
                              VmGrid (ag-grid + batch power)
      vmActions/              dialogStore, VmActionDialogs (rename, migrate, move storage,
                              autostart, mount DVD, export template, notes, snapshot),
                              EditVmDialog, storage.ts (placement rules), diskPath.ts
      panels/                 VmSummary, VmMetrics, VmSnapshots, VmConsole, VmTasks
                              (TasksPanel), HostHardware(+Details), HostMetrics,
                              HostConfiguration, HostSetupAgent, HostAgent, HostConsole,
                              VirtualNetworks, VmStartupOrdering, SectionList, MetricChart,
                              GuacamoleConsole, ConsoleVmActions, webrdp.ts, rdpFile.ts
    actions/                  powerActions, useVmPowerAction, useVmBatchPowerAction,
                              useVmManagementAction, TaskWatcher, activeTasks, statusMessage
    tasks/                    TasksDock, TaskHistoryDialog, TaskDetailsDialog, taskLabels
    locks/                    VmLocksDialog (admin)
  routes/
    __root.tsx                providers (QueryClientProvider, AuthProvider, Preferences),
                              <head>, devtools. beforeLoad loads user + preferences.
    index.tsx                 redirect → /inventory
    _authed.tsx               guard: requireAnyRole() → /login or /access-denied
    _authed/inventory.tsx     the Explorer (validateSearch + loader)
    _authed/console.tsx       standalone VM / host console tab
    login.tsx / logout.tsx / access-denied.tsx
    frontend-api/auth/$.ts    better-auth OAuth endpoints
    frontend-api/api/$.ts     server proxy → ovc-backend, injects the OIDC bearer
    webrdp/tunnel.ts          server proxy → ovc-webrdp (WEBRDP_ORIGIN)
  router.tsx                  getRouter(): QueryClient in router context, no SSR query
                              dehydration (see Gotchas).
```

## Auth (OIDC)

`better-auth` in **cookie mode** (no database) brokers login against **any** OpenID
Connect provider that has a discovery document (Keycloak, Auth0, Okta, Entra ID, …).
It uses `genericOAuth` with
`discoveryUrl = ${OIDC_ISSUER}/.well-known/openid-configuration` and
`providerId = "oidc"`. The provider, realm and client are dedicated to ovc;
infra-containers ships a Keycloak realm as the default.

1. `/login` → the "Sign in" button → `signInFn` → redirect to the provider.
2. The callback lands at `/frontend-api/auth/callback/oidc`. `getUserInfo` decodes
   the token (the access token, else the id token) and reads the roles array at the
   dot-path `OIDC_ROLES_CLAIM` (default `resource_access.${client_id}.roles`, with
   `${client_id}` substituted). The roles are persisted on the session user as
   `roles`.
3. `__root` `beforeLoad` → `fetchCurrentUser()` → `context.user = { …, roles }`.
4. The `_authed` guard runs `requireAnyRole`: no session → `/login`; a session with
   zero roles → `/access-denied`; `ADMINISTRATOR` or any role → in. `requireAdmin`
   guards admin-only routes.
5. API calls go to `/frontend-api/api/*` (browser, with the cookie). The server proxy
   attaches `Authorization: Bearer <access token>`, and ovc-backend re-verifies the
   JWT and derives the roles the same way. The token never reaches the browser.

`useAuth()` exposes `user`, `isAdmin`, `hasAnyRole` and `logout`. `ADMINISTRATOR`
matches ovc-backend's `OVC_ADMIN_ROLE` / `OVC_OIDC_ROLES_CLAIM`.

**No-auth bypass**: `OVC_AUTH_MODE=stub` (server-only, `src/auth/bypass.ts`).

- `fetchCurrentUser` returns a fixed `admin@ovc.debug.app` / `[ADMINISTRATOR]` user;
  no provider is contacted and there is no login screen.
- The API proxy forwards requests with **no** bearer, so ovc-backend must use the
  same variable and value: set both to `stub`.
- It logs a warning on boot and shows a standing warning dialog in the UI
  (`DevBypassWarning`). It works in every build, including `production`.

## Deployment / path namespacing

The browser only ever calls the frontend origin:

| Path                   | Handled by                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `/frontend-api/api/*`  | REST proxy to `API_URL`, with the OIDC bearer injected                                |
| `/frontend-api/fn/*`   | RPC (`vite.config.ts` → `tanstackStart({ serverFns: { base: '/frontend-api/fn' } })`) |
| `/frontend-api/auth/*` | OAuth                                                                                 |
| `/webrdp/tunnel`       | proxy to `WEBRDP_ORIGIN`                                                              |
| `/`                    | pages                                                                                 |
| `/assets/*`            | static assets                                                                         |

So the public proxy needs only the frontend (plus `/webrdp`). See README "Deploying
behind one domain". For local dev, run the backend with `docker compose up` in
`../ovc-backend` (its `OVC_AUTH_MODE=stub` and seed data give you data without a
provider), then set `VITE_API_URL=http://localhost:3000/frontend-api/api` in
`.env.local`.

## Gotchas

- **Never use `window.confirm` / `alert` / `prompt`.** All confirmations go through the
  Win95 `Dialog`: `await confirm({ title, message, danger })` from
  `features/inventory/confirm.tsx`. Report errors with `statusMessage.set(...)`.
- **VM iconography**: always the transport-control icons (see Icons).
- **Do not add `@tanstack/react-router-with-query`.** It is stuck at 1.130.x, skews
  against router 1.170 and throws a query-stream hydration error. Use a plain
  `<QueryClientProvider>` in `__root`. The server and the client get separate
  QueryClients and there is no SSR query dehydration. That is fine: SSR already
  paints data, and the client refetches on mount.
- **The auth guard redirects; it never throws.** Throwing an `Error` in `beforeLoad`
  produced an SSR 500 and broke client hydration.
- **`react-resizable-panels` is pinned to v3.** v4 renamed every export.
- **ag-grid is client-only.** Render it through `<ClientOnly>` and register its
  modules on the client. It uses the JS Theming API (`themeQuartz.withParams`), not
  CSS themes. The same goes for `guacamole-common-js`, which must be lazy-imported on
  the client.
- **Route every VM operation by `vm.id`**, never by `vmUuid`. The same `vmUuid` can
  exist on several hosts.
- **`Dropdown`'s open list is portalled** to `<body>` with `position: fixed` and
  `z-[1000]`, so it works inside scrolling tables and dialogs (`z-[100]`) without
  being clipped or covered. It opens upwards when there's more room above, and it
  closes on any outside scroll or window resize because a fixed list can't follow its
  field. Outside-click detection covers both the field and the portalled list. Don't
  wrap a `Dropdown` in something that needs the list in its own DOM subtree.
- **Type is the native UI sans-serif per OS**: `Segoe UI` on Windows (the deploy
  target), San Francisco on macOS, Roboto elsewhere, at a 12px anti-aliased base.
  - An earlier build listed `MS Sans Serif` / `Tahoma` with `font-smooth: none` to
    chase a bitmap Win95 look. Browsers substitute a thin vector face for the bitmap
    font and `font-smooth` is a no-op, so the result was just a dated 11px face,
    unreadable on macOS Retina.
  - The bevels, palette and geometry carry the retro feel. For an authentic pixel
    look, vendor `W95FA` via `@font-face` (it works on every OS).

## Known deviations / cleanup candidates

None known. The last ones were fixed on 2026-09-27:

Record any new violation of the rules above here until it is fixed.

## Not implemented yet

- ISO and template management screens (upload, delete). Today these lists are
  read-only agent inventory.
- RBAC administration UI.
- Nested folders.
- Real-time push (SSE / WebSocket); everything is polling.
- i18n, a mobile layout, and automated tests.
