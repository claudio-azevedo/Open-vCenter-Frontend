import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from './bevel'
import { Icon } from './Icon'

/**
 * A modal Win95 dialog. Renders a centred window over a dim backdrop.
 * `onClose` fires on the ✕ button, the backdrop, and Escape.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 340,
}: {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  width?: number
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/20"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bevel-raised bg-surface p-[3px] pt-[2px]"
        style={{ width }}
        role="dialog"
        aria-modal
      >
        <div className="flex h-[22px] items-center gap-1 bg-title-active bg-gradient-to-r from-title-active to-title-active-2 px-2 text-title-text">
          <span className="flex-1 truncate text-base font-bold">{title}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="bevel-raised active:bevel-pressed grid h-[18px] w-[18px] place-items-center bg-surface text-black"
          >
            <Icon icon={X} size={12} />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer ? (
          <div className={cn('flex justify-end gap-2 px-4 pb-3')}>{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
