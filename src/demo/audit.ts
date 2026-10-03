import type { AgentBinary, AuditEvent, AuditTargetType, Folder, TagCategory, Vlan } from "~/api/types";
import { DEMO_USER_EMAIL } from "./mode";
import type { DemoCluster, DemoHost, DemoState, DemoTag, DemoTask, DemoVm } from "./model";
import { uuid } from "./random";

/**
 * The simulated audit log - mirrors ovc-backend `services/audit.py`: every
 * write route calls `audit()` after the change, agent-task events start
 * `pending` and `advance()` settles them (`settleTaskEvents`) when the task
 * finishes. Newest first, capped at `MAX_EVENTS`.
 */

const MAX_EVENTS = 500;
const DEMO_USER_NAME = "Demo Administrator";

export interface AuditTarget {
  type: AuditTargetType;
  id: string | null;
  name: string | null;
  hostId: string | null;
  clusterId: string | null;
}

export const vmTarget = (state: DemoState, vm: DemoVm): AuditTarget => ({
  type: "vm",
  id: vm.id,
  name: vm.name,
  hostId: vm.hostId,
  clusterId: state.hosts.find((h) => h.id === vm.hostId)?.clusterId ?? null,
});
export const hostTarget = (h: DemoHost): AuditTarget => ({
  type: "host",
  id: h.id,
  name: h.name,
  hostId: h.id,
  clusterId: h.clusterId,
});
export const clusterTarget = (c: DemoCluster): AuditTarget => ({
  type: "cluster",
  id: c.id,
  name: c.name,
  hostId: null,
  clusterId: c.id,
});
export const folderTarget = (f: Folder): AuditTarget => ({
  type: "folder",
  id: f.id,
  name: f.name,
  hostId: f.hostId,
  clusterId: f.clusterId,
});
export const vlanTarget = (v: Vlan): AuditTarget => ({
  type: "vlan",
  id: v.id,
  name: v.name,
  hostId: v.hostId,
  clusterId: v.clusterId,
});
export const tagTarget = (t: DemoTag): AuditTarget => ({
  type: "tag",
  id: t.id,
  name: t.name,
  hostId: null,
  clusterId: null,
});
export const categoryTarget = (c: TagCategory): AuditTarget => ({
  type: "tag_category",
  id: c.id,
  name: c.name,
  hostId: null,
  clusterId: null,
});
export const binaryTarget = (b: AgentBinary): AuditTarget => ({
  type: "agent_binary",
  id: b.id,
  name: b.version,
  hostId: null,
  clusterId: null,
});

/** Record one event by the demo user (or `actor: null` = a system event). */
export function audit(
  state: DemoState,
  now: number,
  action: string,
  target: AuditTarget,
  opts: {
    task?: DemoTask;
    details?: Record<string, unknown> | null;
    actor?: string | null;
    id?: string;
  } = {},
): AuditEvent {
  const system = opts.actor === null;
  const email = system ? null : (opts.actor ?? DEMO_USER_EMAIL);
  const event: AuditEvent = {
    id: opts.id ?? uuid(),
    occurredAt: new Date(now).toISOString(),
    actorType: system ? "system" : "user",
    actorEmail: email,
    actorName: system ? "Open vCenter" : email === DEMO_USER_EMAIL ? DEMO_USER_NAME : email,
    action,
    targetType: target.type,
    targetId: target.id,
    targetName: target.name,
    hostId: target.hostId,
    clusterId: target.clusterId,
    taskId: opts.task?.id ?? null,
    outcome: opts.task ? "pending" : "succeeded",
    error: null,
    details: opts.details && Object.keys(opts.details).length ? opts.details : null,
  };
  state.auditEvents.unshift(event);
  if (state.auditEvents.length > MAX_EVENTS) state.auditEvents.length = MAX_EVENTS;
  return event;
}

/** `{ before, after }` with only the changed keys, or null when nothing changed
 *  (the caller then records nothing). */
export function changes(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const keys = Object.keys(after).filter(
    (k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null),
  );
  if (!keys.length) return null;
  return {
    before: Object.fromEntries(keys.map((k) => [k, before[k] ?? null])),
    after: Object.fromEntries(keys.map((k) => [k, after[k] ?? null])),
  };
}

/** A finished task: stamp its outcome on the events still pending for it. */
export function settleTaskEvents(state: DemoState, task: DemoTask) {
  for (const e of state.auditEvents) {
    if (e.taskId === task.id && e.outcome === "pending") {
      e.outcome = task.outcome;
      e.error = task.error;
    }
  }
}

/** Agent task kind → the action the backend audits for it (read-only kinds
 *  such as refresh_* are not audited). */
export const TASK_AUDIT_ACTION: Record<string, string> = {
  vm_start: "vm.start",
  vm_stop: "vm.stop",
  vm_shutdown: "vm.shutdown",
  vm_restart: "vm.restart",
  vm_pause: "vm.pause",
  vm_edit: "vm.edit",
  vm_migrate: "vm.migrate",
  vm_startup_change: "vm.startup_change",
  mount_dvd: "vm.mount_dvd",
  vm_export_template: "vm.export_template",
  vm_enable_metrics: "vm.enable_metrics",
  snapshot_create: "vm.snapshot_create",
  snapshot_remove: "vm.snapshot_remove",
  host_update_agent: "host.update_agent",
};

/** `GET /audit-events`: the backend's filters, newest first, cursor-paged
 *  (here the cursor is the id of the last event of the previous page). */
export function listAuditEvents(state: DemoState, query: Record<string, string>) {
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const q = query.q?.toLowerCase();
  let rows = state.auditEvents.filter(
    (e) =>
      (!query.targetType || e.targetType === query.targetType) &&
      (!query.targetId || e.targetId === query.targetId) &&
      (!query.hostId || e.hostId === query.hostId) &&
      (!query.clusterId || e.clusterId === query.clusterId) &&
      (!query.outcome || e.outcome === query.outcome) &&
      (!query.action || e.action === query.action) &&
      (!q ||
        [e.targetName, e.actorEmail, e.actorName].some((v) => v?.toLowerCase().includes(q))),
  );
  if (query.cursor) {
    const at = rows.findIndex((e) => e.id === query.cursor);
    rows = at >= 0 ? rows.slice(at + 1) : [];
  }
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? items[items.length - 1].id : null,
  };
}
