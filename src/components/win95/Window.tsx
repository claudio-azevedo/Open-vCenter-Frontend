import * as React from 'react'
import { cn } from './bevel'
import { TitleBar } from './TitleBar'
import type { TitleBarProps } from './TitleBar'

/**
 * A Win95 window frame. In milestone 1 there is exactly one, maximised to the
 * viewport, but the component stays generic (dialogs reuse it).
 */
export function Window({
  title,
  icon,
  onMinimize,
  onMaximize,
  onClose,
  className,
  bodyClassName,
  children,
}: Pick<TitleBarProps, 'title' | 'icon' | 'onMinimize' | 'onMaximize' | 'onClose'> & {
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'bevel-raised flex flex-col bg-surface p-[3px] pt-[2px]',
        className,
      )}
    >
      <TitleBar
        title={title}
        icon={icon}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
      />
      <div className={cn('flex min-h-0 flex-1 flex-col', bodyClassName)}>
        {children}
      </div>
    </div>
  )
}
