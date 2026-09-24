import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cpu,
  MoreHorizontal,
  Pause,
  Play,
  Power,
  RefreshCw,
} from "lucide-react";
import { Icon, Menu } from "~/components/win95";
import type { MenuItemDef } from "~/components/win95";
import { hostAction } from "~/api/endpoints/hosts";
import type { HostAction } from "~/api/endpoints/hosts";
import { ApiError } from "~/api/client";
import { useAuth } from "~/auth";
import type { HostDetail, Vm } from "~/api/types";
import { activeTasks } from "../actions/activeTasks";
import { statusMessage } from "../actions/statusMessage";
import { confirm, confirmWithCheckbox } from "../confirm";
import { isClusteredHost } from "./vmActions/storage";

const QUEUED: Record<HostAction, string> = {
  suspend: "Pause node",
  suspend_drain: "Pause node (drain)",
  resume: "Resume node",
  resume_fallback: "Resume node (failback)",
  restart: "Restart host",
  refresh_hardware: "Hardware refresh",
  refresh_inventory: "VM inventory refresh",
};

/**
 * Host "Actions" menu: inventory refreshes, Failover Cluster node maintenance
 * (Pause / Pause & Drain, Resume / Resume & Failback) and a host restart.
 * Node maintenance and restart are admin-only; the agent re-checks the
 * preconditions (cluster node, node Paused and no running VMs for a restart).
 */
export function HostActionsMenu({ host, vms }: { host: HostDetail; vms: Vm[] }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: (action: HostAction) => hostAction(host.id, action),
    onSuccess: ({ task }, action) => {
      activeTasks.add(task.id);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      statusMessage.set(`${QUEUED[action]} queued for ${host.name}`);
    },
    onError: (err) =>
      statusMessage.set(err instanceof ApiError ? err.message : String(err)),
  });

  const clustered = isClusteredHost(host);
  const nodeState = host.hardware?.cluster?.state ?? "";
  const running = vms.filter((v) => v.state === "Running").length;
  const disabled = !host.agent.connected || m.isPending;

  const pause = async () => {
    const r = await confirmWithCheckbox({
      title: "Pause Node",
      message: (
        <>
          Pause node <strong>{host.name}</strong> in the cluster? The node goes
          into maintenance mode and stops receiving VMs.
        </>
      ),
      confirmLabel: "Pause",
      checkbox: {
        label: "Drain roles - move running VMs to other nodes before pausing",
      },
    });
    if (r.confirmed) m.mutate(r.checked ? "suspend_drain" : "suspend");
  };

  const resume = async () => {
    const r = await confirmWithCheckbox({
      title: "Resume Node",
      message: (
        <>
          Resume node <strong>{host.name}</strong>? The node becomes active
          again and can receive VMs.
        </>
      ),
      confirmLabel: "Resume",
      checkbox: {
        label: "Failback - move this node's VMs back to it after resuming",
      },
    });
    if (r.confirmed) m.mutate(r.checked ? "resume_fallback" : "resume");
  };

  const restart = async () => {
    if (
      await confirm({
        title: "Restart Host",
        message: (
          <>
            Reboot the physical host <strong>{host.name}</strong>?
            {clustered
              ? " The node must be Paused first - the agent verifies it."
              : ""}
          </>
        ),
        confirmLabel: "Restart",
        danger: true,
      })
    ) {
      m.mutate("restart");
    }
  };

  const items: MenuItemDef[] = [
    {
      label: "Refresh Hardware",
      icon: Cpu,
      disabled,
      onSelect: () => m.mutate("refresh_hardware"),
    },
    {
      label: "Refresh VMs",
      icon: RefreshCw,
      disabled,
      onSelect: () => m.mutate("refresh_inventory"),
    },
  ];
  if (isAdmin) {
    items.push({ type: "separator" });
    if (clustered) {
      items.push(
        nodeState === "Paused"
          ? { label: "Resume Node…", icon: Play, disabled, onSelect: resume }
          : {
              label: "Pause Node…",
              icon: Pause,
              // only an Up node can be paused
              disabled: disabled || nodeState !== "Up",
              onSelect: pause,
            },
      );
    }
    items.push({
      label: running
        ? `Restart Host… (${running} VM${running > 1 ? "s" : ""} running)`
        : "Restart Host…",
      icon: Power,
      danger: true,
      disabled:
        disabled || running > 0 || (clustered && nodeState !== "Paused"),
      onSelect: restart,
    });
  }

  return (
    <Menu
      label={
        <span className="flex items-center gap-1">
          <Icon icon={MoreHorizontal} size={14} />
          Actions
        </span>
      }
      items={items}
    />
  );
}
