import type {
  Cluster,
  Host,
  HostDetail,
  Task,
  TaskDetail,
  TaskStatus,
  Template,
  Vm,
  VmCloneBody,
  VmCreateBody,
  VmDisk,
  VmNic,
  VmState,
} from "~/api/types";
import type {
  DemoCluster,
  DemoHost,
  DemoState,
  DemoTask,
  DemoVm,
  DemoVolume,
} from "./model";
import { hostMetrics, vmCpuAt, vmMemAt } from "./metrics";
import { diskFileName, vmFolderFor } from "./paths";
import { hash32, randomMac, uuid } from "./random";
import { GB, connectHost } from "./seed";
import { SHOW_PERCENT_FROM_MS, taskProfile } from "./taskProfiles";

/**
 * The simulation core: read views (REST shapes computed from the stored state
 * at a given instant), the task lifecycle, and each agent function's effect.
 *
 * Tasks are evaluated lazily from their timeline - no timers. A task is
 * queued for `queueMs`, running for `runMs`, then terminal; `advance()` (run
 * before every API call) applies the effect of each task that has finished
 * since the last call, in completion order, and releases its VM lock.
 */

const MB = 1024 ** 2;
const iso = (ms: number) => new Date(ms).toISOString();
const MAX_TASKS = 400;

// ---- derived views ---------------------------------------------------------------

export function hostOnline(h: DemoHost, now: number): boolean {
  if (now < h.connectAt) return false;
  return !(
    h.offlineFrom != null &&
    h.offlineUntil != null &&
    now >= h.offlineFrom &&
    now < h.offlineUntil
  );
}

export const clusterOf = (state: DemoState, h: DemoHost): DemoCluster | undefined =>
  h.clusterId ? state.clusters.find((c) => c.id === h.clusterId) : undefined;

export function hostVolumes(state: DemoState, h: DemoHost): DemoVolume[] {
  return [...h.localVolumes, ...(clusterOf(state, h)?.csvs ?? [])];
}

export function hostDefaultVmPath(state: DemoState, h: DemoHost): string {
  const cluster = clusterOf(state, h);
  if (!cluster) return h.defaultVmPath;
  return `${cluster.csvs[0]?.path ?? "C:\\ClusterStorage\\Volume1"}\\VMS`;
}

/** A sawtooth "last check-in" a few seconds ago, like a periodic agent. */
const recent = (now: number, period: number, key: string) =>
  iso(now - ((Math.floor(now / 1000) + (hash32(key) % period)) % period) * 1000);

export function clusterOut(state: DemoState, c: DemoCluster): Cluster {
  const hostIds = new Set(state.hosts.filter((h) => h.clusterId === c.id).map((h) => h.id));
  return {
    id: c.id,
    name: c.name,
    hypervisor: c.hypervisor,
    hostCount: hostIds.size,
    vmCount: state.vms.filter((v) => hostIds.has(v.hostId)).length,
  };
}

export function hostOut(state: DemoState, h: DemoHost, now: number): Host {
  const seen = now >= h.connectAt;
  const online = hostOnline(h, now);
  return {
    id: h.id,
    shortId: h.shortId,
    clusterId: h.clusterId,
    name: h.name,
    fqdn: seen ? h.fqdn : null,
    ipAddress: seen ? h.ipAddress : null,
    hypervisor: h.hypervisor,
    online,
    agent: {
      version: seen ? h.agentVersion : null,
      lastSeen: !seen
        ? null
        : online
          ? recent(now, 20, h.id)
          : iso(h.offlineFrom ?? now),
      connected: online,
      refreshIntervals: seen ? { vm: 180, host: 600 } : null,
    },
    vmCount: state.vms.filter((v) => v.hostId === h.id).length,
  };
}

