import { Disc, DiscAlbum, Play, Power, RotateCcw, Square } from 'lucide-react'
import { ToolbarButton, ToolbarSeparator } from '~/components/win95'
import type { Vm } from '~/api/types'
import { TRANSITIONAL_VM_STATES } from '~/api/types'
import { useVmPowerAction } from '../../actions/useVmPowerAction'
import { useVmManagementAction } from '../../actions/useVmManagementAction'
import { confirm } from '../../confirm'
import { vmActionDialog } from '../vmActions/dialogStore'

/**
 * VM power + DVD controls shown at the head of the console toolbar (both the
 * embedded Console tab and the standalone new-tab console). The operator can
 * start / shut down / turn off / restart the VM and mount or eject its DVD
 * without leaving the console.
 *
 * Requires <ConfirmHost/> and <VmActionDialogs/> mounted in the tree (the
 * Explorer and the /console route both mount them).
 */
export function ConsoleVmActions({ vm }: { vm: Vm }) {
  const power = useVmPowerAction(vm)
  const mgmt = useVmManagementAction(vm)

  const busy =
    power.isPending ||
    mgmt.isPending ||
    TRANSITIONAL_VM_STATES.has(vm.state) ||
    !!vm.lock
  const running = vm.state === 'Running'
  const off = vm.state === 'Off'

  const ask = async (message: string, confirmLabel: string, danger = false) =>
    confirm({ title: vm.name, message, confirmLabel, danger })

  return (
    <>
      <ToolbarButton
        icon={Play}
        label="Start"
        onClick={() => power.mutate({ action: 'start' })}
        disabled={busy || !off}
      />
      <ToolbarButton
        icon={Power}
        label="Shut Down"
        onClick={async () => {
          if (await ask('Shut down this VM?', 'Shut Down')) {
            power.mutate({ action: 'shutdown' })
          }
        }}
        disabled={busy || !running}
      />
      <ToolbarButton
        icon={Square}
        label="Turn Off"
        onClick={async () => {
          if (
            await ask(
              'Turn off this VM? Unsaved data in the guest will be lost.',
              'Turn Off',
              true,
            )
          ) {
            power.mutate({ action: 'stop' })
          }
        }}
        disabled={busy || !running}
      />
      <ToolbarButton
        icon={RotateCcw}
        label="Restart"
        onClick={async () => {
          if (await ask('Restart this VM?', 'Restart')) {
            power.mutate({ action: 'restart' })
          }
        }}
        disabled={busy || !running}
      />
      <ToolbarSeparator />
      {vm.dvdPath ? (
        <ToolbarButton
          icon={DiscAlbum}
          label="Eject DVD"
          showLabel
          onClick={async () => {
            if (await ask(`Eject the DVD from "${vm.name}"?`, 'Eject')) {
              mgmt.mutate({ kind: 'action', action: 'eject_dvd' })
            }
          }}
          disabled={busy}
        />
      ) : (
        <ToolbarButton
          icon={Disc}
          label="Mount DVD"
          showLabel
          onClick={() => vmActionDialog.open({ kind: 'mount-dvd', vmId: vm.id })}
          disabled={busy}
        />
      )}
    </>
  )
}
