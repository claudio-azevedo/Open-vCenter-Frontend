import { Button, GroupBox, Table, Td, Th } from '~/components/win95'
import type { Vm } from '~/api/types'
import { dateTime } from '../../format'
import { useVmManagementAction } from '../../actions/useVmManagementAction'
import { vmActionDialog } from '../vmActions/dialogStore'
import { confirm } from '../../confirm'

export function VmSnapshotsPanel({ vm }: { vm: Vm }) {
  const mgmt = useVmManagementAction(vm)

  const restore = async (id: string, name: string) => {
    if (
      await confirm({
        title: vm.name,
        message: `Restore snapshot "${name}"? The VM reverts to that point.`,
        confirmLabel: 'Restore',
      })
    ) {
      mgmt.mutate({ kind: 'action', action: 'snapshot_restore', params: { snapshot_id: id } })
    }
  }

  const remove = async (id: string, name: string) => {
    if (
      await confirm({
        title: vm.name,
        message: `Delete snapshot "${name}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      })
    ) {
      mgmt.mutate({ kind: 'action', action: 'snapshot_remove', params: { snapshot_id: id } })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          className="min-w-0 px-2"
          onClick={() => vmActionDialog.open({ kind: 'snapshot-create', vmId: vm.id })}
        >
          Create snapshot…
        </Button>
      </div>
      <GroupBox label="Snapshots">
        {vm.snapshots.length === 0 ? (
          <p className="text-disabled-text">
            No snapshots reported by the host agent yet.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Created</Th>
                <Th className="w-0">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {vm.snapshots.map((s) => (
                <tr key={s.id}>
                  <Td>{s.name || s.id}</Td>
                  <Td>{dateTime(s.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button
                        className="min-w-0 px-2"
                        onClick={() => restore(s.id, s.name || s.id)}
                      >
                        Restore
                      </Button>
                      <Button
                        className="min-w-0 px-2"
                        onClick={() => remove(s.id, s.name || s.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </GroupBox>
    </div>
  )
}
