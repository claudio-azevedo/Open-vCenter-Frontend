# ovc-backend REST API - contract

This is the REST surface `ovc-frontend` expects from `ovc-backend`, mirrored in
[`src/api/types.ts`](../src/api/types.ts) and [`src/api/endpoints/`](../src/api/endpoints/).

Status: **implemented** by `ovc-backend` (milestone 1 - read endpoints + VM power
actions). Responses are camelCase. Run the backend with `docker compose up` in
`../ovc-backend`, then point the frontend at it with `VITE_API_URL=http://localhost:8000/api`.

---

## Conventions

- **Base URL** - `import.meta.env.VITE_API_URL` (falls back to `/api`).
- **Content type** - `application/json` for requests and responses.
- **Auth** - `Authorization: Bearer <JWT>` (OIDC access token). The browser calls
  the frontend's `/frontend-api/api/*` proxy with its session cookie; the proxy
  swaps it for the bearer token and forwards here. `ovc-backend` verifies the JWT
  (JWKS) and reads roles from the claim at `OVC_OIDC_ROLES_CLAIM` (default
  `resource_access.${client_id}.roles`). `OVC_AUTH_MODE=stub` bypasses this for
  local dev.
- **Errors** - non-2xx responses carry:
  ```json
  { "error": { "code": "FORBIDDEN", "message": "…", "details": {} } }
  ```
- **Lists** - milestone 1 returns bare arrays. If pagination is needed later, switch
  to `{ "items": [...], "total": n }` with `?page` & `?pageSize`; the frontend will
  adapt the client in one place.
- **Timestamps** - ISO-8601 UTC strings.
- **IDs** - every backend-generated id (vm / host / cluster / folder / task / user) is a
  **UUIDv4 string**. `vm.id` is backend-generated; the hypervisor-native id (the
  Hyper-V VM GUID) is a **separate** field `vm.vmUuid` (`string | null` - null until
  the host agent first reports the VM). The same `vmUuid` can appear on more than one
  host (a clone, an exported-then-imported VM), so route all VM operations by `vm.id`.
  `host.shortId` is a 10-char handle used in agent/queue plumbing - informational only.
  `template.id` / `iso.id` are agent-owned strings (an export UUID / an MD5 checksum).
  Treat all ids as opaque.
- **Hypervisor** - every `Cluster` and `Host` carries `hypervisor` (`"hyperv"` is the
  only value today; `"libvirt"` / `"kvm"` planned). A cluster is hypervisor-homogeneous:
  `POST /hosts` / `PATCH /hosts` reject a host whose `hypervisor` differs from the
  cluster's (`400 INVALID`). `POST /hosts` and `POST /clusters` accept an optional
  `hypervisor` (default `"hyperv"`).

---

## RBAC

Access is scoped **Cluster > Host > Folder** and enforced **server-side** from the
authenticated principal:

- the `ADMINISTRATOR` role (a client role in the access token) = unconditional
  full access, no scope grant needed;
- other principals see only what their `ScopeGrant`s cover;
- list endpoints return only the entities the caller may see;
- direct reads of a forbidden entity return `403` with `error.code = "FORBIDDEN"`;
- the frontend sends **no** scope header - it does not decide access. A signed-in
  user with **no roles** is stopped at `/access-denied` before any API call.

---

## Entities

See [`src/api/types.ts`](../src/api/types.ts) for the exact TypeScript shapes. Summary:

