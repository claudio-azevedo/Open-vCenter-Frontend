import * as React from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { taskQuery } from "~/api/queries";
import { TERMINAL_TASK_STATUSES } from "~/api/types";
import { activeTasks, useActiveTaskIds } from "./activeTasks";
import { statusMessage } from "./statusMessage";
import { taskLabel } from "../tasks/taskLabels";

/**
 * Mounted once in the Explorer. Polls every in-flight task and, when one
 * finishes, refreshes inventory and reports the outcome.
 */
export function TaskWatcher() {
  const ids = useActiveTaskIds();
  const queryClient = useQueryClient();

  const results = useQueries({
    queries: ids.map((id) => taskQuery(id)),
  });

  React.useEffect(() => {
    for (const res of results) {
      const task = res.data;
      if (!task || !TERMINAL_TASK_STATUSES.has(task.status)) continue;

      activeTasks.remove(task.id);
      const label = taskLabel(task.kind);
      statusMessage.set(
        task.status === "succeeded"
          ? // a succeeded task may still carry an advisory (e.g. vm_delete that
            // could not remove every file on disk)
            task.error
            ? `${label} completed - ${task.error}`
            : `${label} completed`
          : `${label} ${task.status}${task.error ? `: ${task.error}` : ""}`,
      );
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["hosts"] });
      if (task.kind === "vm_export_template") {
        // the backend registers the exported template on the task response -
        // the ['hosts'] invalidation above already covers /hosts/:id/templates
        queryClient.invalidateQueries({ queryKey: ["templates"] });
      }
    }
  }, [results, queryClient]);

  return null;
}
