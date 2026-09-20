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

/** Classic push button. `pressed` forces the depressed look (e.g. active toggle). */
export const buttonRecipe = cva(
  'inline-flex items-center justify-center gap-1 bg-surface px-3 py-[3px] ' +
    'text-base leading-none select-none ' +
    'focus-visible:outline focus-visible:outline-1 focus-visible:outline-dotted ' +
    'focus-visible:outline-black focus-visible:outline-offset-[-4px]',
  {
    variants: {
      pressed: {
        true: 'bevel-pressed pt-[4px] pb-[2px] pl-[13px] pr-[11px]',
        false: 'bevel-raised active:bevel-pressed active:pt-[4px] active:pb-[2px]',
      },
      block: { true: 'w-full', false: '' },
      disabled: {
        true: 'text-disabled-text [text-shadow:1px_1px_0_var(--color-disabled-highlight)] cursor-default',
        false: 'cursor-default',
      },
    },
    defaultVariants: { pressed: false, block: false, disabled: false },
  },
)
