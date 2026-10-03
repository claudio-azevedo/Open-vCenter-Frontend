import * as React from "react";
import { Button, Dialog, PropertyList } from "~/components/win95";
import type { AuditEvent } from "~/api/types";
import { dateTime } from "../format";
import { JsonBlock, TaskDetailsDialog } from "../tasks/TaskDetailsDialog";
import {
  OUTCOME_TEXT,
  TARGET_TYPE_LABEL,
  eventActor,
  eventLabel,
  eventSummary,
  outcomeClass,
} from "./eventLabels";

/** One audit event in full - reachable from "Details" in every events list. */
export function EventDetailsDialog({
  event: e,
  onClose,
}: {
  event: AuditEvent;
  onClose: () => void;
}) {
  const [taskOpen, setTaskOpen] = React.useState(false);
  const summary = eventSummary(e);

  return (
    <>
      <Dialog
        title="Event Details"
        onClose={onClose}
        width={720}
        footer={<Button onClick={onClose}>Close</Button>}
      >
        <div className="flex flex-col gap-3">
          <PropertyList
            items={[
              { label: "Event", value: eventLabel(e.action) },
              { label: "Action", value: <code>{e.action}</code> },
              { label: "Time", value: dateTime(e.occurredAt) },
              {
                label: "Initiated by",
                value:
                  e.actorType === "system" ? `${eventActor(e)} (system)` : eventActor(e),
              },
              {
                label: "Target",
                value: `${TARGET_TYPE_LABEL[e.targetType] ?? e.targetType}: ${e.targetName ?? "-"}`,
              },
              { label: "Target id", value: <code>{e.targetId ?? "-"}</code> },
              {
                label: "Outcome",
                value: (
                  <span className={outcomeClass(e.outcome)}>
                    {OUTCOME_TEXT[e.outcome]}
                  </span>
                ),
              },
              ...(summary ? [{ label: "Change", value: summary }] : []),
              ...(e.error
                ? [{ label: "Error", value: <span className="text-danger">{e.error}</span> }]
                : []),
              ...(e.taskId
                ? [
                    {
                      label: "Task",
                      value: (
                        <Button
                          className="min-w-0 px-2"
                          onClick={() => setTaskOpen(true)}
                        >
                          View Task…
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <JsonBlock
            title="Details"
            data={e.details}
            emptyText="No additional details for this event."
          />
        </div>
      </Dialog>

      {taskOpen && e.taskId ? (
        <TaskDetailsDialog taskId={e.taskId} onClose={() => setTaskOpen(false)} />
      ) : null}
    </>
  );
}
