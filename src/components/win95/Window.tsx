import * as React from 'react'
import { cn } from './bevel'
import { TitleBar } from './TitleBar'
import type { TitleBarProps } from './TitleBar'

/**
 * A window frame (title bar + body). The Explorer is one maximised to the
 * viewport; `Dialog`, the login card and the access-denied page reuse it.
 */
export function Window({
  title,
  icon,
  onMinimize,
  onMaximize,
  onClose,
  className,
  bodyClassName,
  style,
  children,
  ...props
}: Pick<TitleBarProps, 'title' | 'icon' | 'onMinimize' | 'onMaximize' | 'onClose'> & {
  className?: string
  bodyClassName?: string
  style?: React.CSSProperties
  children: React.ReactNode
} & Pick<React.HTMLAttributes<HTMLDivElement>, 'role' | 'aria-modal'>) {
  return (
    <div
      className={cn('ui-window flex flex-col', className)}
      style={style}
      {...props}
    >
      <TitleBar
        title={title}
        icon={icon}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
      />
      <div
        className={cn(
          'ui-window-body flex min-h-0 flex-1 flex-col',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
