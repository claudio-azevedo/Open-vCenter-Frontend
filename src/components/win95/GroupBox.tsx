import * as React from 'react'
import { cn } from './bevel'

/** fieldset/legend rendered as a Win95 engraved group frame. */
export function GroupBox({
  label,
  className,
  children,
  ...props
}: { label?: React.ReactNode } & React.FieldsetHTMLAttributes<HTMLFieldSetElement>) {
  return (
    <fieldset
      className={cn(
        // <fieldset> defaults to `min-width: min-content` in browsers, which
        // stops it from shrinking to fit a grid/flex track and can overflow
        // the parent - override it so percentage/flex sizing actually applies.
        'min-w-0',
        'bevel-groupbox',
        'px-3 pt-2 pb-3',
        className,
      )}
      {...props}
    >
      {label ? (
        <legend className="bg-surface px-1 text-base">{label}</legend>
      ) : null}
      {children}
    </fieldset>
  )
}
