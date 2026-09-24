import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './bevel'
import { Icon } from './Icon'

export function Toolbar({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'ui-toolbar flex items-center gap-[2px] px-1 py-[3px]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ToolbarSeparator() {
  return (
    <div className="ui-toolbar-sep mx-1 h-[20px] w-px" />
  )
}

export interface ToolbarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  /** Show the label next to the icon instead of only as a tooltip. */
  showLabel?: boolean
  active?: boolean
}

export const ToolbarButton = React.forwardRef<
  HTMLButtonElement,
  ToolbarButtonProps
>(function ToolbarButton(
  { icon, label, showLabel = false, active = false, disabled, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      data-active={active || undefined}
      className={cn(
        'ui-toolbtn flex h-[26px] items-center gap-1 px-1.5 text-base',
        className,
      )}
      {...props}
    >
      <Icon icon={icon} size={16} />
      {showLabel ? <span>{label}</span> : null}
    </button>
  )
})
