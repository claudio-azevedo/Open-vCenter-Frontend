import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { Button, Dialog, Icon, PropertyList, cn } from "~/components/win95";
import { taskQuery } from "~/api/queries";
import { ApiError } from "~/api/client";
import { dateTime } from "../format";
import { STATUS_TEXT, statusClass, taskLabel } from "./taskLabels";

/** Shows exactly what the backend sent the host agent for a task and what came
 *  back - reachable from the "Details" action in every task list. */
export function TaskDetailsDialog({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const task = useQuery(taskQuery(taskId));
  const t = task.data;

  return (
    <Dialog title="Task Details" onClose={onClose} width={720} footer={
      <Button onClick={onClose}>Close</Button>
    }>
      {task.isError ? (
        <p className="text-[#c00000]">
          {task.error instanceof ApiError
            ? task.error.message
            : "Could not load the task."}
        </p>
      ) : !t ? (
        <p className="text-disabled-text">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <PropertyList
            items={[
              { label: "Task", value: taskLabel(t.kind) },
              { label: "Function", value: <code>{t.kind}</code> },
              {
                label: "Status",
                value: (
                  <span className={statusClass(t.status)}>
                    {STATUS_TEXT[t.status]}
                  </span>
                ),
              },
              { label: "Target", value: t.targetName ?? t.targetId },
              { label: "Initiated by", value: t.requestedBy },
              { label: "Created", value: dateTime(t.createdAt) },
              { label: "Started", value: dateTime(t.startedAt) },
              { label: "Finished", value: dateTime(t.finishedAt) },
              { label: "Correlation id", value: <code>{t.correlationId ?? "-"}</code> },
              ...(t.error
                ? [{ label: "Error", value: <span className="text-[#c00000]">{t.error}</span> }]
                : []),
            ]}
          />

          <JsonBlock title="Request sent to agent" data={t.requestPayload} />
          <JsonBlock title="Response from agent" data={t.responsePayload} />
        </div>
      )}
    </Dialog>
  );
}

function JsonBlock({
  title,
  data,
}: {
  title: string;
  data: Record<string, unknown> | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const text = data ? JSON.stringify(data, null, 2) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - ignore */
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-base font-bold">{title}</span>
        {data ? (
          <Button className="min-w-0 px-2" onClick={copy}>
            <Icon icon={Copy} size={12} /> {copied ? "Copied" : "Copy"}
          </Button>
        ) : null}
      </div>
      <pre
        className={cn(
          "bevel-thin-sunken max-h-[240px] overflow-auto bg-window p-2",
          "font-mono text-xs whitespace-pre",
          !data && "text-disabled-text",
        )}
      >
        {data ? text : "Not available (task not yet sent, or predates this feature)."}
      </pre>
    </div>
  );
}
