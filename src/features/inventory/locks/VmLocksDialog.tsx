import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, RefreshCw, Trash2 } from "lucide-react";
import { Button, Dialog, Icon, Table, Td, Th } from "~/components/win95";
import { vmLocksQuery } from "~/api/queries";
import { releaseAllVmLocks, releaseVmLock } from "~/api/endpoints/vms";
import { qk } from "~/api/queryKeys";
import { ApiError } from "~/api/client";
import { statusClass, taskLabel } from "../tasks/taskLabels";
import { duration, relTime } from "../format";
import { confirm } from "../confirm";

/** Admin view of every VM currently locked by a running operation. */
export function VmLocksDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const locks = useQuery(vmLocksQuery());

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: qk.vmLocks() });

  const release = useMutation({
    mutationFn: async (vmId: string | null) => {
      if (vmId) await releaseVmLock(vmId);
      else await releaseAllVmLocks();
    },
    onSettled: refresh,
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : String(err);
      window.alert(msg);
    },
  });

  const rows = locks.data ?? [];

  const releaseOne = async (vmId: string, name: string) => {
    if (
      await confirm({
        title: name,
        danger: true,
        confirmLabel: "Force unlock",
        message:
          "Force-release this lock? Only do this if the operation is genuinely stuck - releasing it while the agent is still working can corrupt the VM.",
      })
    ) {
      release.mutate(vmId);
    }
  };

  const releaseAll = async () => {
    if (
      rows.length > 0 &&
      (await confirm({
        title: "Release all VM locks",
        danger: true,
        confirmLabel: `Release ${rows.length}`,
        message:
          "Force-release every lock listed here. Any operation still running on the agent side keeps going - this only clears the backend guard.",
      }))
    ) {
      release.mutate(null);
    }
  };

  return (
    <Dialog
      title="VM Locks"
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button onClick={refresh} className="min-w-0 px-2">
            <Icon icon={RefreshCw} size={13} /> Refresh
          </Button>
          <Button
            onClick={releaseAll}
            disabled={rows.length === 0 || release.isPending}
            className="min-w-0 px-2"
          >
            <Icon icon={Trash2} size={13} /> Release all
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-disabled-text">
          A VM is locked while a mutating operation runs on it, so a second
          operation can&rsquo;t race it. Locks clear on their own when the task
          finishes; release one here only if it is stuck.
        </p>

        {locks.isError ? (
          <p className="text-danger">
            {locks.error instanceof ApiError
              ? locks.error.message
              : "Could not load locks."}
          </p>
        ) : rows.length === 0 ? (
          <p className="bevel-thin-sunken bg-window p-3 text-center text-disabled-text">
            {locks.isLoading ? "Loading…" : "No VMs are locked."}
          </p>
        ) : (
          <Table wrapperClassName="max-h-[360px]">
            <thead>
              <tr>
                <Th>VM</Th>
                <Th>Operation</Th>
                <Th>Started by</Th>
                <Th>Started</Th>
                <Th>Task</Th>
                <Th>Expires in</Th>
                <Th className="w-0" />
              </tr>
            </thead>
            <tbody>
              {rows.map((lk) => (
                <tr key={lk.vmId}>
                  <Td className="font-bold">{lk.vmName ?? lk.vmId}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1">
                      <Icon icon={Lock} size={12} />
                      {taskLabel(lk.kind)}
                    </span>
                  </Td>
                  <Td className="truncate">{lk.requestedBy}</Td>
                  <Td className="whitespace-nowrap">
                    {relTime(lk.acquiredAt)}
                  </Td>
                  <Td
                    className={
                      lk.taskStatus
                        ? statusClass(lk.taskStatus)
                        : "text-disabled-text"
                    }
                  >
                    {lk.taskStatus ?? "gone"}
                  </Td>
                  <Td className="whitespace-nowrap">{duration(lk.ttl)}</Td>
                  <Td>
                    <Button
                      className="min-w-0 px-2"
                      disabled={release.isPending}
                      onClick={() => releaseOne(lk.vmId, lk.vmName ?? lk.vmId)}
                    >
                      <Icon icon={Trash2} size={13} /> Release
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Dialog>
  );
}
