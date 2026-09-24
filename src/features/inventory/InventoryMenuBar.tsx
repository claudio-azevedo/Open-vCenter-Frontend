import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { MenuBar } from '~/components/win95'
import type { MenuDef, MenuEntry } from '~/components/win95'
import { useAuth } from '~/auth'
import { THEMES, TREE_BEHAVIORS, useTheme, useTreeBehavior } from '~/preferences'
import { useInventorySelection } from './selection'
import { organizeDialog } from './organize/dialogStore'
import { VmLocksDialog } from './locks/VmLocksDialog'
import { TaskHistoryDialog } from './tasks/TaskHistoryDialog'
import { AboutDialog } from './AboutDialog'
import { AuthDebugDialog } from './AuthDebugDialog'

export function InventoryMenuBar() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const auth = useAuth()
  const { isAdmin } = auth
  const [aboutOpen, setAboutOpen] = React.useState(false)
  const [locksOpen, setLocksOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [authDebugOpen, setAuthDebugOpen] = React.useState(false)
  const { selection } = useInventorySelection()
  const { theme, setTheme } = useTheme()
  const { treeBehavior, setTreeBehavior } = useTreeBehavior()

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        {
          label: 'Cluster Management…',
          onSelect: () => organizeDialog.open({ kind: 'cluster-management' }),
        },
        {
          label: 'Hosts Management…',
          onSelect: () => organizeDialog.open({ kind: 'host-management' }),
        },
        ...(isAdmin
          ? ([
              {
                label: 'Agent Management…',
                onSelect: () => organizeDialog.open({ kind: 'agent-management' }),
              },
            ] as MenuEntry[])
          : []),
        { type: 'separator' },
        { label: 'Refresh', shortcut: 'F5', onSelect: () => queryClient.invalidateQueries() },
        { type: 'separator' },
        { label: 'Sign Out', onSelect: () => navigate({ to: '/logout' }) },
      ],
    },
    {
      label: 'Action',
      items: [
        {
          label: 'Move VM to Folder…',
          disabled: selection?.kind !== 'vm',
          onSelect: () =>
            selection?.kind === 'vm' &&
            organizeDialog.open({ kind: 'move-vm', vmId: selection.id }),
        },
        {
          label: 'Move Host…',
          disabled: selection?.kind !== 'host',
          onSelect: () =>
            selection?.kind === 'host' &&
            organizeDialog.open({ kind: 'move-host', hostId: selection.id }),
        },
        {
          label: 'Delete Folder…',
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
        { label: 'Task History…', onSelect: () => setHistoryOpen(true) },
        ...(isAdmin
          ? ([
              { type: 'separator' },
              { label: 'VM Locks…', onSelect: () => setLocksOpen(true) },
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
        { label: 'About Open vCenter…', onSelect: () => setAboutOpen(true) },
        ...(import.meta.env.DEV
          ? ([
              { type: 'separator' },
              { label: 'Auth Debug…', onSelect: () => setAuthDebugOpen(true) },
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
      {locksOpen ? <VmLocksDialog onClose={() => setLocksOpen(false)} /> : null}
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
      {import.meta.env.DEV && authDebugOpen ? (
        <AuthDebugDialog auth={auth} onClose={() => setAuthDebugOpen(false)} />
      ) : null}
    </>
  )
}
