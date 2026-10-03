import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { MenuBar } from '~/components/win95'
import type { MenuDef, MenuEntry } from '~/components/win95'
import { useAuth } from '~/auth'
import { THEMES, TREE_BEHAVIORS, useTheme, useTreeBehavior } from '~/preferences'
import { useInventorySelection } from './selection'
import { organizeDialog } from './organize/dialogStore'
import { useVmFolderTargets } from './organize/scope'
import { VmLocksDialog } from './locks/VmLocksDialog'
import { TaskHistoryDialog } from './tasks/TaskHistoryDialog'
import { EventsHistoryDialog } from './events/EventsHistoryDialog'
import { AboutDialog } from './AboutDialog'
import { AuthDebugDialog } from './AuthDebugDialog'
import { confirm } from './confirm'
import { activeTasks } from './actions/activeTasks'
import { statusMessage } from './actions/statusMessage'
import { isDemoMode } from '~/demo/mode'

export function InventoryMenuBar() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const auth = useAuth()
  const { isAdmin } = auth
  const [aboutOpen, setAboutOpen] = React.useState(false)
  const [locksOpen, setLocksOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [eventsOpen, setEventsOpen] = React.useState(false)
  const [authDebugOpen, setAuthDebugOpen] = React.useState(false)
  const { selection, select } = useInventorySelection()
  const vmFolders = useVmFolderTargets(selection?.kind === 'vm' ? selection.id : undefined)
  const { theme, setTheme } = useTheme()
  const { treeBehavior, setTreeBehavior } = useTreeBehavior()
  const demo = isDemoMode()

  const resetDemo = async () => {
    const ok = await confirm({
      title: 'Reset Demo Data',
      message:
        'Throw away every change made in this demo and generate a new random inventory?',
      confirmLabel: 'Reset',
      danger: true,
    })
    if (!ok) return
    const { resetDemo: reset } = await import('~/demo/api')
    reset()
    activeTasks.clear()
    select(null)
    await queryClient.resetQueries()
    statusMessage.set('Demo data reset - new random inventory generated')
  }

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        {
          label: 'Cluster Management',
          onSelect: () => organizeDialog.open({ kind: 'cluster-management' }),
        },
        {
          label: 'Hosts Management',
          onSelect: () => organizeDialog.open({ kind: 'host-management' }),
        },
        ...(isAdmin
          ? ([
              {
                label: 'Agent Management',
                onSelect: () => organizeDialog.open({ kind: 'agent-management' }),
              },
              {
                label: 'Tag Management',
                onSelect: () => organizeDialog.open({ kind: 'tag-management' }),
              },
            ] as MenuEntry[])
          : []),
        { type: 'separator' },
        { label: 'Refresh', shortcut: 'F5', onSelect: () => queryClient.invalidateQueries() },
        { type: 'separator' },
        ...(demo
          ? ([
              { label: 'Reset Demo Data', onSelect: resetDemo },
              { type: 'separator' },
            ] as MenuEntry[])
          : []),
        { label: 'Sign Out', onSelect: () => navigate({ to: '/logout' }) },
      ],
    },
    {
      label: 'Action',
      items: [
        {
          label: 'Move VM to Folder',
          disabled:
            selection?.kind !== 'vm' || (vmFolders.ready && vmFolders.targets.length === 0),
          onSelect: () =>
            selection?.kind === 'vm' &&
            organizeDialog.open({ kind: 'move-vm', vmId: selection.id }),
        },
        {
          label: 'Move Host',
          disabled: selection?.kind !== 'host',
          onSelect: () =>
            selection?.kind === 'host' &&
            organizeDialog.open({ kind: 'move-host', hostId: selection.id }),
        },
        {
          label: 'Delete Folder',
          disabled: selection?.kind !== 'folder',
          onSelect: () =>
            selection?.kind === 'folder' &&
            organizeDialog.open({ kind: 'delete-folder', folderId: selection.id }),
        },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Refresh', onSelect: () => queryClient.invalidateQueries() },
        { type: 'separator' },
        { label: 'Task History', onSelect: () => setHistoryOpen(true) },
        ...(isAdmin
          ? ([
              { label: 'Events History', onSelect: () => setEventsOpen(true) },
              { type: 'separator' },
              { label: 'VM Locks', onSelect: () => setLocksOpen(true) },
            ] as MenuEntry[])
          : []),
      ],
    },
    {
      label: 'Preferences',
      items: [
        {
          label: 'Theme',
          items: THEMES.map((t) => ({
            label: t.label,
            checked: t.id === theme,
            onSelect: () => setTheme(t.id),
          })),
        },
        {
          label: 'Tree Behavior',
          items: TREE_BEHAVIORS.map((b) => ({
            label: b.label,
            checked: b.id === treeBehavior,
            onSelect: () => setTreeBehavior(b.id),
          })),
        },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'About Open vCenter', onSelect: () => setAboutOpen(true) },
        ...(import.meta.env.DEV
          ? ([
              { type: 'separator' },
              { label: 'Auth Debug', onSelect: () => setAuthDebugOpen(true) },
            ] as MenuEntry[])
          : []),
      ],
    },
  ]

  return (
    <>
      <MenuBar menus={menus} />
      {historyOpen ? (
        <TaskHistoryDialog onClose={() => setHistoryOpen(false)} />
      ) : null}
      {isAdmin && eventsOpen ? (
        <EventsHistoryDialog onClose={() => setEventsOpen(false)} />
      ) : null}
      {locksOpen ? <VmLocksDialog onClose={() => setLocksOpen(false)} /> : null}
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
      {import.meta.env.DEV && authDebugOpen ? (
        <AuthDebugDialog auth={auth} onClose={() => setAuthDebugOpen(false)} />
      ) : null}
    </>
  )
}
