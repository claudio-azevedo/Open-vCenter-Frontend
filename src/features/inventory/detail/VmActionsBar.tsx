import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  Copy,
  Disc,
  Download,
  ExternalLink,
  FileUp,
  FolderInput,
  Gauge,
  HardDrive,
  Lock,
  Monitor,
  MoreHorizontal,
  Move,
  Pencil,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { Button, Icon, Menu } from "~/components/win95";
import type { MenuItemDef } from "~/components/win95";
import { qk } from "~/api/queryKeys";
import { hostQuery } from "~/api/queries";
import { releaseVmLock, removeVmFromInventory } from "~/api/endpoints/vms";
import { ApiError } from "~/api/client";
import { useAuth } from "~/auth";
import type { VmManagementAction, Vm } from "~/api/types";
import { VmPowerButtons } from "./VmPowerButtons";
import { vmConsoleTabUrl } from "./panels/webrdp";
import { downloadVmConsoleRdpFile } from "./panels/rdpFile";
import { moveStorageTargets } from "./vmActions/storage";
import { organizeDialog } from "../organize/dialogStore";
import { useVmFolderTargets } from "../organize/scope";
import { vmActionDialog } from "./vmActions/dialogStore";
import { useVmManagementAction } from "../actions/useVmManagementAction";
import { statusMessage } from "../actions/statusMessage";
import { taskLabel } from "../tasks/taskLabels";
import { relTime } from "../format";
import { confirm } from "../confirm";
import { useInventorySelection } from "../selection";

