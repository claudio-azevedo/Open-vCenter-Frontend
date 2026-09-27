import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from './bevel'

export interface DropdownOption {
  value: string
  label: React.ReactNode
}

/** Tallest the option list gets (px) - `max-h-56`. */
const LIST_MAX = 224
/** Keep this much room from the viewport edge. */
const EDGE = 8

interface ListPlacement {
  left: number
  minWidth: number
  maxHeight: number
  top?: number
  bottom?: number
}

/**
 * A themed combo box. Unlike the native `<select>` (see `Select`), the
 * option list is our own markup, so it matches the theme in every browser.
 *
 * The open list is portalled to `<body>` with fixed positioning, so a
 * scrolling table, a dialog or the window chrome can't clip it or cover it.
 * It opens upwards when there's more room above, and closes on outside
 * scroll or resize (a fixed list would otherwise drift from its field).
 */
export function Dropdown({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
  id,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [placement, setPlacement] = React.useState<ListPlacement | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const autoId = React.useId()
  const fieldId = id ?? autoId

  const selected = options.find((o) => o.value === value)

  // place the list against the field before paint, below it unless the
  // viewport has more room above
  React.useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - EDGE
    const above = r.top - EDGE
    const up = below < LIST_MAX && above > below
    setPlacement({
      left: r.left,
      minWidth: r.width,
      maxHeight: Math.min(LIST_MAX, up ? above : below),
      // overlap the field's 2px bevel, like the in-flow list used to
      ...(up
        ? { bottom: window.innerHeight - r.top - 2 }
        : { top: r.bottom - 2 }),
    })
  }, [open])

  // keep the selected option in view when the list opens (scrollTop, not
  // scrollIntoView, which could scroll an ancestor and trip the close-on-scroll)
  React.useEffect(() => {
    const list = listRef.current
    const opt = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !opt) return
    if (opt.offsetTop + opt.offsetHeight > list.clientHeight) {
      list.scrollTop = opt.offsetTop - (list.clientHeight - opt.offsetHeight) / 2
    }
  }, [placement])

  React.useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) =>
      !!t &&
      (ref.current?.contains(t as Node) || listRef.current?.contains(t as Node))
    function onDocDown(e: MouseEvent) {
      if (!inside(e.target)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onScroll(e: Event) {
      // scrolling the list itself is fine; anything else moves the field
      if (!listRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onResize() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const move = (delta: number) => {
    if (!options.length) return
    const i = options.findIndex((o) => o.value === value)
    const next = options[Math.max(0, Math.min(options.length - 1, i + delta))]
    if (next) onChange(next.value)
  }

  const list =
    open && !disabled && placement
      ? createPortal(
          <ul
            ref={listRef}
            role="listbox"
            // Callers often wrap the field in a <label>. React bubbles this click
            // through the portal to that label; cancelling the default keeps a
            // pick from re-clicking the combobox and re-opening the list.
            onClick={(e) => e.preventDefault()}
            style={{
              left: placement.left,
              top: placement.top,
              bottom: placement.bottom,
              minWidth: placement.minWidth,
              maxHeight: placement.maxHeight,
            }}
            // above every dialog (z-[100]) and its confirmations
            className="ui-listbox fixed z-[1000] w-max max-w-[min(24rem,80vw)] overflow-auto p-[2px]"
          >
            {options.map((o) => {
              const active = o.value === value
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className="ui-option block w-full truncate px-2 py-[2px] text-left text-base"
                    onClick={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              )
            })}
          </ul>,
          document.body,
        )
      : null

  const control = (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        id={fieldId}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            open ? move(1) : setOpen(true)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            move(-1)
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
        className="ui-field flex w-full items-center gap-1 py-[2px] pr-[2px] pl-1 text-left text-base"
      >
        <span className={cn('flex-1 truncate', !selected && 'text-disabled-text')}>
          {selected ? selected.label : placeholder}
        </span>
        <span
          aria-hidden
          data-open={open}
          className="ui-dropdown-btn grid h-[17px] w-[17px] shrink-0 place-items-center"
        >
          <span className="block h-0 w-0 border-x-[4px] border-t-[4px] border-x-transparent border-t-current" />
        </span>
      </button>
      {list}
    </div>
  )

  if (!label) return control
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-base">
        {label}
      </label>
      {control}
    </div>
  )
}
