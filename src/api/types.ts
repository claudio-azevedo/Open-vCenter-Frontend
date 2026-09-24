/**
 * Domain types for the ovc-backend REST API.
 * Kept in sync with docs/api-contract.md - that file is the source of truth for
 * the backend team.
 */

export type Iso8601 = string;

// ---- Cluster / Host / Folder -------------------------------------------------

/** Which virtualization backend a host/cluster runs. Only 'hyperv' exists today;
 *  add 'libvirt' | 'kvm' when their agents land. */
export type Hypervisor = "hyperv";

export const HYPERVISOR_LABEL: Record<Hypervisor, string> = {
  hyperv: "Hyper-V",
};

export interface Cluster {
  id: string;
  name: string;
  hypervisor: Hypervisor;
  hostCount: number;
  vmCount: number;
}

export interface HostAgentStatus {
  version: string | null;
  lastSeen: Iso8601 | null;
  connected: boolean;
  refreshIntervals: { vm: number; host: number } | null;
}

export interface HostHardwareInventory {
  cpu: { model: string; sockets: number; cores: number; logical: number };
  memoryBytes: number;
  storage: Array<{
    path: string;
    label?: string | null;
    totalBytes: number;
    freeBytes: number;
  }>;
  os: { caption: string; version: string };
  /** Every physical host NIC - `connected` reflects link state. */
  network: Array<{
    name: string;
    /** InterfaceDescription - the adapter model. */
    description?: string;
    mac: string;
    speedBps: number;
    connected?: boolean;
    status?: string | null;
    linkSpeed?: string | null;
    driverVersion?: string | null;
    driverDate?: string | null;
    driverProvider?: string | null;
    firmwareVersion?: string | null;
  }>;
  /** Virtual switches / bridges defined on the host. */
  vSwitches?: Array<{
    name: string;
    id?: string | null;
    type: string;
    netAdapter?: string | null;
    allowManagementOS?: boolean | null;
    /** Switch Embedded Teaming (SET). */
    embeddedTeaming?: boolean | null;
    teamMembers?: string[];
    loadBalancingAlgorithm?: string | null;
    bandwidthReservationMode?: string | null;
  }>;
  /** Fibre Channel host bus adapters (best-effort; empty without FC). */
  hbas?: Array<{
    manufacturer: string;
    model: string;
    modelDescription: string;
    serialNumber: string;
    driverVersion: string;
    firmwareVersion: string;
    hardwareVersion: string;
    nodeWWN: string;
    portWWN: string;
    state: string;
    speed: string;
    connectionType: string;
  }>;
  system?: { manufacturer: string; model: string } | null;
  /** ISO-8601 - host last boot time; derive uptime from it. */
  bootTime?: Iso8601 | null;
  /** CPU / memory utilisation at the last hardware refresh (not live). */
  load?: { cpuPercent: number | null; memoryPercent: number | null } | null;
  /** Windows Failover Cluster the host belongs to - not the app-level `clusterId`. */
  cluster?: {
    clustered: boolean;
    name?: string | null;
    state: string;
    nodes: string[];
  } | null;
  hyperv?: {
    defaultVmPath?: string | null;
    defaultVhdPath?: string | null;
  } | null;
}

export interface Host {
  id: string; // backend UUID - use this everywhere
  shortId: string; // 10-char [A-Za-z0-9] handle used in agent/queue plumbing
  clusterId: string | null;
  name: string;
  fqdn: string | null; // agent-resolved; null until the agent first checks in
  ipAddress: string | null; // agent-resolved
  hypervisor: Hypervisor;
  online: boolean;
  agent: HostAgentStatus;
  vmCount: number;
}

export interface HostDetail extends Host {
  hardware: HostHardwareInventory | null;
}

/** `GET /hosts/:id/agent-config` - onboarding info for a not-yet-connected host. */
export interface HostAgentConfig {
  hostId: string;
  rabbitmqUrl: string;
  configIni: string;
  filename: string;
}

