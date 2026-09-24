import * as React from 'react'
import { cn } from './bevel'

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ label, id, className, children, ...props }, ref) {
    const autoId = React.useId()
    const selectId = id ?? autoId
    const select = (
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'ui-field ui-field-thin px-1 py-[2px] text-base appearance-none',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    )
    if (!label) return select
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-base">
          {label}
        </label>
        {select}
      </div>
    )
  },
)
