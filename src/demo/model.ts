import type {
  AgentBinary,
  Folder,
  HostHardwareInventory,
  Hypervisor,
  Iso,
  Tag,
  TagCategory,
  Template,
  Vlan,
  Vm,
  VmLock,
} from "~/api/types";

/**
 * The simulator's persisted state (localStorage `ovc-demo-state`). Mostly the
 * REST entities themselves, plus the few private fields the simulation needs.
 * Derived values (counts, uptime, CPU usage, host online state, cluster node
 * lists, storage, metrics) are computed on read in `demo/sim.ts`.
 *
 * Bump `DEMO_STATE_VERSION` whenever this shape changes - an older saved state
 * is then discarded and a fresh inventory generated.
 */
export const DEMO_STATE_VERSION = 4;

export interface DemoVolume {
  path: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
}

export interface DemoCluster {
  id: string;
  name: string;
  hypervisor: Hypervisor;
  /** Cluster Shared Volumes, reported by every member host. */
  csvs: DemoVolume[];
}

/** The hardware the simulated agent reports; storage, cluster, load and
 *  Hyper-V paths are derived on read (they depend on cluster membership). */
export type DemoHardware = Pick<
  HostHardwareInventory,
  "cpu" | "memoryBytes" | "os" | "network" | "vSwitches" | "hbas" | "system"
> & { bootTime: string };

export interface DemoHost {
  id: string;
  shortId: string;
  clusterId: string | null;
  name: string;
  fqdn: string | null;
  ipAddress: string | null;
  hypervisor: Hypervisor;
  agentVersion: string | null;
  /** When the simulated agent first checks in (ms). Until then the host only
   *  shows the "Setup Agent" tab. */
  connectAt: number;
  /** Reboot window (ms): the host reads offline between these two instants. */
  offlineFrom: number | null;
  offlineUntil: number | null;
  /** null until the agent checks in (filled in by `connectHost`). */
  hardware: DemoHardware | null;
  /** Local volumes (C: and data drives). CSVs come from the cluster. */
  localVolumes: DemoVolume[];
  /** Hyper-V default VM path when standalone. */
  defaultVmPath: string;
  /** Failover Cluster node state (clustered hosts only). */
  nodeState: "Up" | "Paused";
  /** Baseline for the fake host metrics. */
  memBase: number;
}

export type DemoVm = Omit<Vm, "uptimeSec" | "cpuUsagePercent" | "lastSeen" | "lock"> & {
  /** When the VM last started (ms) - uptime is derived from it. */
  runningSince: number | null;
  /** When it last stopped (ms) - keeps the metrics history of a stopped VM. */
  stoppedAt: number | null;
  /** Baseline CPU % for the fake usage / metrics. */
  cpuBase: number;
  lock: VmLock | null;
  /** Host a drain moved this VM away from - a failback moves it back. */
  drainedFrom: string | null;
};

/** A catalog tag as stored - `vmCount` is derived per request. */
export type DemoTag = Omit<Tag, "vmCount">;

export type TaskOutcome = "succeeded" | "failed" | "timeout";

export interface DemoTask {
  id: string;
  kind: string;
  targetType: "vm" | "host";
  targetId: string;
  targetName: string | null;
  /** Host the task runs on (for `GET /tasks?hostId=`). */
  hostId: string | null;
  requestedBy: string;
  /** Timeline (ms): queued for `queueMs`, then running for `runMs`. */
  createdAt: number;
  queueMs: number;
  runMs: number;
  outcome: TaskOutcome;
  error: string | null;
  result: string | null;
  /** The agent params, as sent over the wire. */
  params: Record<string, unknown>;
  /** Progress messages shown while running, spread over `runMs`. */
  steps: string[];
  /** Whether the effect on the inventory has been applied (at completion). */
  applied: boolean;
  /** Simulator-only data for the effect (previous state, create body, …) -
   *  never part of the payloads the UI shows. */
  meta?: Record<string, unknown>;
}

export interface DemoState {
  version: number;
  seed: number;
  createdAt: number;
  clusters: DemoCluster[];
  hosts: DemoHost[];
  folders: Folder[];
  vlans: Vlan[];
  tagCategories: TagCategory[];
  tags: DemoTag[];
  vms: DemoVm[];
  templates: Template[];
  isos: Iso[];
  tasks: DemoTask[];
  agentBinaries: AgentBinary[];
}
