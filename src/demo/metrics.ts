import type { HostMetricSample, VmMetricSample } from "~/api/types";
import type { DemoHost, DemoState, DemoVm } from "./model";
import { hash32, noise } from "./random";

/**
 * Fake quick metrics. Nothing is stored: every sample is a pure function of
 * (entity, minute), so polls return a stable, sliding last-hour window. The
 * values follow the simulated inventory - a VM only burns CPU while it runs,
 * and a host's load is the sum of its running VMs.
 */

const STEP_MS = 60_000;
const SAMPLES = 60;
const MB = 1024 ** 2;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

function minutes(now: number): number[] {
  const last = Math.floor(now / STEP_MS);
  return Array.from({ length: SAMPLES }, (_, i) => last - SAMPLES + 1 + i);
}

const iso = (minute: number) => new Date(minute * STEP_MS).toISOString();

/** Whether the VM was powered on at time `t` (ms). */
function runningAt(vm: DemoVm, t: number): boolean {
  if (vm.runningSince == null || t < vm.runningSince) return false;
  if (vm.state === "Running" || vm.state === "Restarting" || vm.state === "Stopping")
    return true;
  return vm.stoppedAt != null && t < vm.stoppedAt;
}

/** CPU % the VM uses at time `t` - a slow wave plus jitter around its baseline. */
export function vmCpuAt(vm: DemoVm, t: number): number {
  if (!runningAt(vm, t) || vm.state === "Paused") return 0;
  const m = Math.floor(t / STEP_MS);
  const phase = (hash32(vm.id) % 628) / 100;
  const wave = Math.sin(m / 7 + phase) * vm.cpuBase * 0.35;
  const jitter = (noise(vm.id, m) - 0.5) * vm.cpuBase * 0.5;
  return clamp(vm.cpuBase + wave + jitter, 0.5, 99);
}

/** Guest memory in use at time `t` (bytes). */
export function vmMemAt(vm: DemoVm, t: number): number {
  if (!runningAt(vm, t)) return 0;
  const m = Math.floor(t / STEP_MS);
  const ratio = 0.55 + noise(`${vm.id}:mem`, Math.floor(m / 10)) * 0.25;
  return Math.round(vm.memory.assignedBytes * ratio);
}

/** Cumulative counter over the window: `rate` bytes/s while the VM runs. */
function counter(vm: DemoVm, key: string, rate: number, ms: number[]): number[] {
  let total = Math.round(rate * 60 * (ms[0] % 50_000));
  return ms.map((m) => {
    if (runningAt(vm, m * STEP_MS)) {
      total += Math.round(rate * 60 * (0.3 + noise(`${vm.id}:${key}`, m) * 1.4));
    }
    return total;
  });
}

export function vmMetrics(vm: DemoVm, now: number): VmMetricSample[] {
  if (!vm.metricsEnabled) return [];
  const ms = minutes(now);
  const base = 1 + (hash32(vm.id) % 20);
  const disk = counter(vm, "disk", base * MB, ms);
  const rx = counter(vm, "rx", base * 0.4 * MB, ms);
  const tx = counter(vm, "tx", base * 0.25 * MB, ms);
  return ms.map((m, i) => ({
    ts: iso(m),
    cpuPercent: Math.round(vmCpuAt(vm, m * STEP_MS) * 10) / 10,
    memBytes: vmMemAt(vm, m * STEP_MS),
    diskBytes: disk[i],
    netRxBytes: rx[i],
    netTxBytes: tx[i],
  }));
}

export function hostMetrics(
  state: DemoState,
  host: DemoHost,
  now: number,
): HostMetricSample[] {
  const hw = host.hardware;
  if (!hw || now < host.connectAt) return [];
  const vms = state.vms.filter((v) => v.hostId === host.id);
  const logical = hw.cpu.logical || 1;
  const total = hw.memoryBytes;
  const nics = hw.network.filter((n) => n.connected);
  const disks = ["C:", ...(host.clusterId ? ["Volume1", "Volume2"] : ["D:"])];

  return minutes(now).map((m) => {
    const t = m * STEP_MS;
    if (host.offlineFrom != null && host.offlineUntil != null && t >= host.offlineFrom && t < host.offlineUntil) {
      return {
        ts: iso(m),
        cpuPercent: null,
        memPercent: null,
        diskLatencyMs: null,
        netRxBps: null,
        netTxBps: null,
        detail: null,
      };
    }
    const running = vms.filter((v) => runningAt(v, t));
    const cpu =
      3 +
      (noise(`${host.id}:cpu`, m) * 4) +
      running.reduce((n, v) => n + vmCpuAt(v, t) * v.vcpu, 0) / logical * 2;
    const used =
      total * host.memBase + running.reduce((n, v) => n + v.memory.assignedBytes, 0);
    const memUsed = Math.min(total * 0.97, used);
    const spike = noise(`${host.id}:lat-spike`, m) > 0.93 ? 12 : 0;
    const latency = 0.8 + noise(`${host.id}:lat`, m) * 3 + spike;
    const wave = 1 + Math.sin(m / 9 + (hash32(host.id) % 100)) * 0.4;
    const rx = running.length * 0.9 * MB * wave * (0.6 + noise(`${host.id}:rx`, m));
    const tx = running.length * 0.6 * MB * wave * (0.6 + noise(`${host.id}:tx`, m));
    return {
      ts: iso(m),
      cpuPercent: Math.round(clamp(cpu, 1, 99) * 10) / 10,
      memPercent: Math.round((memUsed / total) * 1000) / 10,
      diskLatencyMs: Math.round(latency * 10) / 10,
      netRxBps: Math.round(rx),
      netTxBps: Math.round(tx),
      detail: {
        memUsedBytes: Math.round(memUsed),
        memTotalBytes: total,
        disks: disks.map((name, i) => ({
          name,
          readLatencyMs: Math.round((latency * (0.7 + noise(`${host.id}:r${i}`, m) * 0.6)) * 10) / 10,
          writeLatencyMs: Math.round((latency * (0.9 + noise(`${host.id}:w${i}`, m) * 0.8)) * 10) / 10,
          queueLength: Math.round(noise(`${host.id}:q${i}`, m) * 3 * 10) / 10,
        })),
        net: nics.map((n, i) => ({
          name: n.name,
          rxBps: Math.round(rx / nics.length * (0.8 + noise(`${host.id}:nrx${i}`, m) * 0.4)),
          txBps: Math.round(tx / nics.length * (0.8 + noise(`${host.id}:ntx${i}`, m) * 0.4)),
        })),
      },
    };
  });
}
