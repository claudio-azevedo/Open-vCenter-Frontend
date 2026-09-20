import { useQuery } from '@tanstack/react-query'
import { StatusBar, StatusBarPanel } from '~/components/win95'
import { clustersQuery, hostsQuery, vmsQuery } from '~/api/queries'
import { useInventorySelection } from './selection'
import { useActiveTaskIds } from './actions/activeTasks'
import { useStatusMessage } from './actions/statusMessage'

export function InventoryStatusBar() {
  const clusters = useQuery(clustersQuery())
  const hosts = useQuery(hostsQuery())
  const vms = useQuery(vmsQuery())
  const { selection } = useInventorySelection()
  const activeTasks = useActiveTaskIds()
  const message = useStatusMessage()

  const anyData = !!(clusters.data || hosts.data || vms.data)
  const anyFetching =
    clusters.isFetching || hosts.isFetching || vms.isFetching
  const allError = clusters.isError && hosts.isError && vms.isError

  const connection = allError && !anyData
    ? 'Disconnected'
    : anyFetching
      ? 'Refreshing…'
      : 'Connected'

  return (
    <StatusBar>
      <StatusBarPanel grow>{message}</StatusBarPanel>
      {activeTasks.length ? (
        <StatusBarPanel>
          {activeTasks.length} task{activeTasks.length > 1 ? 's' : ''} running
        </StatusBarPanel>
      ) : null}
      <StatusBarPanel>
        {selection ? `${selection.kind}: ${selection.id}` : 'No selection'}
      </StatusBarPanel>
      <StatusBarPanel>
        {hosts.data?.length ?? 0} hosts · {vms.data?.length ?? 0} VMs
      </StatusBarPanel>
      <StatusBarPanel>
        <span
          className={
            connection === 'Disconnected'
              ? 'text-title-active'
              : connection === 'Connected'
                ? 'text-[#008000]'
                : ''
          }
        >
          ● {connection}
        </span>
      </StatusBarPanel>
    </StatusBar>
  )
}
