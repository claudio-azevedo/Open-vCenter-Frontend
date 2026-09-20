import { queryOptions } from "@tanstack/react-query";
import { getCluster, getClusters } from "./endpoints/clusters";
import {
  getHost,
  getHostAgentConfig,
  getHostAgentInstall,
  getHostIsos,
  getHostMetrics,
  getHostTemplates,
  getHostVms,
  getHosts,
} from "./endpoints/hosts";
import { getAgentBinaries, getAgentStorage } from "./endpoints/agentBinaries";
import { getFolders } from "./endpoints/folders";
import { getVlans } from "./endpoints/vlans";
import type { VlanListParams } from "./endpoints/vlans";
import { getVm, getVmLocks, getVmMetrics, getVms } from "./endpoints/vms";
import type { VmListParams } from "./endpoints/vms";
import { getTask, getTasks } from "./endpoints/tasks";
import { getIsos, getTemplates } from "./endpoints/inventory";
import { qk } from "./queryKeys";
import { TERMINAL_TASK_STATUSES } from "./types";

// Polling cadence mirrors the agent's periodic inventory posts (see api-contract.md).
const INTERVAL = {
  clusters: 30_000,
  hosts: 15_000,
  vms: 10_000,
  task: 1_500,
} as const;

export const clustersQuery = () =>
  queryOptions({
    queryKey: qk.clusters(),
    queryFn: ({ signal }) => getClusters(signal),
    refetchInterval: INTERVAL.clusters,
  });

export const clusterQuery = (id: string) =>
  queryOptions({
    queryKey: qk.cluster(id),
    queryFn: ({ signal }) => getCluster(id, signal),
    refetchInterval: INTERVAL.clusters,
  });

export const hostsQuery = (clusterId?: string) =>
  queryOptions({
    queryKey: qk.hosts(clusterId),
    queryFn: ({ signal }) => getHosts(clusterId, signal),
    refetchInterval: INTERVAL.hosts,
  });

export const hostQuery = (id: string) =>
  queryOptions({
    queryKey: qk.host(id),
    queryFn: ({ signal }) => getHost(id, signal),
    refetchInterval: INTERVAL.hosts,
  });

export const hostVmsQuery = (id: string) =>
  queryOptions({
    queryKey: qk.hostVms(id),
    queryFn: ({ signal }) => getHostVms(id, signal),
    refetchInterval: INTERVAL.vms,
  });

export const hostMetricsQuery = (id: string) =>
  queryOptions({
    queryKey: qk.hostMetrics(id),
    queryFn: ({ signal }) => getHostMetrics(id, signal),
    refetchInterval: INTERVAL.hosts,
  });

export const hostTemplatesQuery = (id: string) =>
  queryOptions({
    queryKey: qk.hostTemplates(id),
    queryFn: ({ signal }) => getHostTemplates(id, signal),
  });

export const hostIsosQuery = (id: string) =>
  queryOptions({
    queryKey: qk.hostIsos(id),
    queryFn: ({ signal }) => getHostIsos(id, signal),
  });

export const hostAgentConfigQuery = (id: string) =>
  queryOptions({
    queryKey: qk.hostAgentConfig(id),
    queryFn: ({ signal }) => getHostAgentConfig(id, signal),
    staleTime: 5 * 60_000,
  });

export const hostAgentInstallQuery = (id: string) =>
  queryOptions({
    queryKey: qk.hostAgentInstall(id),
    queryFn: ({ signal }) => getHostAgentInstall(id, signal),
    // the URL carries a short-lived token - don't cache it long
    staleTime: 30_000,
  });

export const foldersQuery = (params: { hostId?: string; clusterId?: string }) =>
  queryOptions({
    queryKey: qk.folders(params),
    queryFn: ({ signal }) => getFolders(params, signal),
    refetchInterval: INTERVAL.hosts,
  });

export const vlansQuery = (params: VlanListParams = {}) =>
  queryOptions({
    queryKey: qk.vlans(params),
    queryFn: ({ signal }) => getVlans(params, signal),
  });

export const vmsQuery = (params: VmListParams = {}) =>
  queryOptions({
    queryKey: qk.vms(params),
    queryFn: ({ signal }) => getVms(params, signal),
    refetchInterval: INTERVAL.vms,
  });

export const vmQuery = (id: string) =>
  queryOptions({
    queryKey: qk.vm(id),
    queryFn: ({ signal }) => getVm(id, signal),
    refetchInterval: INTERVAL.vms,
  });

export const vmMetricsQuery = (id: string) =>
  queryOptions({
    queryKey: qk.vmMetrics(id),
    queryFn: ({ signal }) => getVmMetrics(id, signal),
    refetchInterval: INTERVAL.vms,
  });

/** Active VM locks - admin only. Polls while the dialog is open. */
export const vmLocksQuery = () =>
  queryOptions({
    queryKey: qk.vmLocks(),
    queryFn: ({ signal }) => getVmLocks(signal),
    refetchInterval: INTERVAL.vms,
  });

export const vmTasksQuery = (vmId: string) =>
  queryOptions({
    queryKey: qk.tasks({ vmId }),
    queryFn: ({ signal }) => getTasks({ vmId }, signal),
    refetchInterval: INTERVAL.task * 4,
  });

export const hostTasksQuery = (hostId: string) =>
  queryOptions({
    queryKey: qk.tasks({ hostId }),
    queryFn: ({ signal }) => getTasks({ hostId }, signal),
    refetchInterval: INTERVAL.task * 4,
  });

export const taskQuery = (id: string) =>
  queryOptions({
    queryKey: qk.task(id),
    queryFn: ({ signal }) => getTask(id, signal),
    refetchInterval: (query) =>
      query.state.data && TERMINAL_TASK_STATUSES.has(query.state.data.status)
        ? false
        : INTERVAL.task,
  });

/** A deep-ish slice of task history for the "Task History" dialog (View menu). */
export const taskHistoryQuery = () =>
  queryOptions({
    queryKey: qk.taskHistory(),
    queryFn: ({ signal }) => getTasks({ limit: 200 }, signal),
    refetchInterval: 10_000,
  });

/** All recent tasks, for the bottom dock. Polls fast while any task is active. */
export const recentTasksQuery = () =>
  queryOptions({
    queryKey: qk.tasks({}),
    queryFn: ({ signal }) => getTasks({}, signal),
    refetchInterval: (query) => {
      const anyActive = (query.state.data ?? []).some(
        (t) => !TERMINAL_TASK_STATUSES.has(t.status),
      );
      return anyActive ? INTERVAL.task : 4_000;
    },
  });

export const templatesQuery = () =>
  queryOptions({
    queryKey: qk.templates(),
    queryFn: ({ signal }) => getTemplates(signal),
    refetchInterval: INTERVAL.hosts,
  });

export const isosQuery = () =>
  queryOptions({
    queryKey: qk.isos(),
    queryFn: ({ signal }) => getIsos(signal),
  });

export const agentBinariesQuery = () =>
  queryOptions({
    queryKey: qk.agentBinaries(),
    queryFn: ({ signal }) => getAgentBinaries(signal),
    refetchInterval: INTERVAL.clusters,
  });

export const agentStorageQuery = () =>
  queryOptions({
    queryKey: qk.agentStorage(),
    queryFn: ({ signal }) => getAgentStorage(signal),
  });
