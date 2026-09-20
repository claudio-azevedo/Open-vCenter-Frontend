import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runVmAction } from "~/api/endpoints/vms";
import { qk } from "~/api/queryKeys";
import type { Vm, VmState } from "~/api/types";
import { ApiError } from "~/api/client";
import { activeTasks } from "./activeTasks";
import { statusMessage } from "./statusMessage";

export type VmBatchAction = "start" | "stop";

const TRANSITION: Record<VmBatchAction, VmState> = {
  start: "Starting",
  stop: "Stopping",
};

/**
 * Fires the same power action against every VM in the list - one request per VM,
 * since ovc-backend has no batch endpoint. Each returned task id is handed to
 * <TaskWatcher> for polling, exactly like the single-VM path in
 * `useVmPowerAction`.
 */
export function useVmBatchPowerAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      vms,
      action,
    }: {
      vms: Vm[];
      action: VmBatchAction;
    }) => {
      const nextState = TRANSITION[action];
      const ids = new Set(vms.map((v) => v.id));
      const hostIds = new Set(vms.map((v) => v.hostId));

      // Optimistically flip the state across every cached list + detail so the
      // grid reacts immediately, before the tasks even start.
      queryClient.setQueriesData<Vm[]>({ queryKey: ["vms"] }, (list) =>
        Array.isArray(list)
          ? list.map((v) => (ids.has(v.id) ? { ...v, state: nextState } : v))
          : list,
      );
      for (const hostId of hostIds) {
        queryClient.setQueryData<Vm[]>(qk.hostVms(hostId), (list) =>
          list
            ? list.map((v) => (ids.has(v.id) ? { ...v, state: nextState } : v))
            : list,
        );
      }
      for (const v of vms) {
        queryClient.setQueryData<Vm>(qk.vm(v.id), (cur) =>
          cur ? { ...cur, state: nextState } : cur,
        );
      }

      const settled = await Promise.allSettled(
        vms.map((v) => runVmAction(v.id, action)),
      );

      let queued = 0;
      const failed: string[] = [];
      settled.forEach((res, i) => {
        if (res.status === "fulfilled") {
          queued += 1;
          activeTasks.add(res.value.task.id);
          queryClient.setQueryData(qk.task(res.value.task.id), res.value.task);
        } else {
          failed.push(vms[i].name);
        }
      });

      return { queued, failed, total: vms.length, action, hostIds };
    },

    onSuccess({ queued, failed, total, action, hostIds }) {
      const verb = action === "start" ? "Power on" : "Power off";
      if (failed.length === 0) {
        statusMessage.set(
          `${verb}: ${queued} VM${queued === 1 ? "" : "s"} queued`,
        );
      } else {
        statusMessage.set(
          `${verb}: ${queued}/${total} queued - failed: ${failed.join(", ")}`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      for (const hostId of hostIds) {
        queryClient.invalidateQueries({ queryKey: qk.hostVms(hostId) });
      }
    },

    onError(err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      statusMessage.set(`Batch power action failed: ${msg}`);
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },
  });
}
