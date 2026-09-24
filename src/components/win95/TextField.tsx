import * as React from 'react'
import { cn } from './bevel'

export interface TextFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ label, id, className, ...props }, ref) {
    const autoId = React.useId()
    const inputId = id ?? autoId
    const input = (
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'ui-field px-1.5 py-[3px] text-base outline-none',
          className,
        )}
        {...props}
      />
    )
    if (!label) return input
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-base">
          {label}
        </label>
        {input}
      </div>
    )
  },
)