| Type                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cluster`               | `id, name, hypervisor, hostCount, vmCount`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Host`                  | `id, shortId, clusterId, name, fqdn, ipAddress, hypervisor, online, agent, vmCount` - `fqdn` / `ipAddress` are `string \| null`, resolved by the agent (null until it first checks in)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `HostAgentStatus`       | `version, lastSeen, connected, refreshIntervals {vm,host}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `HostHardwareInventory` | `cpu {model,sockets,cores,logical}`, `memoryBytes`, `storage[] {path,label?,totalBytes,freeBytes}`, `os {caption,version}`, `network[] {name,description?,mac,speedBps,connected}` (every physical host NIC), `vSwitches[] {name,type,netAdapter?}` (virtual switches), plus optional `system {manufacturer,model}`, `bootTime` (ISO - derive uptime), `load {cpuPercent,memoryPercent}` (snapshot, not live), `cluster {clustered,name?,state,nodes[]}` (Windows Failover Cluster - **not** `clusterId`), `hyperv {defaultVmPath,defaultVhdPath}` - from `host_hwinventory`                                                                                                 |
| `HostDetail`            | `Host & { hardware: HostHardwareInventory \| null }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `HostAgentConfig`       | `hostId, rabbitmqUrl, configIni, filename` - the agent's `config.ini` for onboarding (`hostId` is the host **shortId** - what the agent uses as its queue prefix - plus the RabbitMQ URL with per-host credentials)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Folder`                | `id, name, clusterId, hostId` - a logical VM folder, **application-managed** (not agent-reported). Scoped to exactly one of a cluster or a standalone host. Flat (no nesting).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Vlan`                  | `id, name, vlanId (1-4094 tag), description, isDefault, clusterId, hostId` - an 802.1Q VLAN, **application-managed**. Scoped like `Folder`; a clustered host uses its cluster's VLANs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Vm`                    | `id, vmUuid, hostId, folderId, name, state, lastSeen (ISO-8601 \| null - when the host agent last reported this VM), firmware (`"BIOS"`\|`"UEFI"`), uptimeSec, vcpu, cpuUsagePercent (simple hypervisor avg), memory {assignedBytes,minBytes,maxBytes,dynamic,demandBytes}, disks[] {id,path,controller,sizeBytes,usedBytes,type (Fixed/Dynamic),format (VHDX/VHD)}, nics[] {id,name,switchName,vlanId,macAddress,ipAddresses[],connected}, snapshots[] {id,name,createdAt,parentId,type}, secureBoot, secureBootTemplate, nestedVirtualization, autoStartAction, autoStartDelaySec, autoStopAction, configPath, dvdPath, highlyAvailable, notes, metricsEnabled, createdAt` |
| `VmState`               | `Running \| Off \| Paused \| Saved \| Starting \| Stopping \| Saving \| Pausing \| Resuming \| Restarting \| Deleting \| Unknown`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `HostMetricSample`      | `ts, cpuPercent, memPercent, diskLatencyMs, netRxBps, netTxBps, detail` - one quick-metrics sample (see below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `VmMetricSample`        | `ts, cpuPercent, memBytes, diskBytes, netRxBytes, netTxBytes, detail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Template` / `Iso`      | per-host image inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Task`                  | async op tracking - `id, kind, status, targetType, targetId, targetName?, requestedBy, progress, createdAt, startedAt, finishedAt, result, error, correlationId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `TaskStatus`            | `queued \| running \| succeeded \| failed \| timeout`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

`correlationId` should carry the RabbitMQ message id used on `<hostid>.request` /
`<hostid>.response`, so an operator can trace a task to the queue.

`progress` is `0–100` when the agent reports it, else `null` (the UI then shows a
coarse bar from `status`). `targetName` is the VM/host display name if the backend
can resolve it cheaply (the UI falls back to `targetId`). `requestedBy` is derived
from the caller's token - the frontend never sends an identity.

The **Recent Tasks** dock polls `GET /tasks` (no filter → newest first, all the
caller may see); a small `?limit=` would let it cap the payload.

---

## Endpoints

### Read

| Method | Path                      | Query                            | Response                                                                                                                                                          |
| ------ | ------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                 | -                                | `{ ok, db, cache, rabbit }`                                                                                                                                       |
| GET    | `/me`                     | -                                | `AuthUser & { scopes }`                                                                                                                                           |
| GET    | `/clusters`               | -                                | `Cluster[]`                                                                                                                                                       |
| GET    | `/clusters/:id`           | -                                | `Cluster`                                                                                                                                                         |
| GET    | `/hosts`                  | `clusterId?`                     | `Host[]`                                                                                                                                                          |
| GET    | `/hosts/:id`              | -                                | `HostDetail`                                                                                                                                                      |
| GET    | `/hosts/:id/vms`          | -                                | `Vm[]`                                                                                                                                                            |
| GET    | `/hosts/:id/templates`    | -                                | `Template[]`                                                                                                                                                      |
| GET    | `/hosts/:id/isos`         | -                                | `Iso[]`                                                                                                                                                           |
| GET    | `/hosts/:id/agent-config` | -                                | `HostAgentConfig` - **admin only** (carries RabbitMQ credentials). Onboarding info for a host whose agent has never checked in; the "Setup Agent" tab.            |
| GET    | `/folders`                | `hostId?`, `clusterId?`          | `Folder[]`                                                                                                                                                        |
| GET    | `/vlans`                  | `hostId?`, `clusterId?`          | `Vlan[]`. `hostId` resolves to the host's own VLANs **plus** its cluster's (if any).                                                                              |
| GET    | `/hosts/:id/metrics`      | -                                | `HostMetricSample[]` - quick metrics for the **last hour**, oldest first                                                                                          |
| GET    | `/vms`                    | `hostId?`, `folderId?`, `state?` | `Vm[]`                                                                                                                                                            |
| GET    | `/vms/:id`                | -                                | `Vm`                                                                                                                                                              |
| GET    | `/vms/:id/metrics`        | -                                | `VmMetricSample[]` - last hour, oldest first. Empty until metering is enabled on the VM                                                                           |
| GET    | `/tasks`                  | `vmId?`, `hostId?`, `status?`    | `Task[]`                                                                                                                                                          |
| GET    | `/tasks/:id`              | -                                | `Task`                                                                                                                                                            |
| GET    | `/templates` · `/isos`    | -                                | flat cross-host lists                                                                                                                                             |
| GET    | `/agent-binaries`         | `hypervisor?`                    | `AgentBinary[]` - **admin only**. Uploaded ovc-agent builds, newest first.                                                                                        |
| GET    | `/agent-binaries/storage` | -                                | `AgentStorageInfo` - **admin only**. Read-only view of the binary store (`local`/`s3`).                                                                           |
| GET    | `/hosts/:id/agent-bundle` | -                                | **admin only**. `application/zip`: `ovc-agent.exe` (active build) + this host's `config.ini` + `install.ps1` + `README.txt`. Used as a plain `<a href>` download. |

`GET /folders` with no filter returns all folders the caller may see.

### Organization (synchronous - DB only, no agent)

| Method | Path            | Body                                                                                                                                                     | Response                                                                                                                                                                                                  |
| ------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/clusters`     | `{ name, hypervisor? }` (default `"hyperv"`)                                                                                                             | `201 Cluster`                                                                                                                                                                                             |
| PATCH  | `/clusters/:id` | `{ name }`                                                                                                                                               | `Cluster` (rename)                                                                                                                                                                                        |
| DELETE | `/clusters/:id` | -                                                                                                                                                        | `204`. Only an **empty** cluster (no member hosts) can be deleted; otherwise `400 INVALID`. Cluster-scoped folders go with it (their VMs are detached).                                                   |
| POST   | `/hosts`        | `{ name, clusterId?, hypervisor? }` (default `"hyperv"`; must match the cluster's)                                                                       | `201 HostDetail` (also provisions the host's RabbitMQ queues + agent user). `fqdn` / `ipAddress` are filled in by the agent on its first `agent_status`.                                                  |
| PATCH  | `/hosts/:id`    | any subset of `{ name, fqdn, clusterId }` (only keys present in the body are applied; `clusterId: null` → standalone; `fqdn` normally left to the agent) | `HostDetail`. Changing `clusterId` clears every folder assignment for the host's VMs and drops any host-scoped folders.                                                                                   |
| DELETE | `/hosts/:id`    | -                                                                                                                                                        | `204`. Cascades: the host's VM records, host-scoped folders, templates and ISOs are deleted. The host's RabbitMQ queues + agent user are torn down (best-effort). The virtualization host is not touched. |
| POST   | `/folders`      | `{ name, clusterId? \| hostId? }` (exactly one)                                                                                                          | `201 Folder`. `hostId` must be a **standalone** host.                                                                                                                                                     |
| PATCH  | `/folders/:id`  | `{ name }`                                                                                                                                               | `Folder`                                                                                                                                                                                                  |
| DELETE | `/folders/:id`  | -                                                                                                                                                        | `204`. VMs in the folder are detached (`folderId → null`), not deleted.                                                                                                                                   |
| POST   | `/vlans`        | `{ name, vlanId, description?, isDefault?, clusterId? \| hostId? }` (exactly one scope)                                                                  | `201 Vlan`. `hostId` must be **standalone**. Setting `isDefault` clears it from any other VLAN in the scope.                                                                                              |
| PATCH  | `/vlans/:id`    | any subset of `{ name, description, isDefault }`                                                                                                         | `Vlan`                                                                                                                                                                                                    |
| DELETE | `/vlans/:id`    | -                                                                                                                                                        | `204`                                                                                                                                                                                                     |
| PATCH  | `/vms/:id`      | `{ folderId }` (`null` → remove from folder)                                                                                                             | `Vm`. The folder must be reachable from the VM's host: a cluster folder needs the host in that cluster; a host folder needs the host to be that (standalone) host. Otherwise `400 INVALID`.               |

