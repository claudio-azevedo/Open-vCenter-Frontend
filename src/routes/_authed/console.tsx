import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { hostQuery, vmQuery } from "~/api/queries";
import { VmConsolePanel } from "~/features/inventory/detail/panels/VmConsolePanel";
import { HostConsolePanel } from "~/features/inventory/detail/panels/HostConsolePanel";
import { ConfirmHost } from "~/features/inventory/confirm";
import { VmActionDialogs } from "~/features/inventory/detail/vmActions/VmActionDialogs";
import { TaskWatcher } from "~/features/inventory/actions/TaskWatcher";

/**
 * Standalone console in its own browser tab - a VM's Hyper-V console
 * (`?vm=<id>`, opened from the VM action bar / embedded Console tab) or a
 * host's RDP console (`?host=<id>`, from the host action bar). The operator
 * keeps it open while working on other things in the main tab.
 *
 * Sits under `_authed` (auth + role guard, no Explorer chrome).
 */
export const Route = createFileRoute("/_authed/console")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { vm: string; host: string } => ({
    vm: typeof search.vm === "string" ? search.vm : "",
    host: typeof search.host === "string" ? search.host : "",
  }),
  component: ConsoleRoute,
});

function ConsoleRoute() {
  const { vm: vmId, host: hostId } = Route.useSearch();
  const vm = useQuery({ ...vmQuery(vmId), enabled: !!vmId });
  const host = useQuery({ ...hostQuery(hostId), enabled: !!hostId });

  React.useEffect(() => {
    if (vm.data) document.title = `Console - ${vm.data.name}`;
    else if (host.data) document.title = `Console - ${host.data.name}`;
  }, [vm.data, host.data]);

  let body: React.ReactNode;
  if (hostId) {
    if (host.isError) body = <Notice>Host unavailable.</Notice>;
    else if (!host.data) body = <Notice>Loading host…</Notice>;
    else body = <HostConsolePanel host={host.data} />;
  } else if (vmId) {
    if (vm.isError) body = <Notice>Virtual machine unavailable.</Notice>;
    else if (!vm.data) body = <Notice>Loading virtual machine…</Notice>;
    else body = <VmConsolePanel vm={vm.data} standalone />;
  } else {
    body = <Notice>No VM or host specified.</Notice>;
  }

  return (
    <div className="bg-surface h-screen w-screen overflow-hidden">
      <TaskWatcher />
      <VmActionDialogs />
      <ConfirmHost />
      {body}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-3 text-disabled-text">
      {children}
    </div>
  );
}
