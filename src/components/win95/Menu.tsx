import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { buttonRecipe, cn } from './bevel'
import { Icon } from './Icon'

export interface MenuItem {
  type?: 'item'
  label: React.ReactNode
  icon?: LucideIcon
  onSelect?: () => void
  disabled?: boolean
  /** Render the label in the "destructive" colour. */
  danger?: boolean
}
export interface MenuItemSeparator {
  type: 'separator'
}
export type MenuItemDef = MenuItem | MenuItemSeparator

/**
 * A single dropdown button (unlike `MenuBar`, which is a whole strip). Used for
 * "More Actions ▾" style overflow menus in detail panels.
 */
export function Menu({
  label,
  items,
  align = 'end',
  disabled,
  className,
}: {
  label: React.ReactNode
  items: MenuItemDef[]
  align?: 'start' | 'end'
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'min-h-[23px] min-w-0 px-2',
          buttonRecipe({ pressed: open, block: false, disabled: !!disabled }),
        )}
      >
        {label}
        <span aria-hidden className="text-[10px] leading-none">
          ▾
        </span>
      </button>
      {open ? (
        <ul
          role="menu"
          className={cn(
            'bevel-raised absolute top-full z-50 mt-[1px] min-w-[190px] bg-surface p-[2px] py-1',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((entry, i) => {
            if (entry.type === 'separator') {
              return (
                <li
                  key={i}
                  className="my-1 h-px border-t border-t-bevel-dark border-b border-b-bevel-light"
                />
              )
            }
            return (
              <li key={i}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={entry.disabled}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-[3px] text-left text-base',
                    entry.disabled
                      ? 'text-disabled-text'
                      : 'hover:bg-selection hover:text-selection-text',
                    entry.danger && !entry.disabled && 'text-[#c00000]',
                  )}
                  onClick={() => {
                    setOpen(false)
                    entry.onSelect?.()
                  }}
                >
                  {entry.icon ? <Icon icon={entry.icon} size={14} /> : null}
                  <span>{entry.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