export function VmActionsBar({ vm }: { vm: Vm }) {
  const queryClient = useQueryClient();
  const mgmt = useVmManagementAction(vm);
  const { isAdmin } = useAuth();
  const { select } = useInventorySelection();
  const host = useQuery({ ...hostQuery(vm.hostId), enabled: !!vm.hostId });
  const off = vm.state === "Off";
  const locked = !!vm.lock;
  // Host agent stopped checking in - the VM reads as Unknown and no agent-backed
  // action can run. Only "Remove from Inventory" (a DB-only delete) stays open.
  const hostOffline = host.isSuccess && !host.data.online;

  // HA is a cluster-only concept - hide it entirely on a standalone host
  const inCluster = !!host.data?.clusterId;
  const dvdMounted = !!vm.dvdPath;
  const moveTargets = moveStorageTargets(host.data, vm);
  const folderTargets = useVmFolderTargets(vm.id);

  // Console access needs a reachable host address and the VM's Hyper-V GUID.
  // Two ways in: the in-app HTML5 console (the /console route, own browser tab,
  // so it stays open while working on other VMs) or a downloaded .rdp file that
  // opens the console in the native Windows client.
  const consoleAddr = host.data?.fqdn ?? host.data?.ipAddress ?? null;
  const canOpenConsole = !hostOffline && !!consoleAddr && !!vm.vmUuid;
  const openConsoleTab = () => {
    if (canOpenConsole)
      window.open(vmConsoleTabUrl(vm.id), "_blank", "noopener");
  };
  const consoleMenuItems: MenuItemDef[] = [
    {
      label: "Open HTML5 console in new tab",
      icon: ExternalLink,
      onSelect: openConsoleTab,
    },
    {
      label: "Download .rdp file",
      icon: Download,
      onSelect: () => consoleAddr && downloadVmConsoleRdpFile(vm, consoleAddr),
    },
  ];

  const forceUnlock = async () => {
    if (
      !(await confirm({
        title: vm.name,
        message:
          "Force-release the lock on this VM? Only do this if the operation is genuinely stuck - releasing it while the agent is still working can corrupt the VM.",
        confirmLabel: "Force unlock",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await releaseVmLock(vm.id);
      statusMessage.set(`Lock released for ${vm.name}`);
    } catch (e) {
      statusMessage.set(
        `${vm.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    queryClient.invalidateQueries({ queryKey: ["vms"] });
    queryClient.invalidateQueries({ queryKey: qk.vm(vm.id) });
  };

  const removeFromInventory = async () => {
    if (
      !(await confirm({
        title: vm.name,
        message:
          "Remove this VM from the inventory? This only deletes the record from " +
          "Open vCenter - nothing is sent to the host. If the host " +
          "comes back online and still has the VM, it will reappear.",
        confirmLabel: "Remove",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await removeVmFromInventory(vm.id);
      statusMessage.set(`Removed ${vm.name} from inventory`);
      select({ kind: "host", id: vm.hostId });
    } catch (e) {
      statusMessage.set(
        `${vm.name}: ${e instanceof ApiError ? e.message : String(e)}`,
      );
    }
    queryClient.invalidateQueries({ queryKey: ["vms"] });
    queryClient.invalidateQueries({ queryKey: qk.hostVms(vm.hostId) });
    queryClient.invalidateQueries({ queryKey: qk.host(vm.hostId) });
  };

  // Force the host agent to re-inventory just this VM (read-only, no VM lock),
  // then let <TaskWatcher> refresh the views when the task lands. Falls back to a
  // plain cache invalidation when the host agent is offline.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.vm(vm.id) });
    queryClient.invalidateQueries({ queryKey: ["vms"] });
    if (hostOffline) {
      statusMessage.set(`Refreshed ${vm.name}`);
      return;
    }
    mgmt.mutate({ kind: "action", action: "refresh" });
  };

  const confirmAction = async (action: VmManagementAction, message: string) => {
    if (await confirm({ title: vm.name, message, confirmLabel: "Yes" })) {
      mgmt.mutate({ kind: "action", action });
    }
  };

  const items: MenuItemDef[] = [
    {
      label: "Edit VM…",
      icon: Pencil,
      onSelect: () => vmActionDialog.open({ kind: "edit", vmId: vm.id }),
    },
    {
      label: "Rename VM…",
      icon: TextCursorInput,
      disabled: !off,
      onSelect: () => vmActionDialog.open({ kind: "rename", vmId: vm.id }),
    },
    {
      label: "Edit Notes…",
      icon: Pencil,
      onSelect: () => vmActionDialog.open({ kind: "notes", vmId: vm.id }),
    },
    {
      label: "Move to Folder…",
      icon: FolderInput,
      // no folder exists in the VM's cluster/host scope
      disabled: folderTargets.ready && folderTargets.targets.length === 0,
      onSelect: () => organizeDialog.open({ kind: "move-vm", vmId: vm.id }),
    },
    {
      label: "Move Storage…",
      icon: HardDrive,
      // nowhere to move if the host reports only the volume the VM is on
      disabled: host.isSuccess && moveTargets.length === 0,
      onSelect: () =>
        vmActionDialog.open({ kind: "move-storage", vmId: vm.id }),
    },
    {
      label: "Edit AutoStart…",
      icon: AlarmClock,
      onSelect: () => vmActionDialog.open({ kind: "autostart", vmId: vm.id }),
    },
    { type: "separator" },
    dvdMounted
      ? {
          label: "Eject DVD",
          icon: Disc,
          onSelect: () =>
            confirmAction("eject_dvd", `Eject the DVD from "${vm.name}"?`),
        }
      : {
          label: "Mount DVD…",
          icon: Disc,
          onSelect: () =>
            vmActionDialog.open({ kind: "mount-dvd", vmId: vm.id }),
        },
    { type: "separator" },
    // migration and HA only make sense on a clustered host
    ...(inCluster
      ? ([
          {
            label: "Migrate VM…",
            icon: Move,
            onSelect: () =>
              vmActionDialog.open({ kind: "migrate", vmId: vm.id }),
          },
          vm.highlyAvailable
            ? {
                label: "Disable HA",
                icon: ShieldX,
                onSelect: () =>
                  confirmAction(
                    "disable_ha",
                    `Disable High Availability for "${vm.name}"?`,
                  ),
              }
            : {
                label: "Enable HA",
                icon: ShieldCheck,
                onSelect: () =>
                  confirmAction(
                    "enable_ha",
                    `Enable High Availability for "${vm.name}"?`,
                  ),
              },
          { type: "separator" },
        ] as MenuItemDef[])
      : []),
    // cloning requires the VM to be powered off - hide it otherwise
    ...(off
      ? ([
          {
            label: "Clone VM…",
            icon: Copy,
            onSelect: () =>
              organizeDialog.open({
                kind: "new-vm",
                mode: "clone",
                sourceVmId: vm.id,
                hostId: vm.hostId,
              }),
          },
        ] as MenuItemDef[])
      : []),
    {
      label: "Export as Template…",
      icon: FileUp,
      disabled: !off,
      onSelect: () =>
        vmActionDialog.open({ kind: "export-template", vmId: vm.id }),
    },
    { type: "separator" },
    vm.metricsEnabled
      ? {
          label: "Disable Metrics",
          icon: Gauge,
          onSelect: () =>
            mgmt.mutate({ kind: "action", action: "disable_metrics" }),
        }
      : {
          label: "Enable Metrics",
          icon: Gauge,
          onSelect: () =>
            mgmt.mutate({ kind: "action", action: "enable_metrics" }),
        },
  ];

  // while an operation is running on the VM - or the host agent is offline -
  // every agent-backed action is off-limits. Exceptions: an admin's force-unlock
  // for a stuck lock, and "Remove from Inventory" for a VM stranded on a dead host.
  let menuItems: MenuItemDef[] =
    locked || hostOffline
      ? items.map((it) => ("type" in it ? it : { ...it, disabled: true }))
      : items;
  if (hostOffline) {
    menuItems = [
      ...menuItems,
      { type: "separator" },
      {
        label: "Remove from Inventory…",
        icon: Trash2,
        onSelect: removeFromInventory,
      },
    ];
  }
  if (locked && isAdmin) {
    menuItems = [
      ...menuItems,
      { type: "separator" },
      { label: "Force unlock (admin)", icon: Lock, onSelect: forceUnlock },
    ];
  }

  return (
    <div className="flex items-center gap-1">
      <VmPowerButtons vm={vm} />
      <Button
        className="min-w-0 px-2"
        onClick={refresh}
        title="Refresh details"
      >
        <Icon icon={RefreshCw} size={14} />
        Refresh
      </Button>
      {canOpenConsole ? (
        <Menu
          label={
            <span className="flex items-center gap-1">
              <Icon icon={Monitor} size={14} />
              Console
            </span>
          }
          items={consoleMenuItems}
        />
      ) : null}
      <Menu
        label={
          <span className="flex items-center gap-1">
            <Icon icon={MoreHorizontal} size={14} />
            More
          </span>
        }
        items={menuItems}
      />
      {vm.lock ? (
        <span
          className="bevel-thin-sunken bg-window ml-1 flex items-center gap-1 px-1.5 py-[2px] text-notice-text"
          title={`${taskLabel(vm.lock.kind)} - started by ${vm.lock.requestedBy} ${relTime(
            vm.lock.acquiredAt,
          )}`}
        >
          <Icon icon={Lock} size={12} />
          {taskLabel(vm.lock.kind)}…
        </span>
      ) : null}
    </div>
  );
}