export function hostDetailOut(state: DemoState, h: DemoHost, now: number): HostDetail {
  const base = hostOut(state, h, now);
  const hw = h.hardware;
  if (!hw || now < h.connectAt) return { ...base, hardware: null };
  const cluster = clusterOf(state, h);
  const latest = hostMetrics(state, h, now).at(-1);
  const defaultVmPath = hostDefaultVmPath(state, h);
  return {
    ...base,
    hardware: {
      ...hw,
      storage: hostVolumes(state, h).map((v) => ({ ...v })),
      load: latest
        ? { cpuPercent: latest.cpuPercent, memoryPercent: latest.memPercent }
        : null,
      cluster: cluster
        ? {
            clustered: true,
            name: cluster.name,
            state: h.nodeState,
            nodes: state.hosts
              .filter((x) => x.clusterId === cluster.id)
              .map((x) => x.name),
          }
        : { clustered: false, name: null, state: "", nodes: [] },
      hyperv: {
        defaultVmPath,
        defaultVhdPath: `${defaultVmPath}\\Virtual Hard Disks`,
      },
    },
  };
}

export function vmOut(state: DemoState, vm: DemoVm, now: number): Vm {
  const {
    runningSince,
    stoppedAt: _stoppedAt,
    cpuBase: _cpuBase,
    drainedFrom: _drainedFrom,
    ...rest
  } = vm;
  const host = state.hosts.find((h) => h.id === vm.hostId);
  const offline = !host || !hostOnline(host, now);
  const up = vm.state === "Running" || vm.state === "Paused";
  const running = vm.state === "Running";
  return {
    ...rest,
    state: offline ? "Unknown" : vm.state,
    uptimeSec: up && runningSince ? Math.floor((now - runningSince) / 1000) : null,
    cpuUsagePercent: running ? Math.round(vmCpuAt(vm, now) * 10) / 10 : null,
    memory: {
      ...vm.memory,
      demandBytes: running ? vmMemAt(vm, now) : null,
    },
    nics: vm.nics.map((n) => ({ ...n, ipAddresses: running ? n.ipAddresses : [] })),
    lastSeen: offline
      ? host?.offlineFrom != null
        ? iso(host.offlineFrom)
        : null
      : vm.vmUuid
        ? recent(now, 60, vm.id)
        : null,
    lock: vm.lock,
  };
}

// ---- tasks -----------------------------------------------------------------

const taskStart = (t: DemoTask) => t.createdAt + t.queueMs;
const taskEnd = (t: DemoTask) => taskStart(t) + t.runMs;

export function taskStatus(t: DemoTask, now: number): TaskStatus {
  if (now < taskStart(t)) return "queued";
  if (now < taskEnd(t)) return "running";
  return t.outcome;
}

export function taskOut(t: DemoTask, now: number): Task {
  const status = taskStatus(t, now);
  const terminal = status !== "queued" && status !== "running";
  let progress = 0;
  let progressMessage: string | null = null;
  if (status === "running") {
    const frac = (now - taskStart(t)) / t.runMs;
    progress = Math.min(99, Math.max(1, Math.floor(frac * 100)));
    const step = t.steps[Math.min(t.steps.length - 1, Math.floor(frac * t.steps.length))];
    progressMessage =
      step && t.runMs >= SHOW_PERCENT_FROM_MS ? `${step} (${progress}%)` : (step ?? null);
  } else if (terminal) {
    progress = 100;
  }
  return {
    id: t.id,
    kind: t.kind,
    status,
    targetType: t.targetType,
    targetId: t.targetId,
    targetName: t.targetName,
    requestedBy: t.requestedBy,
    progress,
    progressMessage,
    createdAt: iso(t.createdAt),
    startedAt: status === "queued" ? null : iso(taskStart(t)),
    finishedAt: terminal ? iso(taskEnd(t)) : null,
    result: terminal ? t.result : null,
    error: terminal ? t.error : null,
    correlationId: t.id,
  };
}

export function taskDetailOut(t: DemoTask, now: number): TaskDetail {
  const out = taskOut(t, now);
  const terminal = out.status !== "queued" && out.status !== "running";
  return {
    ...out,
    requestPayload: {
      id: t.id,
      function: t.kind,
      params: t.params,
      requested_by: t.requestedBy,
    },
    responsePayload: terminal
      ? {
          id: t.id,
          status: t.outcome === "succeeded" ? "ok" : "error",
          result: t.result,
          error: t.error,
        }
      : out.status === "running"
        ? { id: t.id, status: "progress", progress: out.progress, message: out.progressMessage }
        : null,
  };
}

