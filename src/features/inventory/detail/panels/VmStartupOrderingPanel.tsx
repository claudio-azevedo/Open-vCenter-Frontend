import { useQuery } from "@tanstack/react-query";
import { ArrowUpWideNarrow } from "lucide-react";
import { Button, Icon, Table, Td, Th } from "~/components/win95";
import { hostsQuery } from "~/api/queries";
import type { Vm } from "~/api/types";
import { vmActionDialog } from "../vmActions/dialogStore";

const isNothing = (vm: Vm) => !vm.autoStartAction || vm.autoStartAction === "Nothing";

/** Boot order as Hyper-V applies it: VMs that auto-start, by delay then name;
 * "Nothing" last, by name. */
function startupOrder(vms: Vm[]): Vm[] {
  return [...vms].sort((a, b) => {
    const an = isNothing(a);
    const bn = isNothing(b);
    if (an !== bn) return an ? 1 : -1;
    if (!an) {
      const d = (a.autoStartDelaySec ?? 0) - (b.autoStartDelaySec ?? 0);
      if (d) return d;
    }
    return a.name.localeCompare(b.name);
  });
}

const ACTION_LABEL: Record<string, string> = {
  StartIfRunning: "Start if running",
  Start: "Always start",
};

/**
 * VM Startup Ordering for a host or a cluster: every VM's Automatic Start
 * action + delay, in boot order. "Edit" opens the per-VM AutoStart dialog
 * (`vm_startup_change`). The cluster view adds HA and current-host columns.
 */
export function VmStartupOrderingPanel({
  vms,
  clustered,
}: {
  vms: Vm[];
  clustered: boolean;
}) {
  const hosts = useQuery({ ...hostsQuery(), enabled: clustered });
  const hostName = (id: string) =>
    hosts.data?.find((h) => h.id === id)?.name ?? "-";
  const rows = startupOrder(vms);

  if (!rows.length) return <p className="text-disabled-text">No VMs.</p>;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-disabled-text">
        Order in which VMs start when the host boots. VMs without an automatic
        start action are listed last.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>Name</Th>
            <Th>State</Th>
            {clustered ? <Th>HA</Th> : null}
            {clustered ? <Th>Host</Th> : null}
            <Th>Automatic start</Th>
            <Th>Startup delay</Th>
            <Th> </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((vm, i) => {
            const nothing = isNothing(vm);
            return (
              <tr key={vm.id}>
                <Td>{nothing ? "" : i + 1}</Td>
                <Td>{vm.name}</Td>
                <Td>{vm.state}</Td>
                {clustered ? <Td>{vm.highlyAvailable ? "Yes" : "No"}</Td> : null}
                {clustered ? <Td>{hostName(vm.hostId)}</Td> : null}
                <Td className={nothing ? "text-disabled-text" : ""}>
                  {nothing
                    ? "Nothing"
                    : (ACTION_LABEL[vm.autoStartAction ?? ""] ?? vm.autoStartAction)}
                </Td>
                <Td>{nothing ? "-" : `${vm.autoStartDelaySec ?? 0}s`}</Td>
                <Td>
                  <Button
                    className="min-w-0 px-2"
                    disabled={!!vm.lock}
                    onClick={() =>
                      vmActionDialog.open({ kind: "autostart", vmId: vm.id })
                    }
                  >
                    <Icon icon={ArrowUpWideNarrow} size={13} />
                    Edit…
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
