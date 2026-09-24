import * as React from 'react'
import { cn } from './bevel'
import { Window } from './Window'

/**
 * A modal dialog. Renders a centred window over a dim backdrop.
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
      <Window
        title={title}
        onClose={onClose}
        style={{ width }}
        role="dialog"
        aria-modal
      >
        <div className="p-4">{children}</div>
        {footer ? (
          <div className={cn('flex justify-end gap-2 px-4 pb-3')}>{footer}</div>
        ) : null}
      </Window>
    </div>
  )
}