export function queueTask(
  state: DemoState,
  now: number,
  init: Pick<
    DemoTask,
    "kind" | "targetType" | "targetId" | "targetName" | "hostId" | "requestedBy" | "params"
  > &
    Partial<Pick<DemoTask, "outcome" | "error" | "meta" | "runMs">>,
): DemoTask {
  const profile = taskProfile(init.kind);
  const task: DemoTask = {
    ...init,
    id: uuid(),
    createdAt: now,
    queueMs: 400 + Math.floor(Math.random() * 500),
    runMs: init.runMs ?? profile.runMs,
    outcome: init.outcome ?? "succeeded",
    error: init.error ?? null,
    result: init.outcome && init.outcome !== "succeeded" ? null : "ok",
    steps: profile.steps,
    applied: false,
  };
  state.tasks.unshift(task);
  if (state.tasks.length > MAX_TASKS) {
    // drop the oldest finished tasks, never one still in flight
    const keep = new Set(
      state.tasks
        .filter((t) => t.applied)
        .slice(MAX_TASKS - 50)
        .map((t) => t.id),
    );
    state.tasks = state.tasks.filter((t) => !t.applied || !keep.has(t.id));
  }
  return task;
}

export function lockVm(vm: DemoVm, task: DemoTask) {
  vm.lock = {
    taskId: task.id,
    kind: task.kind,
    requestedBy: task.requestedBy,
    acquiredAt: iso(task.createdAt),
  };
}

/** Apply everything that happened since the last call. Returns whether the
 *  state changed (and must be saved). */
export function advance(state: DemoState, now: number): boolean {
  let changed = false;

  for (const h of state.hosts) {
    if (!h.hardware && now >= h.connectAt) {
      connectHost(h, h.connectAt);
      changed = true;
    }
  }

  const due = state.tasks
    .filter((t) => !t.applied && now >= taskEnd(t))
    .sort((a, b) => taskEnd(a) - taskEnd(b));
  for (const t of due) {
    if (t.outcome === "succeeded") {
      const error = applyEffect(state, t, taskEnd(t));
      if (error) {
        t.outcome = "failed";
        t.error = error;
        t.result = null;
      }
    } else {
      revertTransition(state, t);
    }
    t.applied = true;
    for (const vm of state.vms) {
      if (vm.lock?.taskId === t.id) vm.lock = null;
    }
    changed = true;
  }
  return changed;
}

/** A failed power task leaves the VM where it was. */
function revertTransition(state: DemoState, t: DemoTask) {
  const vm = state.vms.find((v) => v.id === t.targetId);
  const from = t.meta?.from as VmState | undefined;
  if (vm && from) vm.state = from;
}

// ---- effects -------------------------------------------------------------------

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