/** `GET /hosts/:id/agent-install-url` - tokenized install.ps1 URL + a paste-ready
 * elevated-PowerShell one-liner. Admin only. */
export interface HostAgentInstall {
  url: string;
  command: string;
  expiresAt: string;
  filename: string;
}

/** An uploaded ovc-agent build (Agent Management). `GET /agent-binaries`. */
export interface AgentBinary {
  id: string;
  version: string;
  hypervisor: Hypervisor;
  filename: string;
  sizeBytes: number;
  checksumSha256: string;
  contentType: string;
  storageBackend: "local" | "s3";
  notes: string | null;
  isActive: boolean;
  uploadedBy: string;
  createdAt: Iso8601;
}

/** `GET /agent-binaries/storage` - read-only view of the binary store. */
export interface AgentStorageInfo {
  backend: "local" | "s3";
  location: string;
  downloadUrlTtlSeconds: number;
  downloadsEnabled: boolean;
}

export interface AgentRolloutSkip {
  hostId: string;
  hostName: string;
  reason: string;
}

/** `POST /agent-binaries/:id/rollout`. */
export interface AgentRolloutResult {
  tasks: Task[];
  skipped: AgentRolloutSkip[];
}

export interface Folder {
  id: string;
  name: string;
  /** A folder is scoped to exactly one of a cluster or a standalone host. */
  clusterId: string | null;
  hostId: string | null;
}

/** An 802.1Q VLAN definition, application-managed. Scoped to exactly one of a
 *  cluster or a standalone host (a host in a cluster uses its cluster's VLANs). */
export interface Vlan {
  id: string;
  name: string;
  /** The numeric 802.1Q tag (1-4094) - what a VM NIC references. */
  vlanId: number;
  description: string | null;
  isDefault: boolean;
  clusterId: string | null;
  hostId: string | null;
}

// ---- VM --------------------------------------------------------------------

export type VmState =
  | "Running"
  | "Off"
  | "Paused"
  | "Saved"
  | "Starting"
  | "Stopping"
  | "Saving"
  | "Pausing"
  | "Resuming"
  | "Restarting"
  | "Deleting"
  | "Unknown";

export const TRANSITIONAL_VM_STATES: ReadonlySet<VmState> = new Set<VmState>([
  "Starting",
  "Stopping",
  "Saving",
  "Pausing",
  "Resuming",
  "Restarting",
  "Deleting",
]);

export interface VmDisk {
  id: string;
  path: string;
  /** e.g. "SCSI 0:1" - controller type + number:location. */
  controller: string;
  sizeBytes: number;
  usedBytes: number | null;
  /** provisioning: "Fixed" | "Dynamic" | "Differencing". */
  type: "Fixed" | "Dynamic" | "Differencing" | string;
  /** container format: "VHDX" | "VHD" | "passthrough". */
  format: string;
}

/** Virtualizer-neutral boot firmware (Hyper-V: BIOS = gen 1, UEFI = gen 2). */
export type VmFirmware = "BIOS" | "UEFI";

export interface VmNic {
  id: string;
  name: string;
  switchName: string;
  /** 802.1Q access VLAN tag on this adapter, when the agent reports one. */
  vlanId: number | null;
  macAddress: string;
  ipAddresses: string[];
  connected: boolean;
}

export interface VmSnapshot {
  id: string;
  name: string;
  createdAt: Iso8601 | null;
  parentId: string | null;
  /** "Standard" | "Production" | "Recovery" | … - hypervisor-defined. */
  type: string | null;
}

