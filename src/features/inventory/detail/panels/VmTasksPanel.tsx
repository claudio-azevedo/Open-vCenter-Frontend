import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Table, Td, Th, cn } from "~/components/win95";
import { hostTasksQuery, vmTasksQuery } from "~/api/queries";
import { dateTime } from "../../format";
import { STATUS_TEXT, statusClass, taskLabel } from "../../tasks/taskLabels";
import { TaskDetailsDialog } from "../../tasks/TaskDetailsDialog";

/** Recent async operations, scoped to a VM or a whole host. */
export function TasksPanel(props: { vmId: string } | { hostId: string }) {
  const query =
    "vmId" in props ? vmTasksQuery(props.vmId) : hostTasksQuery(props.hostId);
  const tasks = useQuery(query);
  const [detailsId, setDetailsId] = React.useState<string | null>(null);

  if (tasks.data && tasks.data.length === 0) {
    return <p className="text-disabled-text">No recent operations.</p>;
  }

  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Operation</Th>
            <Th>Target</Th>
            <Th>Initiated by</Th>
            <Th>Status</Th>
            <Th>Requested at</Th>
            <Th>Finished</Th>
            <Th>Result</Th>
            <Th className="w-[1%]" />
          </tr>
        </thead>
        <tbody>
          {(tasks.data ?? []).map((t) => (
            <tr key={t.id}>
              <Td>{taskLabel(t.kind)}</Td>
              <Td className="truncate">{t.targetName ?? t.targetId}</Td>
              <Td className="truncate">{t.requestedBy}</Td>
              <Td className={cn(statusClass(t.status), "whitespace-nowrap")}>
                {STATUS_TEXT[t.status]}
              </Td>
              <Td>{dateTime(t.createdAt)}</Td>
              <Td>{dateTime(t.finishedAt)}</Td>
              <Td>{t.error ?? t.result ?? "-"}</Td>
              <Td>
                <Button
                  className="min-w-0 px-2 whitespace-nowrap"
                  onClick={() => setDetailsId(t.id)}
                >
                  Details
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {detailsId ? (
        <TaskDetailsDialog
          taskId={detailsId}
          onClose={() => setDetailsId(null)}
        />
      ) : null}
    </>
  );
}

/** Back-compat alias. */
export const VmTasksPanel = ({ vmId }: { vmId: string }) => (
  <TasksPanel vmId={vmId} />
);