Folders are created by the frontend and never reported by the agent. `host_inventory`
carries hardware only.

### VM power / lifecycle actions

All return **`202 Accepted`** with `{ "task": Task }` (status `queued`). The work is
performed asynchronously by the host agent over RabbitMQ.

| Method | Path                               | Agent request                                                                            |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| POST   | `/vms`                             | `vm_create` - see below. **`201`** with `{ vm: Vm, task: Task }` (not `202`).            |
| POST   | `/vms/:id/actions/start`           | `vm_start` (also resumes a Paused VM)                                                    |
| POST   | `/vms/:id/actions/shutdown`        | `vm_shutdown` (guest OS shutdown)                                                        |
| POST   | `/vms/:id/actions/stop`            | `vm_stop` (hard power-off)                                                               |
| POST   | `/vms/:id/actions/restart`         | `vm_restart`                                                                             |
| POST   | `/vms/:id/actions/pause`           | `vm_pause`                                                                               |
| POST   | `/vms/:id/actions/enable_metrics`  | `vm_enable_metrics` - turn on Hyper-V resource metering (does not change VM power state) |
| POST   | `/vms/:id/actions/disable_metrics` | `vm_disable_metrics`                                                                     |
| DELETE | `/vms/:id`                         | `vm_delete`                                                                              |
| DELETE | `/vms/:id/from-inventory`          | _(none - DB-only)_ `200 { removed: true }`                                               |

