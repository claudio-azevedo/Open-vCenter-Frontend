import * as React from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { cn } from './bevel'

/**
 * Horizontal two-pane split with a themed divider.
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
      <PanelResizeHandle className="ui-splitter relative w-[6px] shrink-0">
        <span className="ui-splitter-grip pointer-events-none absolute inset-y-0 left-[1px] w-[3px]" />
      </PanelResizeHandle>
      <Panel minSize={minRightSize} className="min-w-0">
        {right}
      </Panel>
    </PanelGroup>
  )
}
