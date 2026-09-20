import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runVmAction } from "~/api/endpoints/vms";
import { qk } from "~/api/queryKeys";
import type { Vm, VmPowerAction, VmState } from "~/api/types";
import { ApiError } from "~/api/client";
import { activeTasks } from "./activeTasks";
import { statusMessage } from "./statusMessage";

const TRANSITION: Record<VmPowerAction, VmState> = {
  start: "Starting",
  stop: "Stopping",
  shutdown: "Stopping",
  restart: "Restarting",
  pause: "Pausing",
  delete: "Deleting",
};

/**
 * Optimistically flips the VM state, fires the action, then hands the returned
 * task id to <TaskWatcher> for polling.
 */
export function useVmPowerAction(vm: Pick<Vm, "id" | "name">) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      action,
      removeFiles,
    }: {
      action: VmPowerAction;
      /** delete only - also wipe the VM's files/folder from disk. */
      removeFiles?: boolean;
    }) =>
      runVmAction(
        vm.id,
        action,
        action === "delete" && removeFiles ? { removeFiles: true } : undefined,
      ),

    async onMutate({ action }) {
      await queryClient.cancelQueries({ queryKey: ["vms"] });
      const previous = queryClient.getQueriesData<Vm[] | Vm>({
        queryKey: ["vms"],
      });
      const nextState = TRANSITION[action];

      queryClient.setQueriesData<Vm[]>({ queryKey: ["vms"] }, (list) =>
        Array.isArray(list)
          ? list.map((v) => (v.id === vm.id ? { ...v, state: nextState } : v))
          : list,
      );
      queryClient.setQueryData<Vm>(qk.vm(vm.id), (v) =>
        v ? { ...v, state: nextState } : v,
      );
      statusMessage.set(`${labelFor(action)} ${vm.name}…`);
      return { previous };
    },

    onError(err, _action, ctx) {
      ctx?.previous.forEach(([key, data]) =>
        queryClient.setQueryData(key, data),
      );
      const msg = err instanceof ApiError ? err.message : String(err);
      statusMessage.set(`${vm.name}: ${msg}`);
      // a rejected action (e.g. VM_LOCKED) - pull the real state + lock back
      queryClient.invalidateQueries({ queryKey: ["vms"] });
    },

    onSuccess({ task }) {
      activeTasks.add(task.id);
      queryClient.setQueryData(qk.task(task.id), task);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

function labelFor(action: VmPowerAction) {
  return {
    start: "Starting",
    stop: "Turning off",
    shutdown: "Shutting down",
    restart: "Restarting",
    pause: "Pausing",
    delete: "Deleting",
  }[action];
}
