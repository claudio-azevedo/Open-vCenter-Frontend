import { HardDrive } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Icon, SplitPane, Window } from '~/components/win95'
import { InventoryMenuBar } from './InventoryMenuBar'
import { InventoryStatusBar } from './InventoryStatusBar'
import { InventoryTree } from './tree/InventoryTree'
import { DetailPane } from './detail/DetailPane'
import { TaskWatcher } from './actions/TaskWatcher'
import { TasksDock } from './tasks/TasksDock'
import { OrganizeDialogs } from './organize/OrganizeDialogs'
import { VmActionDialogs } from './detail/vmActions/VmActionDialogs'
import { ConfirmHost } from './confirm'

export function InventoryExplorer() {
  const navigate = useNavigate()

  return (
    <div className="h-full w-full p-1">
      <Window
        title="Open vCenter"
        icon={<Icon icon={HardDrive} size={16} className="text-title-text" />}
        onClose={() => navigate({ to: '/logout' })}
        className="h-full w-full"
      >
        <TaskWatcher />
        <OrganizeDialogs />
        <VmActionDialogs />
        <ConfirmHost />
        <div className="flex min-h-0 flex-1 flex-col gap-[2px] p-[3px]">
          <InventoryMenuBar />
          <SplitPane
            className="mt-[2px]"
            left={
              <div className="h-full pr-[3px]">
                <InventoryTree />
              </div>
            }
            right={
              <div className="h-full pl-[3px]">
                <DetailPane />
              </div>
            }
          />
          <TasksDock />
          <InventoryStatusBar />
        </div>
      </Window>
    </div>
  )
}
