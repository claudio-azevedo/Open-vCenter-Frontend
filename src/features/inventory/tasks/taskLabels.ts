import type { TaskStatus } from "~/api/types";

// keyed by the task's `kind` - the agent function name the backend queues
// (see ovc-backend app/services/vms.py::ACTION_MAP + request_vm_create/clone).
const KIND_LABELS: Record<string, string> = {
  // --- VM power ---
  vm_start: "Start VM",
  vm_stop: "Turn Off VM",
  vm_shutdown: "Shut Down VM",
  vm_restart: "Restart VM",
  vm_pause: "Pause VM",
  vm_delete: "Delete VM",
  // --- VM lifecycle ---
  vm_create: "Create VM",
  vm_clone: "Clone VM",
  vm_edit: "Edit VM",
  vm_rename: "Rename VM",
  vm_migrate: "Migrate VM",
  vm_move: "Move VM Storage",
  vm_startup_change: "Change Startup Settings",
  vm_export_template: "Export as Template",
  notes_edit: "Edit Notes",
  // --- VM media ---
  mount_dvd: "Mount DVD",
  eject_dvd: "Eject DVD",
  // --- VM snapshots ---
  snapshot_create: "Create Snapshot",
  snapshot_remove: "Delete Snapshot",
  snapshot_restore: "Restore Snapshot",
  // --- VM misc ---
  vm_enable_metrics: "Enable Metrics",
  vm_disable_metrics: "Disable Metrics",
  enable_ha: "Enable High Availability",
  disable_ha: "Disable High Availability",
  vm_inventory: "Refresh VM Inventory",
  refresh_status: "Refresh VM",
  // --- host ---
  host_hwinventory: "Hardware Inventory",
  host_update_agent: "Update Agent",
  host_restart_agent: "Restart Agent",
};

export function taskLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export const STATUS_TEXT: Record<TaskStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  timeout: "Timed Out",
};

export function statusClass(status: TaskStatus): string {
  switch (status) {
    case "succeeded":
      return "text-success";
    case "failed":
    case "timeout":
      return "font-bold text-danger";
    case "running":
      return "text-running";
    default:
      return "text-disabled-text";
  }
}