export interface Vm {
  id: string; // backend UUID - route all VM operations by this
  vmUuid: string | null; // Hyper-V VM GUID; null until first reported by the agent
  hostId: string;
  folderId: string | null;
  name: string;
  state: VmState;
  firmware: VmFirmware;
  uptimeSec: number | null;
  vcpu: number;
  /** simple hypervisor CPU-usage average (percent), refreshed each inventory. */
  cpuUsagePercent: number | null;
  memory: {
    assignedBytes: number;
    minBytes: number | null;
    maxBytes: number | null;
    dynamic: boolean;
    /** current guest memory demand - a simple hypervisor average. */
    demandBytes: number | null;
  };
  disks: VmDisk[];
  nics: VmNic[];
  snapshots: VmSnapshot[];
  secureBoot: boolean | null;
  secureBootTemplate: string | null;
  nestedVirtualization: boolean;
  /** "Nothing" | "StartIfRunning" | "Start" */
  autoStartAction: string | null;
  autoStartDelaySec: number | null;
  /** "TurnOff" | "Save" | "ShutDown" */
  autoStopAction: string | null;
  /** hypervisor-side folder holding the VM's config files. */
  configPath: string | null;
  /** currently-mounted ISO/DVD image path, when any. */
  dvdPath: string | null;
  /** part of a HA / failover cluster resource group. */
  highlyAvailable: boolean;
  notes: string | null;
  metricsEnabled: boolean;
  createdAt: Iso8601;
  /** timestamp of the last inventory refresh that touched this row. */
  lastSeen: Iso8601 | null;
  /** set while a mutating operation is running on the VM - block further ops. */
  lock: VmLock | null;
}

export interface VmLock {
  taskId: string;
  /** agent function holding the lock, e.g. "vm_edit", "vm_start". */
  kind: string;
  requestedBy: string;
  acquiredAt: Iso8601;
}

/** One row of the admin `GET /vm-locks` view. */
export interface VmLockEntry extends VmLock {
  vmId: string;
  vmName: string | null;
  /** seconds until the lock's safety-net TTL expires. */
  ttl: number;
  /** the backing task's status, when it still exists. */
  taskStatus: TaskStatus | null;
}

/**
 * One quick-metrics sample from `GET /vms/:id/metrics` (last hour, oldest first).
 * Empty until Hyper-V resource metering is enabled on the VM. `mem_bytes` is an
 * average; `disk_bytes` / `net_*_bytes` are cumulative counters - diff
 * consecutive samples for a rate.
 */
export interface VmMetricSample {
  ts: Iso8601;
  cpuPercent: number | null;
  memBytes: number | null;
  diskBytes: number | null;
  netRxBytes: number | null;
  netTxBytes: number | null;
}

/**
 * `GET /hosts/:id/metrics` - a short rolling time-series of quick host metrics
 * (the agent samples every few minutes, the last hour is kept). Always collected.
 * `netRxBps` / `netTxBps` are already a per-second rate (not cumulative);
 * `cpuPercent` / `memPercent` are gauges; `diskLatencyMs` is a gauge in ms.
 * `detail` carries the per-disk / per-nic breakdown and `memUsedBytes` /
 * `memTotalBytes`.
 */
export interface HostMetricSample {
  ts: Iso8601;
  cpuPercent: number | null;
  memPercent: number | null;
  diskLatencyMs: number | null;
  netRxBps: number | null;
  netTxBps: number | null;
  detail: {
    memUsedBytes?: number | null;
    memTotalBytes?: number | null;
    disks?: Array<{
      name: string;
      readLatencyMs?: number | null;
      writeLatencyMs?: number | null;
      queueLength?: number | null;
    }>;
    net?: Array<{ name: string; rxBps?: number | null; txBps?: number | null }>;
  } | null;
}

export type VmOs = "windows" | "linux" | "other";

export interface VmDiskSpec {
  /** Alphanumeric, max 6 chars - used in the .vhdx filename. */
  name: string;
  type: "Fixed" | "Dynamic";
  sizeGb: number;
}

/** `POST /vms` body - provision a brand-new VM on a host. */
export interface VmCreateBody {
  name: string;
  hostId: string;
  os: VmOs;
  firmware: VmFirmware;
  cpuCount: number;
  /** startup RAM (MB). With `memoryDynamic` the guest balloons between min/max. */
  memoryMb: number;
  memoryDynamic: boolean;
  /** dynamic memory only; omit to let the agent pick a default. */
  memoryMinMb?: number;
  memoryMaxMb?: number;
  /**
   * Target volume / CSV the VM should live on (e.g. `E:\`,
   * `C:\ClusterStorage\Volume2`). Empty / omitted → the host's default Hyper-V
   * VM path. The host agent resolves the actual per-VM folder.
   */
  destinationStorage?: string;
  notes?: string;
  vlanId?: number | null;
  switchName?: string | null;
  nestedVirtualization: boolean;
  haEnabled: boolean;
  dvd?: string | null;
  startNow: boolean;
  disks: VmDiskSpec[];
}

