import * as React from "react";
import { ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button, Icon, ProgressBar, Table, Td, Th } from "~/components/win95";
import { cn } from "~/components/win95";
import { recentTasksQuery } from "~/api/queries";
import { TERMINAL_TASK_STATUSES, taskProgress } from "~/api/types";
import { shortDateTime } from "../format";
import { STATUS_TEXT, statusClass, taskLabel } from "./taskLabels";
import { TaskDetailsDialog } from "./TaskDetailsDialog";

const STORAGE_KEY = "ovc-tasks-dock-collapsed";
// Keep the dock a "what happened recently" view: the 15 newest tasks, and drop
// any finished one older than an hour. The full list lives in View ▸ Task History.
const MAX_ROWS = 15;
const WINDOW_MS = 60 * 60 * 1000;

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function TasksDock() {
  const [collapsed, setCollapsed] = React.useState(false);
  const [detailsId, setDetailsId] = React.useState<string | null>(null);
  React.useEffect(() => setCollapsed(readCollapsed()), []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const tasks = useQuery(recentTasksQuery());
  const now = Date.now();
  const rows = (tasks.data ?? [])
    .filter((t) => {
      if (!TERMINAL_TASK_STATUSES.has(t.status)) return true;
      const ts = t.finishedAt ?? t.startedAt ?? t.createdAt;
      return now - new Date(ts).getTime() < WINDOW_MS;
    })
    .slice(0, MAX_ROWS);
  const running = rows.filter(
    (t) => !TERMINAL_TASK_STATUSES.has(t.status),
  ).length;

  return (
    <div className="bevel-thin-raised flex flex-col bg-surface">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 px-2 py-[3px] text-base select-none"
      >
        <Icon icon={collapsed ? ChevronUp : ChevronDown} size={14} />
        <Icon icon={ListChecks} size={14} />
        <span className="font-bold">Recent Tasks</span>
        {running > 0 ? (
          <span className="bevel-thin-sunken bg-window px-1 text-[#00007b]">
            {running} running
          </span>
        ) : null}
        <span className="ml-auto text-disabled-text">
          {rows.length ? `${rows.length} shown` : ""}
        </span>
      </button>

      {collapsed ? null : (
        <div className="h-[160px] px-1 pb-1">
          {rows.length === 0 ? (
            <div className="bevel-sunken flex h-full items-center justify-center bg-window text-disabled-text">
              No tasks in the last hour - see View ▸ Task History.
            </div>
          ) : (
            <Table className="text-xs" wrapperClassName="h-full">
              <thead>
                <tr>
                  <Th className="w-[130px]">Task</Th>
                  <Th className="w-[150px]">Target</Th>
                  <Th className="w-[150px]">Initiated by</Th>
                  <Th className="w-[130px]">Progress</Th>
                  <Th>Details</Th>
                  <Th className="w-[80px]">Status</Th>
                  <Th className="w-[120px]">Started</Th>
                  <Th className="w-[120px]">Completed</Th>
                  <Th className="w-[1%]" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const terminal = TERMINAL_TASK_STATUSES.has(t.status);
                  const details = terminal
                    ? (t.error ?? "")
                    : (t.progressMessage ?? "");
                  return (
                    <tr key={t.id}>
                      <Td>{taskLabel(t.kind)}</Td>
                      <Td className="truncate">{t.targetName ?? t.targetId}</Td>
                      <Td className="truncate">{t.requestedBy}</Td>
                      <Td>
                        <ProgressBar
                          value={taskProgress(t)}
                          indeterminate={t.status === "queued"}
                          tone={terminal ? "muted" : "active"}
                        />
                      </Td>
                      <Td
                        className={cn(
                          "max-w-0 truncate",
                          terminal && t.error
                            ? statusClass("failed")
                            : undefined,
                        )}
                        title={details}
                      >
                        {details || "-"}
                      </Td>
                      <Td
                        className={cn(
                          statusClass(t.status),
                          "whitespace-nowrap",
                        )}
                      >
                        {STATUS_TEXT[t.status]}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {shortDateTime(t.startedAt ?? t.createdAt)}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {terminal ? shortDateTime(t.finishedAt) : "-"}
                      </Td>
                      <Td>
                        <Button
                          className="min-w-0 px-1 whitespace-nowrap"
                          onClick={() => setDetailsId(t.id)}
                        >
                          Details
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {detailsId ? (
        <TaskDetailsDialog
          taskId={detailsId}
          onClose={() => setDetailsId(null)}
        />
      ) : null}
    </div>
  );
}
