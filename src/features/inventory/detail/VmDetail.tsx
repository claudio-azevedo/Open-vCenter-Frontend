import { useQuery } from '@tanstack/react-query'
import { Tabs } from '~/components/win95'
import type { TabItem } from '~/components/win95'
import { vmQuery } from '~/api/queries'
import { useAuth } from '~/auth'
import { VmIcon } from '../tree/nodeIcons'
import { useInventorySelection } from '../selection'
import { DetailHeader } from './DetailHeader'
import { VmSummaryPanel } from './panels/VmSummaryPanel'
import { VmSnapshotsPanel } from './panels/VmSnapshotsPanel'
import { VmConsolePanel } from './panels/VmConsolePanel'
import { VmMetricsPanel } from './panels/VmMetricsPanel'
import { TasksPanel } from './panels/VmTasksPanel'
import { EventsPanel } from './panels/EventsPanel'
import { vmConsoleStateBlock } from './panels/webrdp'
import { VmActionsBar } from './VmActionsBar'

const BASE_TABS: TabItem[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'snapshots', label: 'Snapshots' },
  { id: 'console', label: 'Console' },
  { id: 'tasks', label: 'Tasks' },
]
// only shown when the VM has Hyper-V resource metering on
const METRICS_TAB: TabItem = { id: 'metrics', label: 'VM Metrics' }
// admin only - the audit log
const EVENTS_TAB: TabItem = { id: 'events', label: 'Events' }

export function VmDetail({ vmId }: { vmId: string }) {
  const vm = useQuery(vmQuery(vmId))
  const { tab, setTab } = useInventorySelection()
  const { isAdmin } = useAuth()

  if (vm.isError) {
    return <div className="p-3 text-disabled-text">Virtual machine unavailable.</div>
  }
  const v = vm.data
  if (!v) {
    return <div className="p-3 text-disabled-text">Loading virtual machine…</div>
  }

  // An Off / Paused VM has no screen: the Console tab stays visible but disabled,
  // and a selected Console tab falls back to Summary.
  const consoleBlock = vmConsoleStateBlock(v.state)
  const tabs = [
    ...(v.metricsEnabled
      ? [BASE_TABS[0], METRICS_TAB, ...BASE_TABS.slice(1)]
      : BASE_TABS),
    ...(isAdmin ? [EVENTS_TAB] : []),
  ].map((t) =>
    t.id === 'console' && consoleBlock
      ? { ...t, disabled: true, title: `Console unavailable - ${consoleBlock}` }
      : t,
  )
  const active =
    tab && tabs.some((t) => t.id === tab && !t.disabled) ? tab : 'summary'

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <DetailHeader
        icon={<VmIcon state={v.state} />}
        title={v.name}
        subtitle={`${v.state} · ${v.firmware}`}
        actions={<VmActionsBar vm={v} />}
      />
      <Tabs tabs={tabs} value={active} onChange={setTab} className="flex-1">
        {active === 'summary' ? <VmSummaryPanel vm={v} /> : null}
        {active === 'metrics' ? <VmMetricsPanel vm={v} /> : null}
        {active === 'snapshots' ? <VmSnapshotsPanel vm={v} /> : null}
        {active === 'console' ? <VmConsolePanel vm={v} /> : null}
        {active === 'tasks' ? <TasksPanel vmId={v.id} /> : null}
        {active === 'events' ? <EventsPanel vmId={v.id} /> : null}
      </Tabs>
    </div>
  )
}