/**
 * POST /vms/clone - a new VM cloned from an off VM (`source: 'vm'`) or deployed
 * from an exported template (`source: 'template'`). Disks, firmware and NICs are
 * inherited from the source; sizing defaults to the source's when omitted.
 */
export interface VmCloneBody {
  name: string;
  hostId: string;
  source: "vm" | "template";
  sourceVmId?: string;
  templateId?: string;
  cpuCount?: number;
  memoryMb?: number;
  destinationStorage?: string;
  notes?: string;
  vlanId?: number | null;
  nestedVirtualization: boolean;
  haEnabled: boolean;
  startNow: boolean;
  /** template deploys only: convert the deployed VM's disks to Fixed after import */
  expandDisks?: boolean;
}

// ---- Templates / ISOs -----------------------------------------------------

export interface Template {
  id: string;
  hostId: string;
  name: string;
  path: string;
  sizeBytes: number;
  diskSizeBytes: number;
  notes: string | null;
  cpuCount: number;
  memoryMb: number;
  guestOs: string | null;
  createdAt: Iso8601 | null;
}

export interface Iso {
  id: string;
  hostId: string;
  name: string;
  path: string;
  sizeBytes: number;
  checksum: string | null;
}

// ---- Tasks (async operations) -------------------------------------------

export type TaskStatus =
  "queued" | "running" | "succeeded" | "failed" | "timeout";

export const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> =
  new Set<TaskStatus>(["succeeded", "failed", "timeout"]);

export type VmPowerAction =
  "start" | "stop" | "shutdown" | "restart" | "pause" | "delete";

/** Non-power VM operations. Most are backend stubs today (the task is queued and
 *  published, then times out until the host agent implements the function). */
export type VmManagementAction =
  | "rename"
  | "edit"
  | "migrate"
  | "move_storage"
  | "startup_change"
  | "mount_dvd"
  | "eject_dvd"
  | "enable_ha"
  | "disable_ha"
  | "export_template"
  | "notes_edit"
  | "snapshot_create"
  | "snapshot_remove"
  | "snapshot_restore"
  | "enable_metrics"
  | "disable_metrics"
  | "refresh";

export interface Task {
  id: string;
  kind: string; // e.g. "vm_start"
  status: TaskStatus;
  targetType: "vm" | "host";
  targetId: string;
  /** Display name of the target (VM/host name) if the backend can resolve it. */
  targetName?: string | null;
  requestedBy: string;
  /** 0–100 when the agent reports it; null → derive a coarse value from status. */
  progress: number | null;
  /** Live step text from the agent while running ("Exporting VM (45%)"); cleared when terminal. */
  progressMessage?: string | null;
  createdAt: Iso8601;
  startedAt: Iso8601 | null;
  finishedAt: Iso8601 | null;
  result: string | null;
  error: string | null;
  /** RabbitMQ message id on <hostid>.request / .response. */
  correlationId: string | null;
}

/** A single task with the raw agent envelopes - `GET /tasks/:id` only. Used by
 *  the task "Details" dialog. */
export interface TaskDetail extends Task {
  /** The AgentRequest published to the host ({ id, function, params, ... }). */
  requestPayload: Record<string, unknown> | null;
  /** The latest AgentResponse received from the host. */
  responsePayload: Record<string, unknown> | null;
}

/** Coarse progress from status when the backend doesn't report a number. */
export function taskProgress(task: Task): number {
  if (task.progress != null) return task.progress;
  switch (task.status) {
    case "queued":
      return 0;
    case "running":
      return 50;
    default:
      return 100;
  }
}

// ---- Error envelope -------------------------------------------------------

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
