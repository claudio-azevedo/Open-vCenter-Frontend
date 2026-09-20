import { useQuery } from '@tanstack/react-query'
import { Button, PropertyList, Table, Td, Th } from '~/components/win95'
import {
  clustersQuery,
  foldersQuery,
  hostsQuery,
  vmsQuery,
} from '~/api/queries'
import { FolderIcon } from '../tree/nodeIcons'
import { useInventorySelection } from '../selection'
import { organizeDialog } from '../organize/dialogStore'
import { DetailHeader } from './DetailHeader'

export function FolderDetail({ folderId }: { folderId: string }) {
  const folders = useQuery(foldersQuery({}))
  const clusters = useQuery(clustersQuery())
  const hosts = useQuery(hostsQuery())
  const vms = useQuery(vmsQuery())
  const { select } = useInventorySelection()

  const folder = folders.data?.find((f) => f.id === folderId)
  if (folders.data && !folder) {
    return <div className="p-3 text-disabled-text">Folder not found.</div>
  }

  const scope = folder?.clusterId
    ? `Cluster: ${clusters.data?.find((c) => c.id === folder.clusterId)?.name ?? folder.clusterId}`
    : `Host: ${hosts.data?.find((h) => h.id === folder?.hostId)?.name ?? folder?.hostId}`

  const contents = (vms.data ?? []).filter((v) => v.folderId === folderId)

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <DetailHeader
        icon={<FolderIcon />}
        title={folder?.name ?? folderId}
        subtitle={scope}
        actions={
          <>
            <Button
              className="min-w-0 px-2"
              onClick={() =>
                organizeDialog.open({ kind: 'delete-folder', folderId })
              }
            >
              Delete
            </Button>
          </>
        }
      />
      <PropertyList
        items={[{ label: 'Virtual machines', value: contents.length }]}
      />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>State</Th>
            <Th>Host</Th>
          </tr>
        </thead>
        <tbody>
          {contents.map((v) => (
            <tr
              key={v.id}
              className="cursor-default hover:bg-surface-2"
              onClick={() => select({ kind: 'vm', id: v.id })}
            >
              <Td>{v.name}</Td>
              <Td>{v.state}</Td>
              <Td>{hosts.data?.find((h) => h.id === v.hostId)?.name ?? v.hostId}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}
