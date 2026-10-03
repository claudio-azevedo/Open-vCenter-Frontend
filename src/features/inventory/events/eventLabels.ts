import type { AuditEvent, AuditOutcome, AuditTargetType } from "~/api/types";
import { STATUS_TEXT, statusClass } from "../tasks/taskLabels";

// keyed by the event's `action` - see ovc-backend services/audit.py callers and
// docs/api-contract.md › Audit log for the catalog.
const ACTION_LABELS: Record<string, string> = {
  // --- VM lifecycle ---
  "vm.create": "Create VM",
  "vm.clone": "Clone VM",
  "vm.delete": "Delete VM",
  "vm.forget": "Remove from Inventory",
  "vm.inventory_remove": "VM Removed Outside OVC",
  "vm.move_folder": "Move VM to Folder",
  "vm.tags": "Change VM Tags",
  "vm.lock_release": "Force Unlock VM",
  "vm.lock_release_all": "Force Unlock All VMs",
  // --- VM power ---
  "vm.start": "Start VM",
  "vm.stop": "Turn Off VM",
  "vm.shutdown": "Shut Down VM",
  "vm.restart": "Restart VM",
  "vm.pause": "Pause VM",
  // --- VM management ---
  "vm.rename": "Rename VM",
  "vm.edit": "Edit VM",
  "vm.migrate": "Migrate VM",
  "vm.move_storage": "Move VM Storage",
  "vm.startup_change": "Change Startup Settings",
  "vm.mount_dvd": "Mount DVD",
  "vm.eject_dvd": "Eject DVD",
  "vm.enable_ha": "Enable High Availability",
  "vm.disable_ha": "Disable High Availability",
  "vm.export_template": "Export as Template",
  "vm.notes_edit": "Edit Notes",
  "vm.snapshot_create": "Create Snapshot",
  "vm.snapshot_remove": "Delete Snapshot",
  "vm.snapshot_restore": "Restore Snapshot",
  "vm.enable_metrics": "Enable Metrics",
  "vm.disable_metrics": "Disable Metrics",
  // --- hosts ---
  "host.create": "Add Host",
  "host.update": "Edit Host",
  "host.move": "Move Host",
  "host.delete": "Remove Host",
  "host.update_agent": "Update Agent",
  "host.suspend": "Pause Node",
  "host.suspend_drain": "Pause Node (Drain)",
  "host.resume": "Resume Node",
  "host.resume_fallback": "Resume Node (Failback)",
  "host.restart": "Restart Host",
  // --- organization ---
  "cluster.create": "Create Cluster",
  "cluster.rename": "Rename Cluster",
  "cluster.delete": "Delete Cluster",
  "folder.create": "Create Folder",
  "folder.rename": "Rename Folder",
  "folder.delete": "Delete Folder",
  "vlan.create": "Create Virtual Network",
  "vlan.update": "Edit Virtual Network",
  "vlan.delete": "Delete Virtual Network",
  // --- tags ---
  "tag_category.create": "Create Tag Category",
  "tag_category.rename": "Rename Tag Category",
  "tag_category.delete": "Delete Tag Category",
  "tag.create": "Create Tag",
  "tag.update": "Edit Tag",
  "tag.delete": "Delete Tag",
  // --- agent builds ---
  "agent_binary.upload": "Upload Agent Build",
  "agent_binary.update": "Edit Agent Build",
  "agent_binary.delete": "Delete Agent Build",
};

export function eventLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export const TARGET_TYPE_LABEL: Record<AuditTargetType, string> = {
  vm: "VM",
  host: "Host",
  cluster: "Cluster",
  folder: "Folder",
  vlan: "Virtual Network",
  tag: "Tag",
  tag_category: "Tag Category",
  agent_binary: "Agent Build",
};

export const OUTCOME_TEXT: Record<AuditOutcome, string> = {
  pending: "Pending",
  succeeded: STATUS_TEXT.succeeded,
  failed: STATUS_TEXT.failed,
  timeout: STATUS_TEXT.timeout,
};

export function outcomeClass(outcome: AuditOutcome): string {
  return statusClass(outcome === "pending" ? "running" : outcome);
}

/** The actor's email, like a task's "Initiated by"; system events have none and
 *  show their name ("Open vCenter"). */
export function eventActor(e: AuditEvent): string {
  return e.actorEmail ?? e.actorName ?? "-";
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  fqdn: "FQDN",
  cluster: "Cluster",
  folder: "Folder",
  tags: "Tags",
  vlanId: "VLAN ID",
  description: "Description",
  isDefault: "Default",
  category: "Category",
  color: "Color",
  notes: "Notes",
  isActive: "Active",
};

function formatValue(v: unknown): string {
  if (v == null || v === "") return "(none)";
  if (Array.isArray(v)) return v.length ? v.map(formatValue).join(", ") : "(none)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // {id, name} references (a folder, a cluster) read by name
    return "name" in o ? formatValue(o.name) : JSON.stringify(o);
  }
  return String(v);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** One-line description of what changed, from `details`. Empty when there is
 *  nothing short to say (the Details dialog shows the full payload). */
export function eventSummary(e: AuditEvent): string {
  const d = e.details ?? {};
  const before = asRecord(d.before);
  const after = asRecord(d.after);
  if (before && after) {
    return Object.keys(after)
      .map(
        (k) =>
          `${FIELD_LABELS[k] ?? k}: ${formatValue(before[k])} → ${formatValue(after[k])}`,
      )
      .join("; ");
  }

  const parts: string[] = [];
  if (d.removeFiles === true) parts.push("Files deleted from disk");
  if (typeof d.vmCount === "number") parts.push(`${d.vmCount} VM record(s) removed`);
  if (typeof d.vmsDetached === "number") parts.push(`${d.vmsDetached} VM(s) detached`);
  if (typeof d.released === "number") parts.push(`${d.released} lock(s) released`);
  if (typeof d.version === "string") parts.push(`Version ${d.version}`);
  if (d.rollout === true) parts.push("from a rollout");
  if (typeof d.sourceName === "string") parts.push(`From ${d.sourceName}`);
  if (typeof d.reason === "string") {
    parts.push(d.reason.charAt(0).toUpperCase() + d.reason.slice(1));
  }
  const params = asRecord(d.params);
  if (params) {
    parts.push(
      Object.entries(params)
        .map(([k, v]) => `${k}: ${formatValue(v)}`)
        .join(", "),
    );
  }
  return parts.join(" · ");
}
