# ovc-backend REST API - contract

This is the REST surface `ovc-frontend` expects from `ovc-backend`, mirrored in
[`src/api/types.ts`](../src/api/types.ts) and [`src/api/endpoints/`](../src/api/endpoints/).

Status: **implemented** by `ovc-backend`. Responses are camelCase.

To run it locally:

1. Start the backend with `docker compose up` in `../ovc-backend`.
2. Point the frontend's server proxy at it with `API_URL=http://localhost:8000/api`.
3. Point the browser at the proxy with
   `VITE_API_URL=http://localhost:3000/frontend-api/api` (split-origin dev only; see
   Conventions).

Keep this file in sync with the code: any change to an endpoint, body, param,
response, error code or polling cadence updates it in the same change (see also
`LLM.md` › Contracts). The frontend's demo mode (`OVC_DEMO_MODE=true`) serves this
same contract from an in-browser simulator, `src/demo/api.ts`. Update that
simulator in the same change too.

---

## Conventions

- **Base URL**: the browser never calls ovc-backend directly.
  - It calls the frontend's proxy at `import.meta.env.VITE_API_URL`, which defaults
    to `/frontend-api/api`.
  - The proxy (`src/routes/frontend-api/api/$.ts`) forwards to `API_URL`, e.g.
    `http://ovc-backend:8000/api`.
- **Content type**: `application/json` for requests and responses. The one
  exception is `POST /agent-binaries`, which takes multipart.
- **Auth**: `Authorization: Bearer <JWT>` (the OIDC access token).
  - The browser calls the proxy with its session cookie; the proxy swaps the cookie
    for the bearer token and forwards the request.
  - `ovc-backend` verifies the JWT (JWKS) and reads the roles from the claim at
    `OVC_OIDC_ROLES_CLAIM` (default `resource_access.${client_id}.roles`).
  - `OVC_AUTH_MODE=stub` bypasses all of this for local dev.