/** Returns an error message when the agent would have failed the task. */
function applyEffect(state: DemoState, t: DemoTask, at: number): string | null {
  const vm = state.vms.find((v) => v.id === t.targetId);
  const host = state.hosts.find((h) => h.id === t.targetId);
  const p = t.params;

  if (t.targetType === "vm" && !vm) return "The virtual machine no longer exists.";

  switch (t.kind) {
    // ---- power ----
    case "vm_start":
      if (t.meta?.from !== "Paused") vm!.runningSince = at;
      vm!.state = "Running";
      vm!.stoppedAt = null;
      return null;
    case "vm_stop":
    case "vm_shutdown":
      vm!.state = "Off";
      vm!.stoppedAt = at;
      return null;
    case "vm_restart":
      vm!.state = "Running";
      vm!.runningSince = at;
      return null;
    case "vm_pause":
      vm!.state = "Paused";
      return null;
    case "vm_delete":
      state.vms = state.vms.filter((v) => v.id !== vm!.id);
      return null;

    // ---- lifecycle ----
    case "vm_create":
      return finishCreate(state, vm!, t.meta?.body as VmCreateBody, at);
    case "vm_clone":
      return finishClone(state, vm!, t.meta?.body as VmCloneBody, at);
    case "vm_rename":
      vm!.name = str(p.new_name) ?? vm!.name;
      return null;
    case "vm_edit":
      applyEdit(state, vm!, p);
      return null;
    case "vm_migrate": {
      const current = state.hosts.find((h) => h.id === vm!.hostId);
      const target = state.hosts.find(
        (h) =>
          h.clusterId &&
          h.clusterId === current?.clusterId &&
          h.name.toLowerCase() === String(p.target_host ?? "").toLowerCase(),
      );
      if (!target) return `Cluster node '${String(p.target_host)}' not found.`;
      if (!hostOnline(target, at)) return `Cluster node '${target.name}' is not reachable.`;
      vm!.hostId = target.id;
      vm!.drainedFrom = null;
      return null;
    }
    case "vm_move": {
      const h = state.hosts.find((x) => x.id === vm!.hostId)!;
      const folder = vmFolderFor(hostDefaultVmPath(state, h), str(p.destination_storage), vm!.name);
      vm!.configPath = folder;
      vm!.disks = vm!.disks.map((d) => ({
        ...d,
        path: `${folder}\\Virtual Hard Disks\\${d.path.split("\\").pop()}`,
      }));
      return null;
    }
    case "vm_startup_change":
      vm!.autoStartAction = str(p.automatic_start) ?? vm!.autoStartAction;
      vm!.autoStartDelaySec = num(p.automatic_start_delay) ?? vm!.autoStartDelaySec;
      return null;
    case "mount_dvd":
      vm!.dvdPath = str(p.path);
      return null;
    case "eject_dvd":
      vm!.dvdPath = null;
      return null;
    case "enable_ha":
    case "disable_ha":
      vm!.highlyAvailable = t.kind === "enable_ha";
      return null;
    case "notes_edit":
      vm!.notes = str(p.notes) || null;
      return null;
    case "vm_export_template":
      state.templates.push(exportTemplate(vm!, p, at));
      return null;
    case "snapshot_create":
      vm!.snapshots.push({
        id: uuid(),
        name: str(p.name) || `${vm!.name} - ${iso(at).slice(0, 16).replace("T", " ")}`,
        createdAt: iso(at),
        parentId: vm!.snapshots.at(-1)?.id ?? null,
        type: "Production",
      });
      return null;
    case "snapshot_remove": {
      const gone = vm!.snapshots.find((s) => s.id === p.snapshot_id);
      if (!gone) return "Checkpoint not found.";
      vm!.snapshots = vm!.snapshots
        .filter((s) => s.id !== gone.id)
        .map((s) => (s.parentId === gone.id ? { ...s, parentId: gone.parentId } : s));
      return null;
    }
    case "snapshot_restore":
      return vm!.snapshots.some((s) => s.id === p.snapshot_id) ? null : "Checkpoint not found.";
    case "vm_enable_metrics":
    case "vm_disable_metrics":
      vm!.metricsEnabled = t.kind === "vm_enable_metrics";
      return null;
    case "refresh_status":
      return null;

    // ---- host ----
    case "refresh_hardware":
    case "refresh_inventory":
      return null;
    case "suspend":
      host!.nodeState = "Paused";
      return null;
    case "suspend_drain":
      drain(state, host!, at);
      host!.nodeState = "Paused";
      return null;
    case "resume":
      host!.nodeState = "Up";
      return null;
    case "resume_fallback":
      host!.nodeState = "Up";
      for (const v of state.vms) {
        if (v.drainedFrom === host!.id) {
          v.hostId = host!.id;
          v.drainedFrom = null;
        }
      }
      return null;
    case "restart":
      if (host!.hardware) host!.hardware.bootTime = iso(at - 5_000);
      return null;
    case "host_update_agent":
      host!.agentVersion = str(t.meta?.version) ?? host!.agentVersion;
      return null;
    default:
      return null;
  }
}

