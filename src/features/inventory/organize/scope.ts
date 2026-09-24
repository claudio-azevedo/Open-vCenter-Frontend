import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { foldersQuery, hostQuery, vmQuery } from '~/api/queries'
import type { Host, Vm } from '~/api/types'
import type { Selection } from '../selection'

export type FolderScope = { clusterId: string } | { hostId: string } | null

/**
 * Where would a "New Folder" from the current selection land?
 * - cluster selected            → that cluster
 * - clustered host selected     → its cluster
 * - standalone host selected    → that host
 * - folder selected             → the same scope as the folder
 * - VM selected                 → resolved via its host
 */
export function folderScopeForSelection(
  selection: Selection | null,
  hosts: Host[],
  vms: Vm[],
  folders: { id: string; clusterId: string | null; hostId: string | null }[],
): FolderScope {
  if (!selection) return null

  if (selection.kind === 'cluster') return { clusterId: selection.id }

  if (selection.kind === 'folder') {
    const f = folders.find((x) => x.id === selection.id)
    if (f?.clusterId) return { clusterId: f.clusterId }
    if (f?.hostId) return { hostId: f.hostId }
    return null
  }

  const host =
    selection.kind === 'host'
      ? hosts.find((h) => h.id === selection.id)
      : hosts.find(
          (h) => h.id === vms.find((v) => v.id === selection.id)?.hostId,
        )
  if (!host) return null
  return host.clusterId ? { clusterId: host.clusterId } : { hostId: host.id }
}

/**
 * Folders a VM can be moved into: the folders of its host's cluster, or of the
 * host itself when standalone. `ready` is false until the VM, host and folder
 * lists have loaded, so callers don't disable anything on a transient empty list.
 */
export function useVmFolderTargets(vmId: string | undefined) {
  const vm = useQuery({ ...vmQuery(vmId ?? ''), enabled: !!vmId })
  const hostId = vm.data?.hostId
  const host = useQuery({ ...hostQuery(hostId ?? ''), enabled: !!hostId })
  const folders = useQuery({ ...foldersQuery({}), enabled: !!vmId })

  const targets = React.useMemo(() => {
    const h = host.data
    if (!h) return []
    return (folders.data ?? []).filter((f) =>
      h.clusterId ? f.clusterId === h.clusterId : f.hostId === h.id,
    )
  }, [host.data, folders.data])

  return {
    vm: vm.data,
    host: host.data,
    targets,
    ready: host.isSuccess && folders.isSuccess,
  }
}
