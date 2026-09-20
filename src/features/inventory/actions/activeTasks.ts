import * as React from 'react'

/**
 * Tiny external store tracking task ids from power actions that are still in
 * flight. <TaskWatcher> polls each one; the toolbar/status bar read the set.
 */

const ids = new Set<string>()
const listeners = new Set<() => void>()
let snapshot: string[] = []

function emit() {
  snapshot = [...ids]
  listeners.forEach((l) => l())
}

export const activeTasks = {
  add(id: string) {
    if (!ids.has(id)) {
      ids.add(id)
      emit()
    }
  },
  remove(id: string) {
    if (ids.delete(id)) emit()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot() {
    return snapshot
  },
}

export function useActiveTaskIds(): string[] {
  return React.useSyncExternalStore(
    activeTasks.subscribe,
    activeTasks.getSnapshot,
    activeTasks.getSnapshot,
  )
}