#### Offline hosts and `Unknown` VMs

When a host agent stops checking in (its last `agent_status` is older than
`agent_offline_after_seconds`, default 120), the host reads `online: false` **and
every VM it owns is reported with `state: "Unknown"`** (the fast-cache overlay is
ignored). While the host is offline:

- All agent-backed VM endpoints - every power/lifecycle/management action, `POST
/vms/:id/clone`, `DELETE /vms/:id`, and creating a VM on that host - return
  **409** `{ error: { code: "HOST_OFFLINE", message } }`.
- `DELETE /vms/:id/from-inventory` removes the VM record from the database only
  (its disks/nics/snapshots cascade; any lock + cached state are cleared). No
  agent request. Returns `200 { removed: true }`. Use it to clear out a VM
  stranded on a host that is gone for good. It is **refused with 409
  `HOST_ONLINE`** while the host agent is still online and has reported the VM
  (deleting the row then would just have the next `vm_inventory` recreate it); a
  never-reported placeholder (`vmUuid: null`) can always be removed.

`Vm.lastSeen` is the timestamp of the last inventory refresh that touched the row

- the frontend shows it as "Last seen" on the VM summary, mirroring the host's.

#### `POST /vms` - create a VM

Body: `{ name (alnum/-/_), hostId, os: windows|linux|other, firmware: BIOS|UEFI,
cpuCount, memoryMb, memoryDynamic, memoryMinMb?, memoryMaxMb?, destinationStorage?,
notes?, vlanId?, switchName?, nestedVirtualization, haEnabled, dvd?, startNow,
disks: [{ name (alnum ≤6), type: Fixed|Dynamic, sizeGb }] }`.

`memoryMb` is the startup RAM. `memoryDynamic` (default `false`) makes it dynamic;
`memoryMinMb`/`memoryMaxMb` then bound the balloon (omit → agent default 512 MB /
4× startup). Validated `min ≤ startup ≤ max`.

The backend inserts a placeholder `Vm` (`vmUuid: null`, `state: Unknown`),
queues a `vm_create` task and returns both. When the agent finishes it reports
the real Hyper-V GUID + state, which the backend stamps onto the row; on failure
the placeholder is removed.

#### Management actions - **stubs** (agent not implemented yet)

