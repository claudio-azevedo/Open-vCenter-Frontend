import { cva } from 'class-variance-authority'
import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Compose class names, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Raised/sunken/flat panel surface. */
export const panelRecipe = cva('bg-surface', {
  variants: {
    bevel: {
      raised: 'bevel-raised',
      sunken: 'bevel-sunken',
      'thin-raised': 'bevel-thin-raised',
      'thin-sunken': 'bevel-thin-sunken',
      window: 'bevel-window',
      none: '',
    },
  },
  defaultVariants: { bevel: 'raised' },
})

/**
 * Push button. Visuals (fill, border, bevel, hover/pressed states) come from
 * the theme via the `ui-btn` class; this recipe only owns layout. `pressed`
 * forces the depressed look (e.g. an active toggle); the 1px text shift of a
 * pressed button is a Classic-only detail.
 */
export const buttonRecipe = cva(
  'ui-btn inline-flex items-center justify-center gap-1 px-3 py-[3px] ' +
    'text-base leading-none select-none cursor-default',
  {
    variants: {
      pressed: {
        true: 'classic:pt-[4px] classic:pb-[2px] classic:pl-[13px] classic:pr-[11px]',
        false: 'classic:active:pt-[4px] classic:active:pb-[2px]',
      },
      block: { true: 'w-full', false: '' },
      // kept for API compatibility - the disabled look is `.ui-btn:disabled`
      disabled: { true: '', false: '' },
    },
    defaultVariants: { pressed: false, block: false, disabled: false },
  },
)
