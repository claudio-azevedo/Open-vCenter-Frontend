import * as React from 'react'
import { cn } from './bevel'

export interface DropdownOption {
  value: string
  label: React.ReactNode
}

/**
 * A themed combo box. Unlike the native `<select>` (see `Select`), the
 * option list is our own markup, so it matches the theme in every browser.
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
  const ref = React.useRef<HTMLDivElement>(null)
  const autoId = React.useId()
  const fieldId = id ?? autoId

  const selected = options.find((o) => o.value === value)

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

  const move = (delta: number) => {
    if (!options.length) return
    const i = options.findIndex((o) => o.value === value)
    const next = options[Math.max(0, Math.min(options.length - 1, i + delta))]
    if (next) onChange(next.value)
  }

  const control = (
    <div ref={ref} className={cn('relative', className)}>
      <button
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
      {open && !disabled ? (
        <ul
          role="listbox"
          // Callers often wrap the field in a <label>. A click in the list would
          // then run the label's activation behaviour and re-click the combobox
          // button, re-opening the list right after an option closed it.
          // Cancelling the default here stops that for options and padding.
          onClick={(e) => e.preventDefault()}
          className="ui-listbox absolute top-full left-0 z-50 -mt-[2px] max-h-56 w-max min-w-full max-w-[min(24rem,80vw)] overflow-auto p-[2px]"
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
        </ul>
      ) : null}
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
