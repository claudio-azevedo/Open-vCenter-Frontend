import { useInventorySelection } from '../selection'
import { ClusterDetail } from './ClusterDetail'
import { EmptyDetail } from './EmptyDetail'
import { FolderDetail } from './FolderDetail'
import { HostDetail } from './HostDetail'
import { TemplateDetail } from './TemplateDetail'
import { TemplatesFolderDetail } from './TemplatesFolderDetail'
import { VmDetail } from './VmDetail'

export function DetailPane() {
  const { selection } = useInventorySelection()

  return (
    <div className="bevel-sunken h-full overflow-auto bg-surface">
      {!selection ? <EmptyDetail /> : null}
      {selection?.kind === 'cluster' ? (
        <ClusterDetail clusterId={selection.id} />
      ) : null}
      {selection?.kind === 'host' ? <HostDetail hostId={selection.id} /> : null}
      {selection?.kind === 'folder' ? (
        <FolderDetail folderId={selection.id} />
      ) : null}
      {selection?.kind === 'templatefolder' ? (
        <TemplatesFolderDetail scope={selection.id} />
      ) : null}
      {selection?.kind === 'template' ? (
        <TemplateDetail templateId={selection.id} />
      ) : null}
      {selection?.kind === 'vm' ? <VmDetail vmId={selection.id} /> : null}
    </div>
  )
}
