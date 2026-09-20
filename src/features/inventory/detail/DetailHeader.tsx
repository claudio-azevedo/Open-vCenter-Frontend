import * as React from 'react'
import { cn } from '~/components/win95'

export function DetailHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className={cn('flex items-center gap-2 border-b border-b-bevel-dark pb-2')}>
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-bold">{title}</div>
        {subtitle ? (
          <div className="truncate text-disabled-text">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </div>
  )
}
