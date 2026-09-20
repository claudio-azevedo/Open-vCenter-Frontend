import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { buttonRecipe, cn } from './bevel'
import { Icon } from './Icon'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Force the depressed appearance (toggle-on state). */
  pressed?: boolean
  block?: boolean
  icon?: LucideIcon
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { pressed = false, block = false, icon, disabled, className, children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cn(
          'min-w-[75px] min-h-[23px]',
          buttonRecipe({ pressed, block, disabled: !!disabled }),
          className,
        )}
        {...props}
      >
        {icon ? <Icon icon={icon} size={16} /> : null}
        {children}
      </button>
    )
  },
)
