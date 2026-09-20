import { useQuery } from '@tanstack/react-query'
import { foldersQuery, hostsQuery, vmQuery, vmsQuery } from '~/api/queries'
import { useInventorySelection } from './selection'
import { folderScopeForSelection } from './organize/scope'

/**
 * Where a "New VM" should be pre-targeted, and whether one can be created at all.
 * A selected host pins that host; a cluster pins the cluster (the dialog picks a
 * node); a VM resolves to its host; a folder falls back to its scope; nothing →
 * free choice.
 */
export function useNewVmTarget() {
  const { selection } = useInventorySelection()

  const hosts = useQuery(hostsQuery())
  const vms = useQuery(vmsQuery())
  const folders = useQuery(foldersQuery({}))

  const vm = useQuery({
    ...vmQuery(selection?.id ?? ''),
    enabled: selection?.kind === 'vm',
  })

  const folderScope = folderScopeForSelection(
    selection,
    hosts.data ?? [],
    vms.data ?? [],
    folders.data ?? [],
  )

  const target: { hostId?: string; clusterId?: string } =
    selection?.kind === 'host'
      ? { hostId: selection.id }
      : selection?.kind === 'cluster'
        ? { clusterId: selection.id }
        : selection?.kind === 'vm' && vm.data
          ? { hostId: vm.data.hostId }
          : folderScope
            ? folderScope
            : {}

  // "New VM" needs somewhere to run: at least one registered host that is online.
  const hasOnlineHost = (hosts.data ?? []).some((h) => h.online)

  return { target, hasOnlineHost, folderScope, vm }
}
