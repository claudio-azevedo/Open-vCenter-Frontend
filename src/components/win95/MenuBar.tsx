import * as React from 'react'
import { cn } from './bevel'

export interface MenuAction {
  type?: 'item'
  label: React.ReactNode
  onSelect?: () => void
  disabled?: boolean
  shortcut?: string
}
export interface MenuSeparator {
  type: 'separator'
}
export type MenuEntry = MenuAction | MenuSeparator

export interface MenuDef {
  label: string
  items: MenuEntry[]
}

export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)
  const barRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (openIndex === null) return
    function onDocClick(e: MouseEvent) {
      if (!barRef.current?.contains(e.target as Node)) setOpenIndex(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenIndex(null)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [openIndex])

  return (
    <div
      ref={barRef}
      className="bevel-thin-raised relative flex items-stretch bg-surface px-[2px] py-[1px] select-none"
    >
      {menus.map((menu, i) => {
        const open = openIndex === i
        return (
          <div key={menu.label} className="relative">
            <button
              type="button"
              className={cn(
                'px-2 py-[2px] text-base',
                open && 'bg-selection text-selection-text',
              )}
              onClick={() => setOpenIndex(open ? null : i)}
              onMouseEnter={() => openIndex !== null && setOpenIndex(i)}
            >
              {menu.label}
            </button>
            {open ? (
              <ul className="bevel-raised absolute left-0 top-full z-50 min-w-[180px] bg-surface p-[2px] py-1">
                {menu.items.map((entry, j) => {
                  if (entry.type === 'separator') {
                    return (
                      <li
                        key={j}
                        className="my-1 h-px border-t border-t-bevel-dark border-b border-b-bevel-light"
                      />
                    )
                  }
                  return (
                    <li key={j}>
                      <button
                        type="button"
                        disabled={entry.disabled}
                        className={cn(
                          'flex w-full items-center justify-between gap-6 px-4 py-[3px] text-left text-base',
                          entry.disabled
                            ? 'text-disabled-text'
                            : 'hover:bg-selection hover:text-selection-text',
                        )}
                        onClick={() => {
                          setOpenIndex(null)
                          entry.onSelect?.()
                        }}
                      >
                        <span>{entry.label}</span>
                        {entry.shortcut ? (
                          <span className="text-disabled-text">
                            {entry.shortcut}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
