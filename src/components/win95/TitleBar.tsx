import * as React from 'react'
import { Minus, Square, X } from 'lucide-react'
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
  kind,
  label,
  icon,
  onClick,
  disabled,
}: {
  kind: 'minimize' | 'maximize' | 'close'
  label: string
  icon: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-kind={kind}
      onClick={onClick}
      disabled={disabled}
      className="ui-titlebar-btn grid shrink-0 place-items-center"
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
      data-active={active}
      className="ui-titlebar flex shrink-0 items-center gap-1 select-none"
    >
      {icon ? <span className="grid place-items-center">{icon}</span> : null}
      <span className="flex-1 truncate">{title}</span>
      <div className="ui-titlebar-controls flex items-center">
        {onMinimize ? (
          <TitleButton
            kind="minimize"
            label="Minimize"
            onClick={onMinimize}
            icon={<Icon icon={Minus} size={12} className="mt-1" />}
          />
        ) : null}
        {onMaximize ? (
          <TitleButton
            kind="maximize"
            label="Maximize"
            onClick={onMaximize}
            icon={<Icon icon={Square} size={10} />}
          />
        ) : null}
        {onClose ? (
          <TitleButton
            kind="close"
            label="Close"
            onClick={onClose}
            icon={<Icon icon={X} size={12} />}
          />
        ) : null}
      </div>
    </div>
  )
}
