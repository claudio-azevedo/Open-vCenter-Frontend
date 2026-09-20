import type { LucideIcon, LucideProps } from 'lucide-react'
import { cn } from './bevel'

/**
 * Lucide icon wrapper with Win95-friendly defaults: 16px, 2px stroke, no
 * anti-alias smoothing inherited from the base layer.
 */
export function Icon({
  icon: LucideComp,
  size = 16,
  className,
  ...props
}: { icon: LucideIcon; size?: number } & Omit<LucideProps, 'ref'>) {
  return (
    <LucideComp
      size={size}
      strokeWidth={2}
      className={cn('shrink-0', className)}
      aria-hidden
      {...props}
    />
  )
}
