import { MousePointerClick } from 'lucide-react'
import { Icon } from '~/components/win95'

export function EmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-disabled-text">
      <Icon icon={MousePointerClick} size={28} />
      <p>Select a cluster, host, or virtual machine.</p>
    </div>
  )
}