/** Live-migrate the node's running HA VMs to the other Up nodes, round-robin. */
function drain(state: DemoState, host: DemoHost, at: number) {
  const targets = state.hosts.filter(
    (h) =>
      h.id !== host.id &&
      h.clusterId === host.clusterId &&
      h.nodeState === "Up" &&
      hostOnline(h, at),
  );
  if (!targets.length) return;
  let i = 0;
  for (const v of state.vms) {
    if (v.hostId === host.id && v.highlyAvailable && v.state === "Running") {
      v.hostId = targets[i++ % targets.length].id;
      v.drainedFrom = host.id;
    }
  }
}

function nextController(disks: VmDisk[], firmware: string): string {
  if (firmware === "BIOS") {
    const used = new Set(disks.map((d) => d.controller));
    return ["IDE 0:0", "IDE 0:1", "IDE 1:0", "IDE 1:1"].find((c) => !used.has(c)) ?? "IDE 1:1";
  }
  const locations = disks
    .map((d) => /SCSI 0:(\d+)/.exec(d.controller)?.[1])
    .filter(Boolean)
    .map(Number);
  return `SCSI 0:${locations.length ? Math.max(...locations) + 1 : 0}`;
}

function newNic(input: {
  name: string;
  switchName: string;
  vlanId: number | null;
  net: string;
}): VmNic {
  return {
    id: uuid(),
    name: input.name,
    switchName: input.switchName,
    vlanId: input.vlanId,
    macAddress: randomMac(),
    ipAddresses: [`${input.net}.${Math.floor(Math.random() * 200) + 20}`],
    connected: true,
  };
}

const vmNet = (vm: DemoVm, vlanId: number | null) =>
  `10.${(hash32(vm.hostId) % 90) + 10}.${vlanId ?? 1}`;

function applyEdit(state: DemoState, vm: DemoVm, p: Record<string, unknown>) {
  const host = state.hosts.find((h) => h.id === vm.hostId);
  const defaultSwitch = host?.hardware?.vSwitches?.[0]?.name ?? "";

  if (num(p.cpu_count)) vm.vcpu = num(p.cpu_count)!;
  if (num(p.memory_mb)) vm.memory.assignedBytes = num(p.memory_mb)! * MB;
  if (typeof p.memory_dynamic === "boolean") {
    vm.memory.dynamic = p.memory_dynamic;
    if (p.memory_dynamic) {
      vm.memory.minBytes ??= 512 * MB;
      vm.memory.maxBytes ??= vm.memory.assignedBytes * 4;
    } else {
      vm.memory.minBytes = null;
      vm.memory.maxBytes = null;
    }
  }
  if (num(p.memory_min_mb)) vm.memory.minBytes = num(p.memory_min_mb)! * MB;
  if (num(p.memory_max_mb)) vm.memory.maxBytes = num(p.memory_max_mb)! * MB;
  if (typeof p.nested_virtualization === "boolean")
    vm.nestedVirtualization = p.nested_virtualization;
  if (typeof p.secure_boot === "boolean") {
    vm.secureBoot = p.secure_boot;
    if (p.secure_boot) vm.secureBootTemplate ??= "Windows";
  }
  if (str(p.secure_boot_template)) vm.secureBootTemplate = str(p.secure_boot_template);
  if (str(p.automatic_start)) vm.autoStartAction = str(p.automatic_start);
  if (num(p.automatic_start_delay) != null) vm.autoStartDelaySec = num(p.automatic_start_delay);
  if (str(p.automatic_stop)) vm.autoStopAction = str(p.automatic_stop);
  if (typeof p.notes === "string") vm.notes = p.notes || null;

  for (const n of list(p.add_nic)) {
    const vlanId = num(n.vlan_id) || null;
    vm.nics.push(
      newNic({
        name: str(n.name) ?? "Network Adapter",
        switchName: str(n.switch_name) ?? defaultSwitch,
        vlanId,
        net: vmNet(vm, vlanId),
      }),
    );
  }
  for (const e of list(p.edit_nic)) {
    const nic = vm.nics.find((n) => n.id === e.nic_id);
    if (!nic) continue;
    if (str(e.name)) nic.name = str(e.name)!;
    if (e.vlan_id !== undefined) nic.vlanId = num(e.vlan_id) || null;
    if (str(e.switch_name)) nic.switchName = str(e.switch_name)!;
  }
  const removeNics = new Set(list(p.remove_nic).map((n) => n.nic_id));
  vm.nics = vm.nics.filter((n) => !removeNics.has(n.id));

  for (const d of list(p.add_disk)) {
    const size = (num(d.size_gb) ?? 10) * GB;
    const type = str(d.type) === "Dynamic" ? "Dynamic" : "Fixed";
    vm.disks.push({
      id: uuid(),
      path: str(d.path) ?? `${vm.configPath ?? ""}\\Virtual Hard Disks\\${vm.name}-DISK.vhdx`,
      controller: nextController(vm.disks, vm.firmware),
      sizeBytes: size,
      usedBytes: type === "Fixed" ? size : 4 * MB,
      type,
      format: "VHDX",
    });
  }
  for (const e of list(p.edit_disk)) {
    const disk = vm.disks.find((d) => d.path === e.path);
    if (!disk || !num(e.size_gb)) continue;
    disk.sizeBytes = num(e.size_gb)! * GB;
    if (disk.type === "Fixed") disk.usedBytes = disk.sizeBytes;
  }
  const removeDisks = new Set(list(p.remove_disk).map((d) => d.path));
  vm.disks = vm.disks.filter((d) => !removeDisks.has(d.path));
}

