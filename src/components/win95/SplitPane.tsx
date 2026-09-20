import * as React from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { cn } from './bevel'

/**
 * Horizontal two-pane split with a Win95-style raised divider.
 * Divider position is persisted per `autoSaveId` in localStorage.
 */
export function SplitPane({
  left,
  right,
  autoSaveId = 'ovc-split',
  defaultLeftSize = 28,
  minLeftSize = 15,
  minRightSize = 30,
  className,
}: {
  left: React.ReactNode
  right: React.ReactNode
  autoSaveId?: string
  defaultLeftSize?: number
  minLeftSize?: number
  minRightSize?: number
  className?: string
}) {
  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId={autoSaveId}
      className={cn('min-h-0 flex-1', className)}
    >
      <Panel
        defaultSize={defaultLeftSize}
        minSize={minLeftSize}
        className="min-w-0"
      >
        {left}
      </Panel>
      <PanelResizeHandle className="group relative w-[6px] shrink-0 bg-surface">
        <span className="pointer-events-none absolute inset-y-0 left-[1px] w-[3px] bevel-thin-raised bg-surface group-data-[resize-handle-active]:bevel-thin-sunken" />
      </PanelResizeHandle>
      <Panel minSize={minRightSize} className="min-w-0">
        {right}
      </Panel>
    </PanelGroup>
  )
}