Same `202 → { task }` shape. Each accepts an optional body `{ "params": { … } }`
forwarded to the agent as extra `AgentRequest.params` (flat - `vm_id`, `action`
and the per-action keys all sit on `params`). With no agent handler the
backend's timeout sweeper flips the task to `timeout` after `task_timeout_seconds`.

| Method | Path                                                     | Agent request                           | `params`                                                                                                                                                                                                                                                                              |
| ------ | -------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/vms/:id/actions/rename`                                | `vm_rename`                             | `new_name`                                                                                                                                                                                                                                                                            |
| POST   | `/vms/:id/actions/edit`                                  | `vm_edit`                               | `cpu_count`, `memory_mb`, `notes`, `nested_virtualization`, `secure_boot`(+`secure_boot_template`), `automatic_start`(+`automatic_start_delay`), `automatic_stop`, `add_disk[]`/`edit_disk[]`/`remove_disk[]`, `add_nic[]`/`edit_nic[]`/`remove_nic[]` (NIC specs take `switch_name`) |
| POST   | `/vms/:id/actions/migrate`                               | `vm_migrate`                            | `target_host`                                                                                                                                                                                                                                                                         |
| POST   | `/vms/:id/actions/move_storage`                          | `vm_move`                               | `destination_storage`                                                                                                                                                                                                                                                                 |
| POST   | `/vms/:id/actions/startup_change`                        | `vm_startup_change`                     | `automatic_start`, `automatic_start_delay`                                                                                                                                                                                                                                            |
| POST   | `/vms/:id/actions/mount_dvd`                             | `mount_dvd`                             | `path`                                                                                                                                                                                                                                                                                |
| POST   | `/vms/:id/actions/eject_dvd`                             | `eject_dvd`                             | -                                                                                                                                                                                                                                                                                     |
| POST   | `/vms/:id/actions/enable_ha` \| `disable_ha`             | `enable_ha` \| `disable_ha`             | -                                                                                                                                                                                                                                                                                     |
| POST   | `/vms/:id/actions/export_template`                       | `vm_export_template`                    | `template_name`, `notes?`                                                                                                                                                                                                                                                             |
| POST   | `/vms/:id/actions/notes_edit`                            | `notes_edit`                            | `notes`                                                                                                                                                                                                                                                                               |
| POST   | `/vms/:id/actions/snapshot_create`                       | `snapshot_create`                       | `name?`                                                                                                                                                                                                                                                                               |
| POST   | `/vms/:id/actions/snapshot_remove` \| `snapshot_restore` | `snapshot_remove` \| `snapshot_restore` | `snapshot_id`                                                                                                                                                                                                                                                                         |
| POST   | `/vms/:id/clone`                                         | `vm_clone`                              | `name`, `target_host` (+ `source_vm_id` added by backend)                                                                                                                                                                                                                             |

### Agent management (admin only)

Uploading and rolling out the `ovc-agent` binary - the "Agent Management" screen
plus host onboarding. See `../ovc-backend/docs/agent-queue-contract.md` →
`host_update_agent` for the wire contract.

| Method | Path                              | Body                                                                                                         | Response                                                                                                                                                |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/agent-binaries`                 | **multipart** `file` + `version`, `hypervisor?` (`hyperv`), `notes?`, `makeActive?`                          | `201 AgentBinary`. SHA-256 + size computed server-side; `(version, hypervisor)` must be unique.                                                         |
| PATCH  | `/agent-binaries/:id`             | any subset of `{ notes, isActive }`                                                                          | `AgentBinary`. `isActive: true` demotes the previous active build for that hypervisor.                                                                  |
| DELETE | `/agent-binaries/:id`             | -                                                                                                            | `204`. Refused with `409 ACTIVE_BINARY` while it is the active build.                                                                                   |
| POST   | `/agent-binaries/:id/rollout`     | `{ hostIds?: string[] }` (default: every online host on the binary's hypervisor whose agent version differs) | `{ tasks: Task[], skipped: [{ hostId, hostName, reason }] }`                                                                                            |
| POST   | `/hosts/:id/actions/update-agent` | `{ binaryId? }` (default: active build for the host's hypervisor)                                            | `202 { task }`. `409` `HOST_OFFLINE` / `AGENT_UPGRADE_IN_PROGRESS` / `AGENT_ALREADY_CURRENT` / `NO_ACTIVE_AGENT_BINARY` / `AGENT_DOWNLOAD_UNAVAILABLE`. |

`GET /agent-binaries/:id/download` exists too but is for the **agent** (local
storage mode), guarded by a short-lived token in the URL - not called by the
frontend.

### VM lock

Every mutating agent task (power, edit, disk, snapshot, clone, …) takes a lock on
the VM for the task's lifetime, so a second operation can't race it.

- While locked, `VmOut.lock` is `{ taskId, kind, requestedBy, acquiredAt }`
  (otherwise `null`). The UI disables all VM actions and shows a badge.
- A locked VM's action/edit endpoints return **409** `{ error: { code: "VM_LOCKED",
message, details: { lock } } }`.
- The lock is released the moment the task reaches a terminal state
  (succeeded/failed/timeout); it also auto-expires shortly after the task timeout,
  so a crashed worker never strands it.
- `GET /vm-locks` - all active locks (admin; each row adds `vmName`, `ttl`,
  `taskStatus`). `DELETE /vm-locks/:vmId` - force-release one (admin, stale-lock
  recovery, works even if the VM row is gone). `DELETE /vm-locks` - force-release all.
  The frontend surfaces this as an admin-only **View ▸ VM Locks…** dialog.

### Quick metrics

Lightweight host/VM load samples - **not** a monitoring stack. The agent samples
every `metrics_interval` seconds (default 300) and the backend keeps only the last
hour. `GET /hosts/:id/metrics` (CPU %, memory %, disk latency ms, network bps) is
always populated; `GET /vms/:id/metrics` (CPU %, memory / disk / network bytes from
Hyper-V resource metering) is empty until `POST /vms/:id/actions/enable_metrics`.
`Vm.metricsEnabled` reflects whether metering is on. `detail` on each sample carries
the raw per-disk / per-nic / per-VM breakdown; a `HostMetricSample.detail` also has
`memUsedBytes` / `memTotalBytes` and `disks[] {name,readLatencyMs,writeLatencyMs,queueLength}`
/ `net[] {name,rxBps,txBps}`.

The frontend shows host samples in a **Host Metrics** tab on the host detail
(always present once the agent has checked in) - Processor / Memory / Network /
Disk-latency charts, mirroring the VM's **VM Metrics** tab.

---

## Async model

```
POST /vms/:id/actions/start
        │  validate + RBAC
        ▼
  write JSON to <hostid>.request        ──►  agent executes vm_start
        │                                          │
   202 { task: {status:"queued"} }                 ▼
        │                              reply on <hostid>.response
        ▼                                          │
 frontend polls GET /tasks/:id  ◄────  worker: update task row
   every 1.5s until terminal            + update VM state in Valkey  ⚠️
        │
        ▼
 on succeeded/failed → refetch /vms, /hosts
