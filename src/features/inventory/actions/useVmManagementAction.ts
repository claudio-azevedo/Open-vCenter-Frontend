import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runVmAction } from "~/api/endpoints/vms";
import type { VmActionParams } from "~/api/endpoints/vms";
import { qk } from "~/api/queryKeys";
import type { Vm, VmManagementAction } from "~/api/types";
import { ApiError } from "~/api/client";
import { activeTasks } from "./activeTasks";
import { statusMessage } from "./statusMessage";

type Invocation = {
  kind: "action";
  action: VmManagementAction;
  params?: VmActionParams;
};

/**
 * Fires a non-power VM operation (rename, migrate, snapshot, …) and hands the
 * returned task id to <TaskWatcher> for polling. Most of these are backend
 * stubs today - the task will surface as `timeout` until the host agent
 * implements the function.
 */
export function useVmManagementAction(vm: Pick<Vm, "id" | "name">) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inv: Invocation) => runVmAction(vm.id, inv.action, inv.params),

    onMutate(inv) {
      statusMessage.set(`${LABEL[inv.action]} ${vm.name}…`);
    },

    onError(err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      statusMessage.set(`${vm.name}: ${msg}`);
      queryClient.invalidateQueries({ queryKey: ["vms"] });
      queryClient.invalidateQueries({ queryKey: qk.vm(vm.id) });
    },

    onSuccess({ task }) {
      activeTasks.add(task.id);
      queryClient.setQueryData(qk.task(task.id), task);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: qk.vm(vm.id) });
    },
  });
}

const LABEL: Record<VmManagementAction, string> = {
  rename: "Renaming",
  edit: "Updating",
  migrate: "Migrating",
  move_storage: "Moving storage for",
  startup_change: "Updating AutoStart for",
  mount_dvd: "Mounting DVD on",
  eject_dvd: "Ejecting DVD from",
  enable_ha: "Enabling HA for",
  disable_ha: "Disabling HA for",
  export_template: "Exporting",
  notes_edit: "Saving notes for",
  snapshot_create: "Creating snapshot of",
  snapshot_remove: "Removing snapshot of",
  snapshot_restore: "Restoring snapshot of",
  enable_metrics: "Enabling metrics for",
  disable_metrics: "Disabling metrics for",
  refresh: "Refreshing",
};
