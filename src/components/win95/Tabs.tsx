import * as React from 'react'
import { cn } from './bevel'
import { ScrollArea } from './ScrollArea'

export interface TabItem {
  id: string
  label: React.ReactNode
}

/**
 * Win95 tab strip. Controlled: parent owns the active id (we keep it in the URL
 * so a selected detail tab is deep-linkable).
 */
export function Tabs({
  tabs,
  value,
  onChange,
  className,
  children,
}: {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div role="tablist" className="relative z-10 flex gap-0.5 px-1">
        {tabs.map((tab) => {
          const active = tab.id === value
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={cn(
                'bg-surface px-3 pt-[3px] text-base select-none',
                'border border-b-0 border-t-bevel-light border-l-bevel-light border-r-bevel-dark',
                active
                  ? 'relative -mb-px pb-[4px] pt-[4px]'
                  : 'mt-[2px] pb-[2px] text-black/90',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <ScrollArea
        className="bevel-thin-raised min-h-0 flex-1 bg-surface"
        viewportClassName="p-3"
      >
        {children}
      </ScrollArea>
    </div>
  )
}