```

⚠️ **Critical for the UI:** on consuming `<hostid>.response` for a power op, the
worker must update the VM `state` in the Valkey cache **immediately** - not wait for
the next periodic `vm_inventory` (up to `vm_refresh_interval`, e.g. 180 s). The
frontend flips the VM to a transitional state optimistically and, after the task
finishes, re-reads `/vms`; if the cache still shows the old state the UI visibly
reverts.

---

## Polling cadence (frontend defaults)

| Data                                     | Interval                                 | Reason                                            |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `/clusters`                              | 30 s                                     | rarely changes                                    |
| `/hosts`, `/hosts/:id`                   | 15 s                                     | keep agent-status / online fresh                  |
| `/vms`, `/vms/:id`                       | 10 s                                     | catch state changes between agent inventory posts |
| `/tasks/:id`                             | 1.5 s while running, stop when terminal  | responsive power actions                          |
| `/hosts/:id/metrics`, `/vms/:id/metrics` | 60 s (only while a metrics view is open) | agent samples ~every 5 min                        |

Optional: support `ETag` / `If-None-Match` on the list endpoints to make polling cheap.

---

## Open questions for the backend team

1. Auth handoff - how long does the cookie-session era last; does `/me` exist in both eras?
2. Does `/vms` need pagination at realistic scale, or is per-host fetching enough?
3. Folder nesting - arbitrary depth, or one level? (`Folder.parentId` allows a tree.)
4. Do `vm_create` / `vm_edit` (future) return a `Task` or the resulting `Vm`?
5. Canonical `error.code` vocabulary.
6. Is there (or will there be) a push channel (SSE / WebSocket) to replace polling?
