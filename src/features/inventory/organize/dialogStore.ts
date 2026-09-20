import * as React from 'react'

export type OrganizeDialog =
  | { kind: 'cluster-management' }
  | { kind: 'host-management' }
  | { kind: 'agent-management' }
  | { kind: 'new-folder'; clusterId?: string; hostId?: string }
  | {
      kind: 'new-vm'
      clusterId?: string
      hostId?: string
      /** wizard mode; defaults to 'new'. */
      mode?: 'new' | 'template' | 'clone'
      /** preselected source for mode 'clone' (backend Vm.id). */
      sourceVmId?: string
      /** preselected source for mode 'template' (Template.id). */
      templateId?: string
    }
  | { kind: 'move-vm'; vmId: string }
  | { kind: 'move-host'; hostId: string }
  | { kind: 'delete-folder'; folderId: string }
  | null

let current: OrganizeDialog = null
const listeners = new Set<() => void>()

export const organizeDialog = {
  open(dialog: NonNullable<OrganizeDialog>) {
    current = dialog
    listeners.forEach((l) => l())
  },
  close() {
    current = null
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get() {
    return current
  },
}

export function useOrganizeDialog(): OrganizeDialog {
  return React.useSyncExternalStore(
    organizeDialog.subscribe,
    organizeDialog.get,
    organizeDialog.get,
  )
}
