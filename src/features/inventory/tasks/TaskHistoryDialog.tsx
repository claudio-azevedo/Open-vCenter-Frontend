import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import {
  Button,
  Dialog,
  Icon,
  Table,
  Td,
  Th,
  TextField,
} from "~/components/win95";
import { cn } from "~/components/win95";
import { taskHistoryQuery } from "~/api/queries";
import { qk } from "~/api/queryKeys";
import { ApiError } from "~/api/client";
import { TERMINAL_TASK_STATUSES } from "~/api/types";
import type { Task } from "~/api/types";
import { dateTime } from "../format";
import { STATUS_TEXT, statusClass, taskLabel } from "./taskLabels";
import { TaskDetailsDialog } from "./TaskDetailsDialog";

/** View ▸ Task History - every task the user can see, newest first, searchable. */
export function TaskHistoryDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const tasks = useQuery(taskHistoryQuery());
  const [q, setQ] = React.useState("");
  const [detailsId, setDetailsId] = React.useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: qk.taskHistory() });

  const all = tasks.data ?? [];
  const rows = React.useMemo(() => filterTasks(all, q), [all, q]);

  return (
    <>
    <Dialog
      title="Task History"
      onClose={onClose}
      width={860}
      footer={
        <>
          <Button onClick={refresh} className="min-w-0 px-2">
            <Icon icon={RefreshCw} size={13} /> Refresh
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon icon={Search} size={14} className="text-disabled-text" />
          <TextField
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by task, type, VM / host, or who started it…"
            className="flex-1"
          />
          {q ? (
            <Button className="min-w-0 px-2" onClick={() => setQ("")}>
              Clear
            </Button>
          ) : null}
        </div>

        {tasks.isError ? (
          <p className="text-danger">
            {tasks.error instanceof ApiError
              ? tasks.error.message
              : "Could not load task history."}
          </p>
        ) : rows.length === 0 ? (
          <p className="bevel-thin-sunken bg-window p-3 text-center text-disabled-text">
            {tasks.isLoading
              ? "Loading…"
              : all.length === 0
                ? "No tasks have run yet."
                : `No tasks match “${q}”.`}
          </p>
        ) : (
          <Table className="text-xs" wrapperClassName="max-h-[440px]">
            <thead>
              <tr>
                <Th className="w-[150px]">Task</Th>
                <Th className="w-[150px]">Target</Th>
                <Th className="w-[130px]">Initiated by</Th>
                <Th className="w-[80px]">Status</Th>
                <Th className="w-[150px]">Started</Th>
                <Th className="w-[150px]">Completed</Th>
                <Th className="w-[1%]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const terminal = TERMINAL_TASK_STATUSES.has(t.status);
                return (
                  <React.Fragment key={t.id}>
                    <tr>
                      <Td>{taskLabel(t.kind)}</Td>
                      <Td className="truncate">{t.targetName ?? t.targetId}</Td>
                      <Td className="truncate">{t.requestedBy}</Td>
                      <Td
                        className={cn(
                          statusClass(t.status),
                          "whitespace-nowrap",
                        )}
                      >
                        {STATUS_TEXT[t.status]}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {dateTime(t.startedAt ?? t.createdAt)}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {terminal ? dateTime(t.finishedAt) : "-"}
                      </Td>
                      <Td>
                        <Button
                          className="min-w-0 px-2 whitespace-nowrap"
                          onClick={() => setDetailsId(t.id)}
                        >
                          Details
                        </Button>
                      </Td>
                    </tr>
                    {t.error ? (
                      <tr>
                        <Td />
                        <td colSpan={6} className="px-1 pb-1 text-danger">
                          {t.error}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </Table>
        )}

        <p className="text-disabled-text">
          {all.length >= 200
            ? "Showing the 200 most recent tasks."
            : `${rows.length} of ${all.length} task${all.length === 1 ? "" : "s"}.`}
        </p>
      </div>
    </Dialog>

    {detailsId ? (
      <TaskDetailsDialog taskId={detailsId} onClose={() => setDetailsId(null)} />
    ) : null}
    </>
  );
}

function filterTasks(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) => {
    const haystack = [
      taskLabel(t.kind),
      t.kind,
      t.targetName ?? "",
      t.targetId,
      t.requestedBy,
      STATUS_TEXT[t.status],
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
