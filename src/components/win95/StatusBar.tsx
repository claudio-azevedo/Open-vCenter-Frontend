import * as React from 'react'
import { cn } from './bevel'

export function StatusBar({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-stretch gap-[3px] bg-surface px-[2px] py-[2px] text-base',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function StatusBarPanel({
  className,
  grow,
  children,
}: {
  className?: string
  grow?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'bevel-thin-sunken flex items-center gap-1 px-1.5 py-[1px] truncate',
        grow ? 'flex-1' : 'shrink-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