- **Errors**: every non-2xx response carries
  ```json
  { "error": { "code": "FORBIDDEN", "message": "…", "details": {} } }
  ```
  The frontend shows `message` in the status bar. See [Error codes](#error-codes).
- **Lists**: bare arrays. `GET /tasks` is capped by `?limit=` (default 50, max 200).
  If pagination is ever needed, switch to `{ "items": [...], "total": n }` with
  `?page` & `?pageSize`; the frontend will adapt the client in one place.
- **Timestamps**: ISO-8601 UTC strings.
- **IDs**:
  - Every backend-generated id (vm / host / cluster / folder / vlan / task) is a
    **UUIDv4 string**.
  - `vm.id` is backend-generated. The hypervisor-native id (the Hyper-V VM GUID) is
    a **separate** field, `vm.vmUuid` (`string | null`; null until the host agent
    first reports the VM).
  - The same `vmUuid` can appear on more than one host (a clone, an
    exported-then-imported VM), so route every VM operation by `vm.id`.
  - `host.shortId` is a 10-char handle used in agent/queue plumbing. It is
    informational only.
  - `template.id` / `iso.id` are agent-owned strings (an export UUID / an MD5
    checksum).
  - Treat all ids as opaque.
- **Hypervisor**: every `Cluster` and `Host` carries `hypervisor`. `"hyperv"` is the
  only value today; `"libvirt"` / `"kvm"` are planned.
  - A cluster is hypervisor-homogeneous: `POST /hosts` / `PATCH /hosts` reject a
    host whose `hypervisor` differs from the cluster's (`400 INVALID`).
  - `POST /hosts` and `POST /clusters` accept an optional `hypervisor` (default
    `"hyperv"`). The frontend doesn't send it today.

---

## RBAC

Access is scoped **Cluster > Host > Folder** and enforced **server-side** from the
authenticated principal:

- the `ADMINISTRATOR` role (a client role in the access token) = unconditional full
  access, no scope grant needed;
- other principals see only what their `ScopeGrant`s cover;
- list endpoints return only the entities the caller may see;
- direct reads of a forbidden entity return `403` with `error.code = "FORBIDDEN"`;
- endpoints marked **admin only** below return `403 FORBIDDEN` to everyone else;
- the frontend sends **no** scope header, so it does not decide access. A signed-in
  user with **no roles** is stopped at `/access-denied` before any API call.

---

## Entities

See [`src/api/types.ts`](../src/api/types.ts) for the exact TypeScript shapes. Summary:

| Type                    | Notes |
| ----------------------- | ----- |
| `Cluster`               | `id, name, hypervisor, hostCount, vmCount` |
| `Host`                  | `id, shortId, clusterId, name, fqdn, ipAddress, hypervisor, online, agent, vmCount`. `fqdn` / `ipAddress` are `string \| null`, resolved by the agent (null until it first checks in) |
| `HostAgentStatus`       | `version, lastSeen, connected, refreshIntervals {vm,host}` |
| `HostHardwareInventory` | `cpu {model,sockets,cores,logical}`, `memoryBytes`, `storage[] {path,label?,totalBytes,freeBytes}`, `os {caption,version}`, `network[]` (every physical NIC: `name, description?, mac, speedBps, connected?, status?, linkSpeed?, driver*?, firmwareVersion?`), `vSwitches[]` (`name, id?, type, netAdapter?, allowManagementOS?, embeddedTeaming?, teamMembers?, loadBalancingAlgorithm?, bandwidthReservationMode?`), `hbas[]` (Fibre Channel, best-effort), `system {manufacturer,model}?`, `bootTime?` (derive uptime), `load {cpuPercent,memoryPercent}?` (snapshot, not live), `cluster {clustered,name?,state,nodes[]}?` (the Windows Failover Cluster, **not** `clusterId`), `hyperv {defaultVmPath,defaultVhdPath}?`. From `host_hwinventory` |
| `HostDetail`            | `Host & { hardware: HostHardwareInventory \| null }` |
| `HostAgentConfig`       | `hostId, rabbitmqUrl, configIni, filename`: the agent's `config.ini` for onboarding. `hostId` is the host **shortId** (the agent's queue prefix); the RabbitMQ URL carries per-host credentials |
| `HostAgentInstall`      | `url, command, expiresAt, filename`: a tokenized `install.ps1` URL plus a paste-ready elevated-PowerShell one-liner |
| `Folder`                | `id, name, clusterId, hostId`: a logical VM folder, **application-managed** (not agent-reported). Scoped to exactly one of a cluster or a standalone host. Flat (no nesting) |
| `Vlan`                  | `id, name, vlanId (1-4094 tag), description, isDefault, clusterId, hostId`: an 802.1Q VLAN, **application-managed**. Scoped like `Folder`; a clustered host uses its cluster's VLANs |
| `TagCategory`           | `id, name`: a group of mutually exclusive tags - a VM carries **at most one** tag per category. Global (not scoped to a cluster or host), **application-managed** |
| `Tag`                   | `id, name, categoryId, color, vmCount`: a global VM label, standalone (`categoryId: null`) or in one category. `color` is a palette name: `gray \| red \| orange \| yellow \| green \| teal \| blue \| navy \| purple \| pink` (the frontend maps it to a theme token). `vmCount` counts the VMs carrying it **within the caller's scope**. Names are `[A-Za-z0-9_-]{1,64}` (no spaces), unique case-insensitively within a category (standalone tags among themselves); category names likewise |
| `Vm`                    | `id, vmUuid, hostId, folderId, name, state, firmware ("BIOS" \| "UEFI"), guestOs (string \| null: guest OS from the hypervisor's guest integration, last known value kept while Off), uptimeSec, vcpu, cpuUsagePercent, memory {assignedBytes,minBytes,maxBytes,dynamic,demandBytes}, disks[] {id,path,controller,sizeBytes,usedBytes,type (Fixed/Dynamic/Differencing),format (VHDX/VHD/passthrough)}, nics[] {id,name,switchName,vlanId,macAddress,ipAddresses[],connected}, snapshots[] {id,name,createdAt,parentId,type}, secureBoot, secureBootTemplate, nestedVirtualization, autoStartAction, autoStartDelaySec, autoStopAction, configPath, dvdPath, highlyAvailable, notes, tagIds[], metricsEnabled, createdAt, lastSeen, lock`. `tagIds` are the ids of its tags (`GET /tags` resolves them) |
| `VmState`               | `Running \| Off \| Paused \| Saved \| Starting \| Stopping \| Saving \| Pausing \| Resuming \| Restarting \| Deleting \| Unknown` |
| `VmLock`                | `taskId, kind, requestedBy, acquiredAt`: set on `Vm.lock` while a mutating task runs, else `null` |
| `VmLockEntry`           | `VmLock & { vmId, vmName, ttl, taskStatus }`: one row of `GET /vm-locks` |
| `VmCreateBody`          | see [`POST /vms`](#post-vms---create-a-vm) |
| `VmCloneBody`           | see [`POST /vms/clone`](#post-vmsclone---clone-a-vm-or-deploy-a-template) |
| `HostMetricSample`      | `ts, cpuPercent, memPercent, diskLatencyMs, netRxBps, netTxBps, detail` (see [Quick metrics](#quick-metrics)) |
| `VmMetricSample`        | `ts, cpuPercent, memBytes, diskBytes, netRxBytes, netTxBytes` |
| `Template`              | `id, hostId, name, path, sizeBytes, diskSizeBytes, notes, cpuCount, memoryMb, guestOs, createdAt`: per-host inventory of exported VMs |
| `Iso`                   | `id, hostId, name, path, sizeBytes, checksum`: per-host inventory |
| `AgentBinary`           | `id, version, hypervisor, filename, sizeBytes, checksumSha256, contentType, storageBackend (local \| s3), notes, isActive, uploadedBy, createdAt` |
| `AgentStorageInfo`      | `backend, location, downloadUrlTtlSeconds, downloadsEnabled` |
| `Task`                  | async operation tracking: `id, kind, status, targetType (vm \| host), targetId, targetName?, requestedBy, progress, progressMessage?, createdAt, startedAt, finishedAt, result, error, correlationId` |
| `TaskDetail`            | `Task & { requestPayload, responsePayload }`: the raw `AgentRequest` and the latest `AgentResponse`. Only `GET /tasks/:id` returns it |
| `TaskStatus`            | `queued \| running \| succeeded \| failed \| timeout` |

Notes on the task fields:

- `correlationId` carries the RabbitMQ message id used on `<hostid>.request` /
  `<hostid>.response`, so an operator can trace a task to the queue.
- `progress` is `0–100` when the agent reports it, else `null` (the UI then shows a
  coarse bar from `status`).
- `progressMessage` is the live step text while running (e.g. "Exporting VM (45%)");
  it is cleared at the terminal status.
- `targetName` is the VM/host display name when the backend can resolve it (the UI
  falls back to `targetId`).
- `requestedBy` is derived from the caller's token; the frontend never sends an
  identity.
- A `succeeded` task may still carry an advisory in `error` (e.g. a `vm_delete` that
  could not remove every file on disk).

---

## Endpoints

### Read

| Method | Path                      | Query                                     | Response |
| ------ | ------------------------- | ----------------------------------------- | -------- |
| GET    | `/health`                 | -                                         | `{ ok, db, cache, rabbit }` |
| GET    | `/me`                     | -                                         | `AuthUser & { scopes }` |
| GET    | `/clusters`               | -                                         | `Cluster[]` |
| GET    | `/clusters/:id`           | -                                         | `Cluster` |
| GET    | `/hosts`                  | `clusterId?`                              | `Host[]` |
| GET    | `/hosts/:id`              | -                                         | `HostDetail` |
| GET    | `/hosts/:id/vms`          | -                                         | `Vm[]` |
| GET    | `/hosts/:id/templates`    | -                                         | `Template[]` |
| GET    | `/hosts/:id/isos`         | -                                         | `Iso[]` |
| GET    | `/hosts/:id/metrics`      | -                                         | `HostMetricSample[]`: the **last hour**, oldest first |
| GET    | `/hosts/:id/agent-config` | -                                         | `HostAgentConfig`. **Admin only** (carries RabbitMQ credentials). Re-asserts the host's RabbitMQ user on every call |
| GET    | `/hosts/:id/agent-install-url` | -                                    | `HostAgentInstall`. **Admin only**. Mints a short-lived HMAC-tokenized `agent-install.ps1` URL (TTL `OVC_AGENT_INSTALL_URL_TTL_SECONDS`). Used by the "Setup Agent" tab |
| GET    | `/folders`                | `hostId?`, `clusterId?`                   | `Folder[]` (no filter → every folder the caller may see) |
| GET    | `/vlans`                  | `hostId?`, `clusterId?`                   | `Vlan[]`. `hostId` resolves to the host's own VLANs **plus** its cluster's (if any) |
| GET    | `/tag-categories`         | -                                         | `TagCategory[]`, by name. Any role |
| GET    | `/tags`                   | -                                         | `Tag[]`: categorized tags (by category name, then tag name), then standalone tags. Any role |
| GET    | `/vms`                    | `hostId?`, `folderId?`, `state?`          | `Vm[]` |
| GET    | `/vms/:id`                | -                                         | `Vm` |
| GET    | `/vms/:id/metrics`        | -                                         | `VmMetricSample[]`: the last hour, oldest first. Empty until metering is enabled on the VM |
| GET    | `/vms/:id/thumbnail`      | -                                         | `image/jpeg` (320x240): last console frame the agent captured. Only Running VMs are captured, so an Off VM serves its last image. `X-Captured-At` = capture time (ISO 8601; the frontend proxy passes it through); `Cache-Control: private, max-age=60`. 404 `NOT_FOUND` until a first capture (the UI shows "No preview") |
| GET    | `/vm-locks`               | -                                         | `VmLockEntry[]`. **Admin only** |
| GET    | `/tasks`                  | `vmId?`, `hostId?`, `status?`, `limit?` (default 50, max 200) | `Task[]`, newest first |
| GET    | `/tasks/:id`              | -                                         | `TaskDetail` |
| GET    | `/templates` · `/isos`    | -                                         | flat cross-host lists |
| GET    | `/agent-binaries`         | `hypervisor?`                             | `AgentBinary[]`. **Admin only**. Uploaded ovc-agent builds, newest first |
| GET    | `/agent-binaries/storage` | -                                         | `AgentStorageInfo`. **Admin only**. A read-only view of the binary store (`local` / `s3`) |

These two routes also exist but are **not** called by the frontend; they are
authenticated by a short-lived token in the URL:

- `GET /hosts/:id/agent-install.ps1?exp&token`: the installer script behind
  `agent-install-url`.
- `GET /agent-binaries/:id/download`: the agent's binary download in local storage
  mode.

### Organization (synchronous - DB only, no agent)

| Method | Path            | Body | Response |
| ------ | --------------- | ---- | -------- |
| POST   | `/clusters`     | `{ name, hypervisor? }` (default `"hyperv"`) | `201 Cluster` |
| PATCH  | `/clusters/:id` | `{ name }` | `Cluster` (rename) |
| DELETE | `/clusters/:id` | - | `204`. Only an **empty** cluster (no member hosts) can be deleted; otherwise `400 INVALID`. Cluster-scoped folders go with it (their VMs are detached) |
| POST   | `/hosts`        | `{ name, clusterId?, hypervisor? }` (default `"hyperv"`; must match the cluster's) | `201 HostDetail`. Also provisions the host's RabbitMQ queues and agent user. `fqdn` / `ipAddress` are filled in by the agent on its first `agent_status` |
| PATCH  | `/hosts/:id`    | any subset of `{ name, fqdn, clusterId }`. Only keys present in the body are applied; `clusterId: null` → standalone; `fqdn` is normally left to the agent | `HostDetail`. Changing `clusterId` clears every folder assignment for the host's VMs and drops any host-scoped folders |
| DELETE | `/hosts/:id`    | - | `204`. Cascades: the host's VM records, host-scoped folders, templates and ISOs are deleted. The host's RabbitMQ queues and agent user are torn down (best-effort). The virtualization host itself is not touched |
| POST   | `/folders`      | `{ name, clusterId? \| hostId? }` (exactly one) | `201 Folder`. `hostId` must be a **standalone** host |
| PATCH  | `/folders/:id`  | `{ name }` | `Folder` |
| DELETE | `/folders/:id`  | - | `204`. VMs in the folder are detached (`folderId → null`), not deleted |
| POST   | `/vlans`        | `{ name, vlanId, description?, isDefault?, clusterId? \| hostId? }` (exactly one scope) | `201 Vlan`. `hostId` must be **standalone**. Setting `isDefault` clears it from every other VLAN in the scope |
| PATCH  | `/vlans/:id`    | any subset of `{ name, description, isDefault }` (the tag is immutable) | `Vlan` |
| DELETE | `/vlans/:id`    | - | `204`. VMs already tagged with it are not changed |
| PATCH  | `/vms/:id`      | `{ folderId }` (`null` → remove from its folder) | `Vm`. The folder must be reachable from the VM's host: a cluster folder needs the host in that cluster; a host folder needs the host to be that (standalone) host. Otherwise `400 INVALID` |
| POST   | `/tag-categories`     | `{ name }` | `201 TagCategory`. **Admin only**. A bad name → `400 INVALID`; a name already in use (case-insensitive) → `409 DUPLICATE` |
| PATCH  | `/tag-categories/:id` | `{ name }` | `TagCategory` (rename). **Admin only**. Same name rules |
| DELETE | `/tag-categories/:id` | - | `204`. **Admin only**. Deletes the category **and all of its tags**, which removes them from every VM. The VMs themselves are not touched |
| POST   | `/tags`               | `{ name, categoryId?, color? }` (`null` / omitted category → standalone; color defaults to `gray`) | `201 Tag`. **Admin only**. Unknown category → `404`; bad name or a colour outside the palette → `400 INVALID`; name taken in that category (or among standalone tags) → `409 DUPLICATE` |
| PATCH  | `/tags/:id`           | any subset of `{ name, categoryId, color }`. Only keys present are applied; `categoryId: null` → standalone | `Tag`. **Admin only**. Moving the tag into a category where a VM carrying it already has another tag of that category → `409 TAG_CONFLICT` |
| DELETE | `/tags/:id`           | - | `204`. **Admin only**. The tag is removed from every VM; the VMs stay |
| PUT    | `/vms/:id/tags`       | `{ tagIds: string[] }` - the VM's complete tag set (replaces the current one; duplicates ignored) | `Vm`. Any caller who can see the VM. Unknown tag → `404`; two tags of one category → `409 TAG_CONFLICT`. Allowed while the VM is locked or its host is offline (DB-only) |

Folders, tags and tag categories are created by the frontend and never reported by
the agent. `host_inventory` carries hardware only. Tags live on the backend's VM row,
so they survive inventory refreshes and a live migration inside a cluster; a VM whose
row is recreated (removed from inventory, or moved to an unrelated host) loses them.

### VM power / lifecycle actions

Each returns **`202 Accepted`** with `{ "task": Task }` (status `queued`), unless
noted. The host agent performs the work asynchronously over RabbitMQ.

| Method | Path                               | Agent request |
| ------ | ---------------------------------- | ------------- |
| POST   | `/vms`                             | `vm_create`. Returns **`201`** with `{ vm, task }`; see below |
| POST   | `/vms/clone`                       | `vm_clone`. Returns `202` with `{ vm, task }`; see below |
| POST   | `/vms/:id/actions/start`           | `vm_start` (also resumes a Paused VM) |
| POST   | `/vms/:id/actions/shutdown`        | `vm_shutdown` (guest OS shutdown) |
| POST   | `/vms/:id/actions/stop`            | `vm_stop` (hard power-off) |
| POST   | `/vms/:id/actions/restart`         | `vm_restart` |
| POST   | `/vms/:id/actions/pause`           | `vm_pause` |
| POST   | `/vms/:id/actions/enable_metrics`  | `vm_enable_metrics`: turns on Hyper-V resource metering (does not change the VM power state) |
| POST   | `/vms/:id/actions/disable_metrics` | `vm_disable_metrics` |
| DELETE | `/vms/:id`                         | `vm_delete`. Query `remove_files=true` also deletes the VM's folder and files from the host's disk (irreversible). The default only removes the VM from Hyper-V |
| DELETE | `/vms/:id/from-inventory`          | _(none: DB only)_. Returns `200 { removed: true }` |

The backend sets the VM's optimistic transitional state for power actions: start →
Starting, stop/shutdown → Stopping, restart → Restarting, pause → Pausing, delete →
Deleting.

Common errors on every agent-backed VM endpoint:

| Error                    | When |
| ------------------------ | ---- |
| `404 UNKNOWN_ACTION`     | the action is not a known action |
| `409 VM_LOCKED`          | another task holds the VM lock; `details.lock` carries it |
| `409 HOST_OFFLINE`       | the host agent is offline (see below) |
| `409 VM_NOT_READY`       | the VM has not been reported by its agent yet (`vmUuid: null`) |

#### Offline hosts and `Unknown` VMs

A host goes offline when its agent stops checking in: its last `agent_status` is
older than `agent_offline_after_seconds` (default 120). The host then reads
`online: false`, **and every VM it owns is reported with `state: "Unknown"`** (the
fast-cache overlay is ignored). While the host is offline:

- Every agent-backed VM endpoint (each power, lifecycle and management action,
  `POST /vms/clone`, `DELETE /vms/:id`, and creating a VM on that host) returns
  **409** `{ error: { code: "HOST_OFFLINE", message } }`.
- `DELETE /vms/:id/from-inventory` removes the VM record from the database only. Its
  disks, NICs and snapshots cascade, and any lock and cached state are cleared. No
  agent request is sent. It returns `200 { removed: true }`.
  - Use it to clear out a VM stranded on a host that is gone for good.
  - It is **refused with 409 `HOST_ONLINE`** while the host agent is still online and
    has reported the VM (deleting the row then would just let the next
    `vm_inventory` recreate it).
  - A never-reported placeholder (`vmUuid: null`) can always be removed.

`Vm.lastSeen` is the timestamp of the last inventory refresh that touched the row.
The frontend shows it as "Last seen" on the VM summary, mirroring the host's.

#### Storage placement

`POST /vms`, `POST /vms/clone` and the `move_storage` action validate the target
volume. A violation returns `400 STORAGE_NOT_ALLOWED`. The rules:

- **Clustered host** (in an app cluster, or reporting
  `hardware.cluster.clustered`): only Cluster Shared Volumes
  (`X:\ClusterStorage\<Volume>`).
- **Standalone host**: any volume except the system drive (`C:`), unless the Hyper-V
  default VM path is on it. The agent then places the VM under that default path,
  never at the drive root.
- An empty destination means the host's default VM path. The frontend always sends
  an explicit destination.

The frontend mirrors these rules in `src/features/inventory/detail/vmActions/storage.ts`.

#### `POST /vms` - create a VM

Body (`VmCreateBody`):

```
{ name, hostId, os, firmware, cpuCount, memoryMb, memoryDynamic,
  memoryMinMb?, memoryMaxMb?, destinationStorage?, notes?, vlanId?, switchName?,
  nestedVirtualization, haEnabled, dvd?, startNow, disks }
```

| Field                        | Rules |
| ---------------------------- | ----- |
| `name`                       | alphanumerics, `-` and `_` |
| `os`                         | `windows` \| `linux` \| `other` |
| `firmware`                   | `BIOS` \| `UEFI` |
| `memoryMb`                   | the startup RAM |
| `memoryDynamic`              | default `false`. When true, `memoryMinMb` / `memoryMaxMb` bound the balloon (omitted → agent default of 512 MB / 4× startup). Validated `min ≤ startup ≤ max` |
| `destinationStorage`         | see [Storage placement](#storage-placement) |
| `disks[]`                    | `{ name (alphanumeric, ≤ 6 chars), type: Fixed \| Dynamic, sizeGb }` |

The backend inserts a placeholder `Vm` (`vmUuid: null`, `state: Unknown`), queues a
`vm_create` task and returns both. When the agent finishes, it reports the real
Hyper-V GUID and state, which the backend stamps onto the row. If the task fails,
the placeholder is removed.

#### `POST /vms/clone` - clone a VM or deploy a template

Body (`VmCloneBody`):

```
{ name, hostId, source: "vm" | "template", sourceVmId?, templateId?,
  cpuCount?, memoryMb?, destinationStorage?, notes?, vlanId?,
  nestedVirtualization, haEnabled, startNow, expandDisks? }
```

- Disks, firmware and NICs are inherited from the source. Sizing defaults to the
  source's when omitted.
- `expandDisks` (template deploys only) converts the deployed VM's disks to Fixed
  after import.
- Like `POST /vms`, the backend inserts a placeholder VM and returns `{ vm, task }`.

The backend rejects a clone or deploy with these errors:

| Error                        | When |
| ---------------------------- | ---- |
| `409 SOURCE_NOT_OFF`         | `source: "vm"` and the source VM is not Off |
| `409 VM_NOT_READY`           | `source: "vm"` and the source VM has not been reported yet |
| `409 CROSS_HOST_CLONE`       | `source: "vm"` and the target `hostId` is not the source VM's host |
| `409 TEMPLATE_UNREACHABLE`   | `source: "template"` and the target host is neither the template's host nor in the same cluster |
| `400 STORAGE_NOT_ALLOWED`    | the placement rules are violated |

#### Management actions

These have the same `202 → { task }` shape. Each accepts an optional body
`{ "params": { … } }`, forwarded to the agent as extra `AgentRequest.params`. The
params are flat: `vm_id`, `action` and the per-action keys all sit on `params`. All
are implemented by ovc-agent. A task whose agent never answers is flipped to
`timeout` by the backend's sweeper after `task_timeout_seconds`.

| Method | Path                                                     | Agent request                           | `params` |
| ------ | -------------------------------------------------------- | --------------------------------------- | -------- |
| POST   | `/vms/:id/actions/rename`                                | `vm_rename`                             | `new_name` |
| POST   | `/vms/:id/actions/edit`                                  | `vm_edit`                               | only the changed keys; see below |
| POST   | `/vms/:id/actions/migrate`                               | `vm_migrate`                            | `target_host` (a Failover Cluster node name). `409 HA_REQUIRED` unless the VM is highly available |
| POST   | `/vms/:id/actions/move_storage`                          | `vm_move`                               | `destination_storage` (required, else `400 VALIDATION_ERROR`; [placement rules](#storage-placement) apply) |
| POST   | `/vms/:id/actions/startup_change`                        | `vm_startup_change`                     | `automatic_start` (`Nothing` \| `StartIfRunning` \| `Start`), `automatic_start_delay` (seconds) |
| POST   | `/vms/:id/actions/mount_dvd`                             | `mount_dvd`                             | `path` (an ISO path from `/hosts/:id/isos`) |
| POST   | `/vms/:id/actions/eject_dvd`                             | `eject_dvd`                             | - |
| POST   | `/vms/:id/actions/enable_ha` \| `disable_ha`             | `enable_ha` \| `disable_ha`             | - |
| POST   | `/vms/:id/actions/export_template`                       | `vm_export_template`                    | `template_name` (`[A-Za-z0-9_-]+`), `notes?`. The backend registers the template when the task succeeds |
| POST   | `/vms/:id/actions/notes_edit`                            | `notes_edit`                            | `notes` |
| POST   | `/vms/:id/actions/snapshot_create`                       | `snapshot_create`                       | `name?` |
| POST   | `/vms/:id/actions/snapshot_remove` \| `snapshot_restore` | `snapshot_remove` \| `snapshot_restore` | `snapshot_id` |
| POST   | `/vms/:id/actions/refresh`                               | `refresh_status`                        | -. Read-only: re-inventories just this VM and does **not** take the VM lock |

`vm_edit` params. The frontend sends only the keys that changed:

| Group          | Keys |
| -------------- | ---- |
| CPU and memory | `cpu_count`, `memory_mb`, `memory_dynamic`, `memory_min_mb`, `memory_max_mb` |
| Features       | `nested_virtualization`, `secure_boot`, `secure_boot_template` (`Windows` \| `Linux` \| `Others`; UEFI VMs only) |
| Start / stop   | `automatic_start`, `automatic_start_delay`, `automatic_stop` (`TurnOff` \| `ShutDown` \| `Save`) |
| Notes          | `notes` |
| NICs           | `add_nic[] { name, vlan_id, switch_name? }`, `edit_nic[] { nic_id, name?, vlan_id?, switch_name? }`, `remove_nic[] { nic_id }`. `vlan_id: 0` = untagged |
| Disks          | `add_disk[] { path, type: Fixed \| Dynamic, size_gb }`, `edit_disk[] { path, size_gb }` (expand only), `remove_disk[] { path, delete_from_disk }` |

The frontend only sends CPU, memory, nested virtualization, Secure Boot and
automatic stop while the VM is Off. It blocks disk changes while the VM has
snapshots, and while a BIOS (generation 1) VM is running.

### Host actions

| Method | Path                                   | Body | Response |
| ------ | -------------------------------------- | ---- | -------- |
| POST   | `/hosts/:id/actions/refresh_hardware`  | - | `202 { task }`: forces a hardware inventory report |
| POST   | `/hosts/:id/actions/refresh_inventory` | - | `202 { task }`: forces a VM inventory report |
| POST   | `/hosts/:id/actions/suspend` \| `suspend_drain` | - | `202 { task }`: **admin only**. Pauses the Failover Cluster node; `suspend_drain` first moves its roles away |
| POST   | `/hosts/:id/actions/resume` \| `resume_fallback` | - | `202 { task }`: **admin only**. Resumes the node; `resume_fallback` fails its roles back |
| POST   | `/hosts/:id/actions/restart`           | - | `202 { task }`: **admin only**. Reboots the physical host. The agent refuses while VMs run or, on a cluster node, unless the node is Paused |
| POST   | `/hosts/:id/actions/update-agent`      | `{ binaryId? }` (default: the active build for the host's hypervisor) | `202 { task }`: **admin only**; see [Agent management](#agent-management-admin-only) |

The task `kind` equals the action name (`host_update_agent` for `update-agent`).
Errors:

| Error                            | When |
| -------------------------------- | ---- |
| `404 UNKNOWN_ACTION`             | not one of the actions above |
| `409 HOST_OFFLINE`               | the host agent is offline |
| `409 NOT_CLUSTERED`              | a node action on a host that isn't a Failover Cluster node |
| `409 HOST_ACTION_IN_PROGRESS`    | another disruptive action (suspend / resume / restart) is still running on the host; `details.taskId` names it |
| `403 FORBIDDEN`                  | a disruptive action from a non-admin |

### Agent management (admin only)

This covers uploading and rolling out the `ovc-agent` binary (the "Agent
Management" screen) plus host onboarding. See
`../ovc-backend/docs/agent-queue-contract.md` → `host_update_agent` for the wire
contract.

| Method | Path                              | Body | Response |
| ------ | --------------------------------- | ---- | -------- |
| POST   | `/agent-binaries`                 | **multipart**: `file` + `version`, `hypervisor?` (`hyperv`), `notes?`, `makeActive?` | `201 AgentBinary`. The server computes SHA-256 and size. `(version, hypervisor)` must be unique (`409 DUPLICATE`); max 128 MiB (`413 TOO_LARGE`); a store failure returns `502 STORAGE_ERROR`. The frontend only accepts `.exe` files |
| PATCH  | `/agent-binaries/:id`             | any subset of `{ notes, isActive }` | `AgentBinary`. `isActive: true` demotes the previous active build for that hypervisor |
| DELETE | `/agent-binaries/:id`             | - | `204`. Refused with `409 ACTIVE_BINARY` while it is the active build |
| POST   | `/agent-binaries/:id/rollout`     | `{ hostIds?: string[] \| null }` (default: every online host on the binary's hypervisor whose agent version differs) | `{ tasks: Task[], skipped: [{ hostId, hostName, reason }] }` |
| POST   | `/hosts/:id/actions/update-agent` | `{ binaryId? }` (default: the active build for the host's hypervisor) | `202 { task }`. `409` with `HOST_OFFLINE` / `AGENT_UPGRADE_IN_PROGRESS` / `AGENT_ALREADY_CURRENT` / `NO_ACTIVE_AGENT_BINARY` / `AGENT_DOWNLOAD_UNAVAILABLE` |

Host onboarding goes through `GET /hosts/:id/agent-install-url` and
`GET /hosts/:id/agent-config` (see [Read](#read)).

### VM lock

Every mutating agent task (power, edit, disk, snapshot, clone, …) takes a lock on the
VM for the task's lifetime, so a second operation can't race it. The read-only
`refresh` action does not.

- While locked, `Vm.lock` is `{ taskId, kind, requestedBy, acquiredAt }`; otherwise
  it is `null`. The UI disables every VM action and shows a badge.
- A locked VM's action and edit endpoints return **409**
  `{ error: { code: "VM_LOCKED", message, details: { lock } } }`.
- The lock is released the moment the task reaches a terminal state (succeeded /
  failed / timeout). It also auto-expires shortly after the task timeout, so a
  crashed worker never strands it.
- Admin endpoints:
  - `GET /vm-locks`: every active lock (each row adds `vmName`, `ttl`, `taskStatus`).
  - `DELETE /vm-locks/:vmId`: force-releases one lock (stale-lock recovery; works
    even if the VM row is gone). Returns `{ released: boolean }`.
  - `DELETE /vm-locks`: force-releases every lock. Returns `{ released: n }`.

  The frontend surfaces these as the admin-only **View ▸ VM Locks…** dialog and the
  "Force unlock (admin)" VM menu item.

### Quick metrics

These are lightweight host/VM load samples, **not** a monitoring stack. The agent
samples every `metrics_interval` seconds (default 300), and the backend keeps only
the last hour.

- `GET /hosts/:id/metrics` is always populated: CPU %, memory %, disk latency (ms),
  network (bps).
- `GET /vms/:id/metrics` is empty until `POST /vms/:id/actions/enable_metrics`. It
  carries CPU % plus memory, disk and network bytes from Hyper-V resource metering.
  `Vm.metricsEnabled` reflects whether metering is on.
- `memBytes` is an average. `diskBytes` / `netRxBytes` / `netTxBytes` are cumulative
  counters: diff consecutive samples to get a rate.
- `HostMetricSample.detail` carries `memUsedBytes` / `memTotalBytes`,
  `disks[] {name,readLatencyMs,writeLatencyMs,queueLength}` and
  `net[] {name,rxBps,txBps}`.

The frontend shows the host samples in a **Host Metrics** tab on the host detail
(always present once the agent has checked in), with Processor / Memory / Network /
Disk-latency charts. The VM's **VM Metrics** tab mirrors it, shown only while
metering is on.

---

## Error codes

| Code | HTTP | When |
| ---- | ---- | ---- |
| `UNAUTHENTICATED` | 401 | backend: missing or invalid bearer |
| `UNAUTHORIZED` | 401 | frontend proxy: no valid session (never reaches the backend) |
| `NETWORK` | 502 / 0 | frontend proxy: backend unreachable (502); client: request failed (status 0) |
| `FORBIDDEN` | 403 | outside the caller's scope, an admin-only endpoint, or an invalid/expired install token |
| `NOT_FOUND` | 404 | unknown entity or route |
| `UNKNOWN_ACTION` | 404 | unknown VM or host action |
| `INVALID` | 400 | a domain rule was violated (non-empty cluster, unreachable folder, hypervisor mismatch, a tag or category name outside `[A-Za-z0-9_-]{1,64}`, a tag colour outside the palette, …) |
| `VALIDATION_ERROR` | 400 / 422 | a missing or malformed field (422 for request-schema errors) |
| `STORAGE_NOT_ALLOWED` | 400 | the VM placement rules were violated |
| `VM_LOCKED` | 409 | another task holds the VM lock (`details.lock`) |
| `VM_NOT_READY` | 409 | the VM has not been reported by its agent yet |
| `HOST_OFFLINE` | 409 | the host agent is offline |
| `HOST_ONLINE` | 409 | remove-from-inventory while the agent still reports the VM |
| `HA_REQUIRED` | 409 | migrate on a non-HA VM |
| `SOURCE_NOT_OFF`, `CROSS_HOST_CLONE`, `TEMPLATE_UNREACHABLE` | 409 | clone / deploy preconditions |
| `NOT_CLUSTERED`, `HOST_ACTION_IN_PROGRESS` | 409 | host action preconditions |
| `DUPLICATE` | 409 | agent binary `(version, hypervisor)` already exists; a tag or tag category name already in use |
| `TAG_CONFLICT` | 409 | a VM would carry two tags of one category (`PUT /vms/:id/tags`, or `PATCH /tags/:id` moving a tag into a category) |
| `ACTIVE_BINARY` | 409 | deleting the active agent build |
| `AGENT_UPGRADE_IN_PROGRESS`, `AGENT_ALREADY_CURRENT`, `NO_ACTIVE_AGENT_BINARY`, `AGENT_DOWNLOAD_UNAVAILABLE` | 409 | agent upgrade preconditions |
| `TOO_LARGE` | 413 | agent binary upload over 128 MiB |
| `STORAGE_ERROR` | 502 | the agent binary store failed |
| `HTTP_ERROR` | any | a non-envelope HTTP error (frontend client fallback) |
| `INTERNAL` | 500 | an unexpected server error |

---

## Async model

```
POST /vms/:id/actions/start
        │  validate + RBAC + lock
        ▼
  write JSON to <hostid>.request        ──►  agent executes vm_start
        │                                          │
   202 { task: {status:"queued"} }                 ▼
        │                              reply on <hostid>.response
        ▼                                          │
 frontend polls GET /tasks/:id  ◄────  worker: update task row
   every 1.5s until terminal            + update VM state in Valkey  ⚠️
        │                               + release the VM lock
        ▼
 on succeeded/failed/timeout → refetch /vms, /hosts, /tasks
```

⚠️ **Critical for the UI:** when the worker consumes `<hostid>.response` for a power
operation, it must update the VM `state` in the Valkey cache **immediately**, not
wait for the next periodic `vm_inventory` (up to `vm_refresh_interval`, e.g. 180 s).
The frontend flips the VM to a transitional state optimistically and, once the task
finishes, re-reads `/vms`. If the cache still shows the old state, the UI visibly
reverts.

---

## Polling cadence (frontend defaults, `src/api/queries.ts`)

| Data                                     | Interval                                          | Reason |
| ---------------------------------------- | ------------------------------------------------- | ------ |
| `/clusters`                              | 30 s                                              | rarely changes |
| `/tags`, `/tag-categories`               | 30 s                                              | rarely changes; refetched after every tag write |
| `/hosts`, `/hosts/:id`, `/folders`       | 15 s                                              | keep agent status / online fresh |
| `/vms`, `/vms/:id`, `/hosts/:id/vms`     | 10 s                                              | catch state changes between agent inventory posts |
| `/tasks/:id`                             | 1.5 s while running, stops when terminal          | responsive actions |
| `/tasks` (Recent Tasks dock)             | 1.5 s while any task is active, else 4 s          | live progress |
| `/tasks?vmId=` · `/tasks?hostId=`        | 6 s                                               | per-entity Tasks tab |
| `/tasks?limit=200` (Task History)        | 10 s, only while the dialog is open               | history view |
| `/hosts/:id/metrics` · `/vms/:id/metrics` | 15 s · 10 s, only while the metrics tab is open  | the agent samples ~every 5 min |
| `/vms/:id/thumbnail`                     | none - refetched when the VM's `lastSeen` changes | a new image only comes with an agent `vm_inventory` |
| `/templates`                             | 15 s                                              | a new export shows up in the tree |
| `/vm-locks`                              | 10 s, only while the dialog is open               | admin view |
| `/agent-binaries`                        | 30 s, only while it is on screen                  | admin view |
| `/vlans`, `/isos`, `/hosts/:id/isos`, `/hosts/:id/templates` | none (fetched on demand)      | rarely change |

Optional: support `ETag` / `If-None-Match` on the list endpoints to make polling cheap.

---

## Open questions for the backend team

1. Does `/vms` need pagination at realistic scale, or is per-host fetching enough?
2. Folder nesting: stay flat, or add `Folder.parentId` for a tree (arbitrary depth,
   or one level)?
3. Is there (or will there be) a push channel (SSE / WebSocket) to replace polling?
