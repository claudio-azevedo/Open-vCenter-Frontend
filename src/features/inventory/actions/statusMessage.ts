import * as React from 'react'

/** Transient one-liner shown in the Explorer status bar. */

let message = 'Ready'
const listeners = new Set<() => void>()

export const statusMessage = {
  set(msg: string) {
    message = msg
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot() {
    return message
  },
}

export function useStatusMessage(): string {
  return React.useSyncExternalStore(
    statusMessage.subscribe,
    statusMessage.getSnapshot,
    statusMessage.getSnapshot,
  )
}
