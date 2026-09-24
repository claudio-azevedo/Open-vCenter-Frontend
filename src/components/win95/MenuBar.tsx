import * as React from 'react'
import { cn } from './bevel'

export interface MenuAction {
  type?: 'item'
  label: React.ReactNode
  onSelect?: () => void
  disabled?: boolean
  shortcut?: string
  /** Radio-style mark (●) - the current choice in a group of options. */
  checked?: boolean
  /** Cascading submenu, opened on hover (or click) like Windows menus. */
  items?: MenuEntry[]
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
  const close = React.useCallback(() => setOpenIndex(null), [])

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
      className="ui-menubar relative flex items-stretch px-[2px] py-[1px] select-none"
    >
      {menus.map((menu, i) => {
        const open = openIndex === i
        return (
          <div key={menu.label} className="relative">
            <button
              type="button"
              data-open={open}
              className="ui-menubar-item px-2 py-[2px] text-base"
              onClick={() => setOpenIndex(open ? null : i)}
              onMouseEnter={() => openIndex !== null && setOpenIndex(i)}
            >
              {menu.label}
            </button>
            {open ? (
              <MenuList
                items={menu.items}
                onDone={close}
                className="absolute left-0 top-full z-50 min-w-[180px]"
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function MenuList({
  items,
  onDone,
  className,
}: {
  items: MenuEntry[]
  onDone: () => void
  className?: string
}) {
  const [openSub, setOpenSub] = React.useState<number | null>(null)

  return (
    <ul role="menu" className={cn('ui-menu', className)}>
      {items.map((entry, j) => {
        if (entry.type === 'separator') {
          return <li key={j} className="ui-menu-sep my-1 h-px" />
        }
        const hasSub = !!entry.items?.length
        const subOpen = hasSub && openSub === j
        return (
          <li
            key={j}
            className="relative"
            onMouseEnter={() => setOpenSub(hasSub && !entry.disabled ? j : null)}
          >
            <button
              type="button"
              role="menuitem"
              aria-haspopup={hasSub ? 'menu' : undefined}
              aria-expanded={hasSub ? subOpen : undefined}
              data-open={subOpen || undefined}
              disabled={entry.disabled}
              className="ui-menu-item flex w-full items-center gap-2 py-[3px] pr-3 pl-1 text-left text-base"
              onClick={() => {
                if (hasSub) {
                  setOpenSub(subOpen ? null : j)
                  return
                }
                onDone()
                entry.onSelect?.()
              }}
            >
              <span
                aria-hidden
                className="ui-menu-lead w-3 shrink-0 text-center text-[8px]"
              >
                {entry.checked ? '●' : null}
              </span>
              <span className="flex-1">{entry.label}</span>
              {entry.shortcut ? (
                <span className="ml-4 opacity-70">{entry.shortcut}</span>
              ) : null}
              {hasSub ? (
                <span aria-hidden className="ml-4 text-[8px]">
                  ▶
                </span>
              ) : null}
            </button>
            {subOpen && entry.items ? (
              <MenuList
                items={entry.items}
                onDone={onDone}
                className="absolute top-[-4px] left-full z-50 min-w-[160px]"
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
