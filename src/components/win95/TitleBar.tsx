import * as React from 'react'
import { Minus, Square, X } from 'lucide-react'
import { cn } from './bevel'
import { Icon } from './Icon'

export interface TitleBarProps {
  title: React.ReactNode
  icon?: React.ReactNode
  active?: boolean
  onMinimize?: () => void
  onMaximize?: () => void
  onClose?: () => void
}

function TitleButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string
  icon: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'bevel-raised active:bevel-pressed grid h-[18px] w-[18px] place-items-center bg-surface',
        'text-black disabled:text-disabled-text',
      )}
    >
      {icon}
    </button>
  )
}

export function TitleBar({
  title,
  icon,
  active = true,
  onMinimize,
  onMaximize,
  onClose,
}: TitleBarProps) {
  return (
    <div
      className={cn(
        'flex h-[22px] items-center gap-1 px-[3px] py-[2px] select-none',
        active
          ? 'bg-title-active bg-gradient-to-r from-title-active to-title-active-2 text-title-text'
          : 'bg-title-inactive text-surface-2',
      )}
    >
      {icon ? <span className="grid place-items-center">{icon}</span> : null}
      <span className="flex-1 truncate text-base font-bold">{title}</span>
      <div className="flex items-center gap-[2px]">
        {onMinimize ? (
          <TitleButton
            label="Minimize"
            onClick={onMinimize}
            icon={<Icon icon={Minus} size={12} className="mt-1" />}
          />
        ) : null}
        {onMaximize ? (
          <TitleButton
            label="Maximize"
            onClick={onMaximize}
            icon={<Icon icon={Square} size={10} />}
          />
        ) : null}
        {onClose ? (
          <TitleButton
            label="Close"
            onClick={onClose}
            icon={<Icon icon={X} size={12} />}
          />
        ) : null}
      </div>
    </div>
  )
}
