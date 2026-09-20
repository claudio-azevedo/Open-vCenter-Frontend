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