function exportTemplate(vm: DemoVm, p: Record<string, unknown>, at: number): Template {
  const name = str(p.template_name) ?? `${vm.name}_TEMPLATE`;
  const root =
    /^([a-zA-Z]:\\ClusterStorage\\[^\\]+)/i.exec(vm.configPath ?? "")?.[1] ??
    (vm.configPath ?? "D:").slice(0, 2);
  const linux = vm.secureBootTemplate === "Linux";
  return {
    id: uuid(),
    hostId: vm.hostId,
    name,
    path: `${root}\\Templates\\${name}`,
    sizeBytes: vm.disks.reduce((n, d) => n + d.sizeBytes, 0),
    diskSizeBytes: vm.disks.reduce((n, d) => n + (d.usedBytes ?? d.sizeBytes), 0),
    notes: str(p.notes),
    cpuCount: vm.vcpu,
    memoryMb: Math.round(vm.memory.assignedBytes / MB),
    guestOs: linux ? "Linux" : "Windows Server",
    createdAt: iso(at),
  };
}

// ---- create / clone ----------------------------------------------------------------

/** The placeholder row inserted before the agent reports the new VM. */
export function placeholderVm(input: {
  name: string;
  hostId: string;
  firmware: "BIOS" | "UEFI";
  vcpu: number;
  memoryMb: number;
  dynamic: boolean;
  minMb?: number;
  maxMb?: number;
  linux: boolean;
  nested: boolean;
  ha: boolean;
  notes: string | null;
  now: number;
}): DemoVm {
  const uefi = input.firmware === "UEFI";
  return {
    id: uuid(),
    vmUuid: null,
    hostId: input.hostId,
    folderId: null,
    name: input.name,
    state: "Unknown",
    firmware: input.firmware,
    vcpu: input.vcpu,
    memory: {
      assignedBytes: input.memoryMb * MB,
      minBytes: input.dynamic ? (input.minMb ?? 512) * MB : null,
      maxBytes: input.dynamic ? (input.maxMb ?? input.memoryMb * 4) * MB : null,
      dynamic: input.dynamic,
      demandBytes: null,
    },
    disks: [],
    nics: [],
    snapshots: [],
    secureBoot: uefi ? true : null,
    secureBootTemplate: uefi ? (input.linux ? "Linux" : "Windows") : null,
    nestedVirtualization: input.nested,
    autoStartAction: "StartIfRunning",
    autoStartDelaySec: 0,
    autoStopAction: "ShutDown",
    configPath: null,
    dvdPath: null,
    highlyAvailable: input.ha,
    notes: input.notes,
    metricsEnabled: false,
    createdAt: iso(input.now),
    runningSince: null,
    stoppedAt: null,
    cpuBase: 3 + Math.random() * 20,
    lock: null,
    drainedFrom: null,
  };
}

