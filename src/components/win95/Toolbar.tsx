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
        'bevel-thin-raised flex items-center gap-[2px] bg-surface px-1 py-[3px]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ToolbarSeparator() {
  return (
    <div className="mx-1 h-[20px] w-px border-l border-l-bevel-dark border-r border-r-bevel-light" />
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
      className={cn(
        'flex h-[26px] items-center gap-1 px-1.5 text-base',
        'hover:bevel-thin-raised active:bevel-thin-sunken',
        active && 'bevel-thin-sunken bg-surface-2',
        disabled && 'text-disabled-text hover:shadow-none',
        className,
      )}
      {...props}
    >
      <Icon icon={icon} size={16} />
      {showLabel ? <span>{label}</span> : null}
    </button>
  )
})
