import type { VmListParams } from './endpoints/vms'

/** Central query-key factory so invalidation stays consistent. */
export const qk = {
  clusters: () => ['clusters'] as const,
  cluster: (id: string) => ['clusters', id] as const,

  hosts: (clusterId?: string) => ['hosts', { clusterId: clusterId ?? null }] as const,
  host: (id: string) => ['hosts', id] as const,
  hostVms: (id: string) => ['hosts', id, 'vms'] as const,
  hostMetrics: (id: string) => ['hosts', id, 'metrics'] as const,
  hostTemplates: (id: string) => ['hosts', id, 'templates'] as const,
  hostIsos: (id: string) => ['hosts', id, 'isos'] as const,
  hostAgentConfig: (id: string) => ['hosts', id, 'agent-config'] as const,
  hostAgentInstall: (id: string) => ['hosts', id, 'agent-install'] as const,

  folders: (params: { hostId?: string; clusterId?: string }) =>
    ['folders', params] as const,

  vlans: (params: { hostId?: string; clusterId?: string } = {}) =>
    ['vlans', params] as const,

  vms: (params: VmListParams = {}) => ['vms', params] as const,
  vm: (id: string) => ['vms', id] as const,
  vmMetrics: (id: string) => ['vms', id, 'metrics'] as const,
  vmLocks: () => ['vms', 'locks'] as const,

  tasks: (params: { vmId?: string; hostId?: string } = {}) =>
    ['tasks', params] as const,
  taskHistory: () => ['tasks', 'history'] as const,
  task: (id: string) => ['tasks', id] as const,

  templates: () => ['templates'] as const,
  isos: () => ['isos'] as const,

  agentBinaries: () => ['agent-binaries'] as const,
  agentStorage: () => ['agent-binaries', 'storage'] as const,
}
