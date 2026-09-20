import * as React from 'react'

/** Which VM-action dialog is open, if any. Mirrors organize/dialogStore.ts. */
export type VmActionDialog =
  | { kind: 'rename'; vmId: string }
  | { kind: 'edit'; vmId: string; tab?: 'general' | 'network' | 'disks' }
  | { kind: 'migrate'; vmId: string }
  | { kind: 'move-storage'; vmId: string }
  | { kind: 'autostart'; vmId: string }
  | { kind: 'mount-dvd'; vmId: string }
  | { kind: 'export-template'; vmId: string }
  | { kind: 'notes'; vmId: string }
  | { kind: 'snapshot-create'; vmId: string }
  | null

let current: VmActionDialog = null
const listeners = new Set<() => void>()

export const vmActionDialog = {
  open(dialog: NonNullable<VmActionDialog>) {
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

export function useVmActionDialog(): VmActionDialog {
  return React.useSyncExternalStore(
    vmActionDialog.subscribe,
    vmActionDialog.get,
    vmActionDialog.get,
  )
}