function finishCreate(
  state: DemoState,
  vm: DemoVm,
  body: VmCreateBody,
  at: number,
): string | null {
  const host = state.hosts.find((h) => h.id === vm.hostId);
  if (!host) return "The host no longer exists.";
  const folder = vmFolderFor(hostDefaultVmPath(state, host), body.destinationStorage, vm.name);
  vm.vmUuid = uuid().toUpperCase();
  vm.configPath = folder;
  vm.disks = body.disks.map((d) => {
    const size = d.sizeGb * GB;
    const disk: VmDisk = {
      id: uuid(),
      path: `${folder}\\Virtual Hard Disks\\${diskFileName(vm.name, d.name)}`,
      controller: "",
      sizeBytes: size,
      usedBytes: d.type === "Fixed" ? size : 4 * MB,
      type: d.type,
      format: "VHDX",
    };
    return disk;
  });
  vm.disks.forEach((d, i) => {
    d.controller = nextController(vm.disks.slice(0, i), vm.firmware);
  });
  vm.nics = [
    newNic({
      name: "Network Adapter",
      switchName: body.switchName || host.hardware?.vSwitches?.[0]?.name || "",
      vlanId: body.vlanId ?? null,
      net: vmNet(vm, body.vlanId ?? null),
    }),
  ];
  vm.dvdPath = body.dvd || null;
  settleNewVm(vm, body.startNow, at);
  return null;
}

function finishClone(
  state: DemoState,
  vm: DemoVm,
  body: VmCloneBody,
  at: number,
): string | null {
  const host = state.hosts.find((h) => h.id === vm.hostId);
  if (!host) return "The host no longer exists.";
  const folder = vmFolderFor(hostDefaultVmPath(state, host), body.destinationStorage, vm.name);
  const vlanId = body.vlanId ?? null;
  const defaultSwitch = host.hardware?.vSwitches?.[0]?.name ?? "";
  vm.vmUuid = uuid().toUpperCase();
  vm.configPath = folder;

  if (body.source === "vm") {
    const src = state.vms.find((v) => v.id === body.sourceVmId);
    if (!src) return "The source VM no longer exists.";
    vm.firmware = src.firmware;
    vm.secureBoot = src.secureBoot;
    vm.secureBootTemplate = src.secureBootTemplate;
    vm.autoStartAction = src.autoStartAction;
    vm.autoStartDelaySec = src.autoStartDelaySec;
    vm.autoStopAction = src.autoStopAction;
    if (!body.memoryMb) vm.memory = { ...src.memory };
    vm.disks = src.disks.map((d) => ({
      ...d,
      id: uuid(),
      path: `${folder}\\Virtual Hard Disks\\${(d.path.split("\\").pop() ?? "").replace(src.name, vm.name)}`,
    }));
    vm.nics = src.nics.map((n) =>
      newNic({
        name: n.name,
        switchName: n.switchName || defaultSwitch,
        vlanId: body.vlanId !== undefined ? vlanId : n.vlanId,
        net: vmNet(vm, vlanId),
      }),
    );
  } else {
    const tpl = state.templates.find((t) => t.id === body.templateId);
    if (!tpl) return "The template no longer exists.";
    const expand = body.expandDisks ?? false;
    vm.disks = [
      {
        id: uuid(),
        path: `${folder}\\Virtual Hard Disks\\${diskFileName(vm.name, "OS")}`,
        controller: "SCSI 0:0",
        sizeBytes: tpl.sizeBytes,
        usedBytes: expand ? tpl.sizeBytes : tpl.diskSizeBytes,
        type: expand ? "Fixed" : "Dynamic",
        format: "VHDX",
      },
    ];
    vm.nics = [
      newNic({ name: "Network Adapter", switchName: defaultSwitch, vlanId, net: vmNet(vm, vlanId) }),
    ];
  }
  settleNewVm(vm, body.startNow, at);
  return null;
}

function settleNewVm(vm: DemoVm, startNow: boolean, at: number) {
  vm.state = startNow ? "Running" : "Off";
  vm.runningSince = startNow ? at : null;
}
