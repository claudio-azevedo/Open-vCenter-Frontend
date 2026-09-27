import { ApiError } from "~/api/client";
import type { RequestOptions } from "~/api/client";
import type {
  AgentBinary,
  Folder,
  Tag,
  TagCategory,
  TagColor,
  Vlan,
  VmCloneBody,
  VmCreateBody,
  VmLockEntry,
  VmState,
} from "~/api/types";
import { TAG_COLORS, TERMINAL_TASK_STATUSES } from "~/api/types";
import { DEMO_USER_EMAIL } from "./mode";
import type { DemoHost, DemoState, DemoTag, DemoVm } from "./model";
import { hostMetrics, vmMetrics } from "./metrics";
import { placementError } from "./paths";
import { randomHex, uuid } from "./random";
import { TB, newHostRecord } from "./seed";
import {
  advance,
  clusterOut,
  hostDefaultVmPath,
  hostDetailOut,
  hostOnline,
  hostOut,
  lockVm,
  placeholderVm,
  queueTask,
  taskDetailOut,
  taskOut,
  taskStatus,
  vmOut,
} from "./sim";
import { getDemoState, resetDemoState, saveDemoState } from "./store";

/**
 * The simulated ovc-backend. `api/client.ts` `request()` hands every call here
 * in demo mode, so the whole UI - queries, mutations, TaskWatcher, polling -
 * runs unchanged against the REST contract in `docs/api-contract.md`,
 * including its validations and error codes.
 */

type Query = Record<string, string>;
interface Ctx {
  state: DemoState;
  now: number;
  params: Record<string, string>;
  query: Query;
  body: unknown;
}
type Handler = (ctx: Ctx) => unknown;

const routes: { method: string; parts: string[]; handler: Handler }[] = [];
const route = (method: string, pattern: string, handler: Handler) =>
  routes.push({ method, parts: pattern.split("/").filter(Boolean), handler });

function match(method: string, path: string) {
  const segs = path.split("?")[0].split("/").filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== segs.length) continue;
    const params: Record<string, string> = {};
    const ok = r.parts.every((part, i) => {
      if (part.startsWith(":")) {
        params[part.slice(1)] = decodeURIComponent(segs[i]);
        return true;
      }
      return part === segs[i];
    });
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demoRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (typeof window === "undefined") {
    // SSR: the demo inventory lives in the visitor's browser - the client
    // fetches it after hydration.
    throw new ApiError(503, "DEMO_MODE", "Demo data lives in the browser");
  }
  const method = opts.method ?? "GET";
  // a touch of latency so pending states show like against a real backend
  await sleep(method === "GET" ? 40 + Math.random() * 60 : 150 + Math.random() * 150);

  const state = getDemoState();
  const now = Date.now();
  let dirty = advance(state, now);
  try {
    const m = match(method, path);
    if (!m) {
      throw new ApiError(404, "NOT_FOUND", `${method} ${path} is not simulated in demo mode`);
    }
    const query: Query = {};
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== "") query[k] = String(v);
    }
    const result = m.handler({ state, now, params: m.params, query, body: opts.body });
    if (method !== "GET") dirty = true;
    return (result === undefined ? undefined : JSON.parse(JSON.stringify(result))) as T;
  } finally {
    if (dirty) saveDemoState();
  }
}

/** File ▸ Reset Demo Data - a brand-new random inventory. */
export function resetDemo() {
  resetDemoState();
}

// ---- errors & lookups ----------------------------------------------------------

const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found`);
const invalid = (message: string) => new ApiError(400, "INVALID", message);
const validation = (message: string) => new ApiError(422, "VALIDATION_ERROR", message);
const conflict = (code: string, message: string, details?: unknown) =>
  new ApiError(409, code, message, details);

function getOr404<T extends { id: string }>(items: T[], id: string, what: string): T {
  const found = items.find((x) => x.id === id);
  if (!found) throw notFound(what);
  return found;
}

const hostById = (s: DemoState, id: string) => getOr404(s.hosts, id, "Host");
const vmById = (s: DemoState, id: string) => getOr404(s.vms, id, "VM");

function body<T>(ctx: Ctx): Partial<T> {
  return (ctx.body && typeof ctx.body === "object" ? ctx.body : {}) as Partial<T>;
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

function requireOnline(host: DemoHost | undefined, now: number) {
  if (!host || !hostOnline(host, now)) {
    throw conflict(
      "HOST_OFFLINE",
      `Host '${host?.name ?? "?"}' agent is offline - operations are unavailable until it reconnects`,
    );
  }
}

function vmLocked(vm: DemoVm) {
  return conflict(
    "VM_LOCKED",
    `'${vm.name}' is busy - a ${vm.lock?.kind ?? "operation"} is already running on it. Wait for it to finish before trying again.`,
    { lock: vm.lock },
  );
}

function runningTask(s: DemoState, now: number, hostId: string, kinds: Set<string>) {
  return s.tasks.find(
    (t) =>
      t.hostId === hostId &&
      t.targetType === "host" &&
      kinds.has(t.kind) &&
      !TERMINAL_TASK_STATUSES.has(taskStatus(t, now)),
  );
}

// ---- clusters -------------------------------------------------------------------

route("GET", "/clusters", ({ state }) =>
  [...state.clusters].sort(byName).map((c) => clusterOut(state, c)),
);

route("GET", "/clusters/:id", ({ state, params }) =>
  clusterOut(state, getOr404(state.clusters, params.id, "Cluster")),
);

route("POST", "/clusters", (ctx) => {
  const name = String(body<{ name: string }>(ctx).name ?? "").trim();
  if (!name) throw validation("name is required");
  const cluster = {
    id: uuid(),
    name,
    hypervisor: "hyperv" as const,
    csvs: [1, 2].map((i) => ({
      path: `C:\\ClusterStorage\\Volume${i}`,
      label: `CSV-0${i}`,
      totalBytes: 4 * TB,
      freeBytes: Math.round(4 * TB * 0.9),
    })),
  };
  ctx.state.clusters.push(cluster);
  return clusterOut(ctx.state, cluster);
});

route("PATCH", "/clusters/:id", (ctx) => {
  const c = getOr404(ctx.state.clusters, ctx.params.id, "Cluster");
  const name = String(body<{ name: string }>(ctx).name ?? "").trim();
  if (name) c.name = name;
  return clusterOut(ctx.state, c);
});

route("DELETE", "/clusters/:id", ({ state, params }) => {
  const c = getOr404(state.clusters, params.id, "Cluster");
  const members = state.hosts.filter((h) => h.clusterId === c.id).length;
  if (members) {
    throw invalid(`Cluster '${c.name}' still has ${members} host(s) - move or remove them first`);
  }
  const folderIds = new Set(state.folders.filter((f) => f.clusterId === c.id).map((f) => f.id));
  for (const v of state.vms) if (v.folderId && folderIds.has(v.folderId)) v.folderId = null;
  state.folders = state.folders.filter((f) => f.clusterId !== c.id);
  state.vlans = state.vlans.filter((v) => v.clusterId !== c.id);
  state.clusters = state.clusters.filter((x) => x.id !== c.id);
});

// ---- hosts --------------------------------------------------------------------------

route("GET", "/hosts", ({ state, query, now }) =>
  state.hosts
    .filter((h) => !query.clusterId || h.clusterId === query.clusterId)
    .sort(byName)
    .map((h) => hostOut(state, h, now)),
);

route("GET", "/hosts/:id", ({ state, params, now }) =>
  hostDetailOut(state, hostById(state, params.id), now),
);

route("GET", "/hosts/:id/vms", ({ state, params, now }) => {
  const host = hostById(state, params.id);
  return state.vms
    .filter((v) => v.hostId === host.id)
    .sort(byName)
    .map((v) => vmOut(state, v, now));
});

route("GET", "/hosts/:id/metrics", ({ state, params, now }) =>
  hostMetrics(state, hostById(state, params.id), now),
);

route("GET", "/hosts/:id/templates", ({ state, params }) =>
  state.templates.filter((t) => t.hostId === hostById(state, params.id).id).sort(byName),
);

route("GET", "/hosts/:id/isos", ({ state, params }) =>
  state.isos.filter((i) => i.hostId === hostById(state, params.id).id).sort(byName),
);

route("GET", "/hosts/:id/agent-config", ({ state, params }) => {
  const host = hostById(state, params.id);
  const rabbitmqUrl = `amqps://agent-${host.shortId}:${randomHex(24)}@rabbitmq.demo.ovc:5671/ovc`;
  return {
    hostId: host.shortId,
    rabbitmqUrl,
    filename: "config.ini",
    configIni: [
      "[agent]",
      `host_id = ${host.shortId}`,
      `rabbitmq_url = ${rabbitmqUrl}`,
      "",
      "log_level = info",
      "task_timeout = 60",
      "refresh_interval_vms = 180",
      "refresh_interval_host = 600",
      "metrics_interval = 300",
      "max_concurrent_jobs = 4",
      "",
      "; Required - point these at real directories on this host:",
      "template_path = D:\\HyperV\\TEMPLATES",
      "local_iso_path = D:\\HyperV\\ISOS",
      "",
      "; Optional - extra VM storage roots, semicolon-separated:",
      "; aditional_vm_storage = E:\\HyperV",
      "",
    ].join("\n"),
  };
});

route("GET", "/hosts/:id/agent-install-url", ({ state, params, now }) => {
  const host = hostById(state, params.id);
  const filename = `install-ovc-agent-${host.shortId}.ps1`;
  const exp = Math.floor(now / 1000) + 900;
  const url = `https://ovc.demo.local/api/hosts/${host.id}/agent-install.ps1?exp=${exp}&token=${randomHex(40)}`;
  return {
    url,
    filename,
    expiresAt: new Date(exp * 1000).toISOString(),
    command: `iwr '${url}' -OutFile "$env:TEMP\\${filename}" -UseBasicParsing; & "$env:TEMP\\${filename}"`,
  };
});

route("POST", "/hosts", (ctx) => {
  const b = body<{ name: string; clusterId: string | null }>(ctx);
  const name = String(b.name ?? "").trim();
  if (!name) throw validation("name is required");
  if (ctx.state.hosts.some((h) => h.name.toLowerCase() === name.toLowerCase())) {
    throw invalid(`A host named '${name}' already exists`);
  }
  const clusterId = b.clusterId ?? null;
  if (clusterId) getOr404(ctx.state.clusters, clusterId, "Cluster");
  const host = newHostRecord({ name, clusterId, now: ctx.now });
  ctx.state.hosts.push(host);
  return hostDetailOut(ctx.state, host, ctx.now);
});

route("PATCH", "/hosts/:id", (ctx) => {
  const host = hostById(ctx.state, ctx.params.id);
  const b = body<{ name: string; fqdn: string; clusterId: string | null }>(ctx);
  if (typeof b.name === "string" && b.name.trim()) host.name = b.name.trim();
  if (typeof b.fqdn === "string") host.fqdn = b.fqdn.trim() || host.fqdn;
  if ("clusterId" in b && (b.clusterId ?? null) !== host.clusterId) {
    const next = b.clusterId ?? null;
    if (next) getOr404(ctx.state.clusters, next, "Cluster");
    // moving between scopes clears folder assignments and host-scoped folders
    for (const v of ctx.state.vms) if (v.hostId === host.id) v.folderId = null;
    ctx.state.folders = ctx.state.folders.filter((f) => f.hostId !== host.id);
    host.clusterId = next;
    host.nodeState = "Up";
    if (!next && !host.localVolumes.some((v) => !v.path.startsWith("C:"))) {
      host.localVolumes.push({
        path: "D:\\",
        label: "Data",
        totalBytes: 2 * TB,
        freeBytes: Math.round(2 * TB * 0.7),
      });
    }
  }
  return hostDetailOut(ctx.state, host, ctx.now);
});

route("DELETE", "/hosts/:id", ({ state, params }) => {
  const host = hostById(state, params.id);
  state.vms = state.vms.filter((v) => v.hostId !== host.id);
  state.folders = state.folders.filter((f) => f.hostId !== host.id);
  state.vlans = state.vlans.filter((v) => v.hostId !== host.id);
  state.templates = state.templates.filter((t) => t.hostId !== host.id);
  state.isos = state.isos.filter((i) => i.hostId !== host.id);
  state.hosts = state.hosts.filter((h) => h.id !== host.id);
});

route("POST", "/hosts/:id/actions/update-agent", (ctx) => {
  const { state, now } = ctx;
  const host = hostById(state, ctx.params.id);
  requireOnline(host, now);
  if (runningTask(state, now, host.id, new Set(["host_update_agent"]))) {
    throw conflict("AGENT_UPGRADE_IN_PROGRESS", `An agent upgrade is already running on '${host.name}'`);
  }
  const binaryId = body<{ binaryId: string | null }>(ctx).binaryId;
  const binary = binaryId
    ? getOr404(state.agentBinaries, binaryId, "Agent binary")
    : state.agentBinaries.find((b) => b.isActive && b.hypervisor === host.hypervisor);
  if (!binary) {
    throw conflict("NO_ACTIVE_AGENT_BINARY", `No active agent binary for hypervisor '${host.hypervisor}'`);
  }
  if (host.agentVersion === binary.version) {
    throw conflict("AGENT_ALREADY_CURRENT", `'${host.name}' already runs agent ${binary.version}`);
  }
  return { task: taskOut(queueAgentUpgrade(state, now, host, binary), now) };
});

function queueAgentUpgrade(state: DemoState, now: number, host: DemoHost, binary: AgentBinary) {
  return queueTask(state, now, {
    kind: "host_update_agent",
    targetType: "host",
    targetId: host.id,
    targetName: host.name,
    hostId: host.id,
    requestedBy: DEMO_USER_EMAIL,
    params: { version: binary.version, checksum_sha256: binary.checksumSha256 },
    meta: { version: binary.version },
  });
}

const CLUSTER_NODE_ACTIONS = new Set(["suspend", "suspend_drain", "resume", "resume_fallback"]);
const DISRUPTIVE_HOST_ACTIONS = new Set([...CLUSTER_NODE_ACTIONS, "restart"]);
const HOST_ACTIONS = new Set([...DISRUPTIVE_HOST_ACTIONS, "refresh_hardware", "refresh_inventory"]);

route("POST", "/hosts/:id/actions/:action", ({ state, params, now }) => {
  const { action } = params;
  if (!HOST_ACTIONS.has(action)) {
    throw new ApiError(404, "UNKNOWN_ACTION", `Unknown host action '${action}'`);
  }
  const host = hostById(state, params.id);
  requireOnline(host, now);
  if (CLUSTER_NODE_ACTIONS.has(action) && !host.clusterId) {
    throw conflict("NOT_CLUSTERED", `Host '${host.name}' is not a Failover Cluster node`);
  }
  if (DISRUPTIVE_HOST_ACTIONS.has(action)) {
    const existing = runningTask(state, now, host.id, DISRUPTIVE_HOST_ACTIONS);
    if (existing) {
      throw conflict(
        "HOST_ACTION_IN_PROGRESS",
        `A '${existing.kind}' operation is already running on '${host.name}'`,
        { taskId: existing.id },
      );
    }
  }
  // what the agent itself would refuse
  let error: string | null = null;
  if (action === "restart") {
    const running = state.vms.filter((v) => v.hostId === host.id && v.state === "Running").length;
    if (running) error = `${running} VM(s) are still running - shut them down or migrate them first.`;
    else if (host.clusterId && host.nodeState !== "Paused") error = "The cluster node must be paused before a restart.";
  }
  const task = queueTask(state, now, {
    kind: action,
    targetType: "host",
    targetId: host.id,
    targetName: host.name,
    hostId: host.id,
    requestedBy: DEMO_USER_EMAIL,
    params: {},
    outcome: error ? "failed" : undefined,
    error: error ?? undefined,
  });
  if (action === "restart" && !error) {
    // the host drops off for most of the reboot
    const start = task.createdAt + task.queueMs;
    host.offlineFrom = start + 3_000;
    host.offlineUntil = start + task.runMs - 2_000;
  }
  return { task: taskOut(task, now) };
});

// ---- folders -----------------------------------------------------------------------

route("GET", "/folders", ({ state, query }) =>
  state.folders
    .filter((f) => !query.hostId || f.hostId === query.hostId)
    .filter((f) => !query.clusterId || f.clusterId === query.clusterId)
    .sort(byName),
);

route("POST", "/folders", (ctx) => {
  const b = body<{ name: string; clusterId: string; hostId: string }>(ctx);
  const name = String(b.name ?? "").trim();
  if (!name) throw validation("name is required");
  if (!!b.clusterId === !!b.hostId) throw invalid("Give exactly one of clusterId or hostId");
  if (b.clusterId) getOr404(ctx.state.clusters, b.clusterId, "Cluster");
  if (b.hostId && hostById(ctx.state, b.hostId).clusterId) {
    throw invalid("A clustered host's VMs use its cluster's folders");
  }
  const folder: Folder = {
    id: uuid(),
    name,
    clusterId: b.clusterId ?? null,
    hostId: b.hostId ?? null,
  };
  ctx.state.folders.push(folder);
  return folder;
});

route("PATCH", "/folders/:id", (ctx) => {
  const f = getOr404(ctx.state.folders, ctx.params.id, "Folder");
  const name = String(body<{ name: string }>(ctx).name ?? "").trim();
  if (name) f.name = name;
  return f;
});

route("DELETE", "/folders/:id", ({ state, params }) => {
  const f = getOr404(state.folders, params.id, "Folder");
  for (const v of state.vms) if (v.folderId === f.id) v.folderId = null;
  state.folders = state.folders.filter((x) => x.id !== f.id);
});

// ---- VLANs -------------------------------------------------------------------------

route("GET", "/vlans", ({ state, query }) => {
  let list = state.vlans;
  if (query.hostId) {
    const host = hostById(state, query.hostId);
    list = list.filter(
      (v) => v.hostId === host.id || (host.clusterId && v.clusterId === host.clusterId),
    );
  } else if (query.clusterId) {
    list = list.filter((v) => v.clusterId === query.clusterId);
  }
  return [...list].sort((a, b) => a.vlanId - b.vlanId);
});

function setDefaultVlan(state: DemoState, vlan: Vlan) {
  for (const v of state.vlans) {
    if (v.id !== vlan.id && v.clusterId === vlan.clusterId && v.hostId === vlan.hostId) {
      v.isDefault = false;
    }
  }
}

route("POST", "/vlans", (ctx) => {
  const b = body<Vlan & { clusterId: string; hostId: string }>(ctx);
  const name = String(b.name ?? "").trim();
  const tag = Number(b.vlanId);
  if (!name) throw validation("name is required");
  if (!Number.isInteger(tag) || tag < 1 || tag > 4094) throw validation("vlanId must be 1-4094");
  if (!!b.clusterId === !!b.hostId) throw invalid("Give exactly one of clusterId or hostId");
  if (b.hostId && hostById(ctx.state, b.hostId).clusterId) {
    throw invalid("A clustered host uses its cluster's VLANs");
  }
  const scope = { clusterId: b.clusterId ?? null, hostId: b.hostId ?? null };
  if (ctx.state.vlans.some((v) => v.vlanId === tag && v.clusterId === scope.clusterId && v.hostId === scope.hostId)) {
    throw invalid(`VLAN ${tag} already exists in this scope`);
  }
  const vlan: Vlan = {
    id: uuid(),
    name,
    vlanId: tag,
    description: b.description?.trim() || null,
    isDefault: !!b.isDefault,
    ...scope,
  };
  ctx.state.vlans.push(vlan);
  if (vlan.isDefault) setDefaultVlan(ctx.state, vlan);
  return vlan;
});

route("PATCH", "/vlans/:id", (ctx) => {
  const vlan = getOr404(ctx.state.vlans, ctx.params.id, "VLAN");
  const b = body<Vlan>(ctx);
  if (typeof b.name === "string" && b.name.trim()) vlan.name = b.name.trim();
  if (b.description !== undefined) vlan.description = b.description?.trim() || null;
  if (typeof b.isDefault === "boolean") {
    vlan.isDefault = b.isDefault;
    if (vlan.isDefault) setDefaultVlan(ctx.state, vlan);
  }
  return vlan;
});

route("DELETE", "/vlans/:id", ({ state, params }) => {
  getOr404(state.vlans, params.id, "VLAN");
  state.vlans = state.vlans.filter((v) => v.id !== params.id);
});

// ---- tags (global catalog; mirrors ovc-backend services/tags.py) ----------------------

const TAG_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

function tagName(what: string, raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (!TAG_NAME_RE.test(name)) {
    throw invalid(
      `${what} names use letters, digits, '_' and '-' only (1-64 characters, no spaces)`,
    );
  }
  return name;
}

function tagColor(raw: unknown): TagColor {
  if (!TAG_COLORS.includes(raw as TagColor)) {
    throw invalid(`Tag colors are one of: ${TAG_COLORS.join(", ")}`);
  }
  return raw as TagColor;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const byNameCI = <T extends { name: string }>(a: T, b: T) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

function tagOut(state: DemoState, t: DemoTag): Tag {
  return { ...t, vmCount: state.vms.filter((v) => v.tagIds.includes(t.id)).length };
}

function requireUniqueTag(state: DemoState, name: string, categoryId: string | null, selfId?: string) {
  const dup = state.tags.find(
    (t) => t.id !== selfId && t.categoryId === categoryId && sameName(t.name, name),
  );
  if (dup) {
    const where = categoryId
      ? `category '${state.tagCategories.find((c) => c.id === categoryId)?.name}'`
      : "the standalone tags";
    throw conflict("DUPLICATE", `A tag named '${name}' already exists in ${where}`);
  }
}

route("GET", "/tag-categories", ({ state }): TagCategory[] => [...state.tagCategories].sort(byNameCI));

route("POST", "/tag-categories", (ctx) => {
  const name = tagName("Category", body<{ name: string }>(ctx).name);
  if (ctx.state.tagCategories.some((c) => sameName(c.name, name))) {
    throw conflict("DUPLICATE", `A category named '${name}' already exists`);
  }
  const category: TagCategory = { id: uuid(), name };
  ctx.state.tagCategories.push(category);
  return category;
});

route("PATCH", "/tag-categories/:id", (ctx) => {
  const category = getOr404(ctx.state.tagCategories, ctx.params.id, "Tag category");
  const name = tagName("Category", body<{ name: string }>(ctx).name);
  if (ctx.state.tagCategories.some((c) => c.id !== category.id && sameName(c.name, name))) {
    throw conflict("DUPLICATE", `A category named '${name}' already exists`);
  }
  category.name = name;
  return category;
});

route("DELETE", "/tag-categories/:id", ({ state, params }) => {
  const category = getOr404(state.tagCategories, params.id, "Tag category");
  const gone = new Set(state.tags.filter((t) => t.categoryId === category.id).map((t) => t.id));
  state.tags = state.tags.filter((t) => !gone.has(t.id));
  for (const vm of state.vms) vm.tagIds = vm.tagIds.filter((id) => !gone.has(id));
  state.tagCategories = state.tagCategories.filter((c) => c.id !== category.id);
});

route("GET", "/tags", ({ state }): Tag[] => {
  const categoryName = (t: DemoTag) =>
    state.tagCategories.find((c) => c.id === t.categoryId)?.name.toLowerCase() ?? "";
  return [...state.tags]
    .sort(
      (a, b) =>
        Number(a.categoryId === null) - Number(b.categoryId === null) ||
        categoryName(a).localeCompare(categoryName(b)) ||
        byNameCI(a, b),
    )
    .map((t) => tagOut(state, t));
});

route("POST", "/tags", (ctx) => {
  const b = body<{ name: string; categoryId: string | null; color: TagColor }>(ctx);
  const name = tagName("Tag", b.name);
  const color = tagColor(b.color ?? "gray");
  const categoryId = b.categoryId ?? null;
  if (categoryId) getOr404(ctx.state.tagCategories, categoryId, "Tag category");
  requireUniqueTag(ctx.state, name, categoryId);
  const tag: DemoTag = { id: uuid(), name, categoryId, color };
  ctx.state.tags.push(tag);
  return tagOut(ctx.state, tag);
});

route("PATCH", "/tags/:id", (ctx) => {
  const tag = getOr404(ctx.state.tags, ctx.params.id, "Tag");
  const b = body<{ name: string; categoryId: string | null; color: TagColor }>(ctx);
  const name = b.name !== undefined ? tagName("Tag", b.name) : tag.name;
  const color = b.color !== undefined ? tagColor(b.color) : tag.color;
  const categoryId = "categoryId" in b ? (b.categoryId ?? null) : tag.categoryId;
  const category = categoryId
    ? getOr404(ctx.state.tagCategories, categoryId, "Tag category")
    : null;
  requireUniqueTag(ctx.state, name, categoryId, tag.id);
  if (category && category.id !== tag.categoryId) {
    const siblings = new Set(
      ctx.state.tags.filter((t) => t.categoryId === category.id && t.id !== tag.id).map((t) => t.id),
    );
    const clashes = ctx.state.vms.filter(
      (v) => v.tagIds.includes(tag.id) && v.tagIds.some((id) => siblings.has(id)),
    ).length;
    if (clashes) {
      throw conflict(
        "TAG_CONFLICT",
        `${clashes} VM(s) with tag '${tag.name}' already have a tag of category '${category.name}' - a VM holds one tag per category`,
      );
    }
  }
  tag.name = name;
  tag.color = color;
  tag.categoryId = categoryId;
  return tagOut(ctx.state, tag);
});

route("DELETE", "/tags/:id", ({ state, params }) => {
  const tag = getOr404(state.tags, params.id, "Tag");
  state.tags = state.tags.filter((t) => t.id !== tag.id);
  for (const vm of state.vms) vm.tagIds = vm.tagIds.filter((id) => id !== tag.id);
});

route("PUT", "/vms/:id/tags", (ctx) => {
  const vm = vmById(ctx.state, ctx.params.id);
  const ids = [...new Set(body<{ tagIds: string[] }>(ctx).tagIds ?? [])];
  const tags = ids.map((id) => getOr404(ctx.state.tags, id, "Tag"));
  for (const category of ctx.state.tagCategories) {
    const group = tags.filter((t) => t.categoryId === category.id);
    if (group.length > 1) {
      throw conflict(
        "TAG_CONFLICT",
        `A VM holds one tag per category - pick one of ${group.map((t) => t.name).sort().join(", ")} (category '${category.name}')`,
      );
    }
  }
  vm.tagIds = ids;
  return vmOut(ctx.state, vm, ctx.now);
});

// ---- VMs: reads & organization ---------------------------------------------------------

route("GET", "/vms", ({ state, query, now }) =>
  state.vms
    .filter((v) => !query.hostId || v.hostId === query.hostId)
    .filter((v) => !query.folderId || v.folderId === query.folderId)
    .sort(byName)
    .map((v) => vmOut(state, v, now))
    .filter((v) => !query.state || v.state === query.state),
);

route("GET", "/vms/:id", ({ state, params, now }) => vmOut(state, vmById(state, params.id), now));

route("GET", "/vms/:id/metrics", ({ state, params, now }) =>
  vmMetrics(vmById(state, params.id), now),
);

route("PATCH", "/vms/:id", (ctx) => {
  const vm = vmById(ctx.state, ctx.params.id);
  const folderId = body<{ folderId: string | null }>(ctx).folderId ?? null;
  if (folderId) {
    const folder = getOr404(ctx.state.folders, folderId, "Folder");
    const host = hostById(ctx.state, vm.hostId);
    const reachable = host.clusterId
      ? folder.clusterId === host.clusterId
      : folder.hostId === host.id;
    if (!reachable) throw invalid("That folder is not reachable from the VM's host");
  }
  vm.folderId = folderId;
  return vmOut(ctx.state, vm, ctx.now);
});

route("DELETE", "/vms/:id/from-inventory", ({ state, params, now }) => {
  const vm = vmById(state, params.id);
  const host = state.hosts.find((h) => h.id === vm.hostId);
  if (host && hostOnline(host, now) && vm.vmUuid) {
    throw conflict("HOST_ONLINE", `Host '${host.name}' is online and still reports '${vm.name}'`);
  }
  state.vms = state.vms.filter((v) => v.id !== vm.id);
  return { removed: true };
});

// ---- VMs: agent operations -------------------------------------------------------------

const VM_ACTIONS: Record<string, { fn: string; transitional?: VmState }> = {
  start: { fn: "vm_start", transitional: "Starting" },
  stop: { fn: "vm_stop", transitional: "Stopping" },
  shutdown: { fn: "vm_shutdown", transitional: "Stopping" },
  restart: { fn: "vm_restart", transitional: "Restarting" },
  pause: { fn: "vm_pause", transitional: "Pausing" },
  delete: { fn: "vm_delete", transitional: "Deleting" },
  enable_metrics: { fn: "vm_enable_metrics" },
  disable_metrics: { fn: "vm_disable_metrics" },
  rename: { fn: "vm_rename" },
  edit: { fn: "vm_edit" },
  migrate: { fn: "vm_migrate" },
  move_storage: { fn: "vm_move" },
  startup_change: { fn: "vm_startup_change" },
  mount_dvd: { fn: "mount_dvd" },
  eject_dvd: { fn: "eject_dvd" },
  enable_ha: { fn: "enable_ha" },
  disable_ha: { fn: "disable_ha" },
  export_template: { fn: "vm_export_template" },
  notes_edit: { fn: "notes_edit" },
  snapshot_create: { fn: "snapshot_create" },
  snapshot_remove: { fn: "snapshot_remove" },
  snapshot_restore: { fn: "snapshot_restore" },
  refresh: { fn: "refresh_status" },
};

/** What the Hyper-V agent would refuse, given the VM's current state. */
function agentRefusal(action: string, vm: DemoVm): string | null {
  const s = vm.state;
  switch (action) {
    case "start":
      return ["Off", "Saved", "Paused"].includes(s) ? null : `'${vm.name}' is already running.`;
    case "pause":
    case "shutdown":
    case "restart":
      return s === "Running" ? null : `'${vm.name}' is not running.`;
    case "stop":
      return s === "Running" || s === "Paused" ? null : `'${vm.name}' is not running.`;
    case "delete":
    case "rename":
    case "export_template":
      return s === "Off" || (action === "delete" && s === "Saved")
        ? null
        : `'${vm.name}' must be turned off first.`;
    default:
      return null;
  }
}

function vmOperation(ctx: Ctx, action: string, params: Record<string, unknown>) {
  const { state, now } = ctx;
  const def = VM_ACTIONS[action];
  const vm = vmById(state, ctx.params.id);
  requireOnline(state.hosts.find((h) => h.id === vm.hostId), now);
  if (!vm.vmUuid) {
    throw conflict("VM_NOT_READY", "This VM has not been reported by its host agent yet");
  }
  const readOnly = action === "refresh";
  if (!readOnly && vm.lock) throw vmLocked(vm);
  if (action === "migrate" && !vm.highlyAvailable) {
    throw conflict(
      "HA_REQUIRED",
      `'${vm.name}' does not have High Availability enabled - enable HA before migrating it to another cluster node`,
    );
  }
  if (action === "move_storage") {
    const dest = typeof params.destination_storage === "string" ? params.destination_storage : "";
    if (!dest) throw new ApiError(400, "VALIDATION_ERROR", "destination_storage is required");
    const host = hostById(state, vm.hostId);
    const error = placementError(!!host.clusterId, hostDefaultVmPath(state, host), dest);
    if (error) throw new ApiError(400, "STORAGE_NOT_ALLOWED", error);
  }

  const refusal = agentRefusal(action, vm);
  const task = queueTask(state, now, {
    kind: def.fn,
    targetType: "vm",
    targetId: vm.id,
    targetName: vm.name,
    hostId: vm.hostId,
    requestedBy: DEMO_USER_EMAIL,
    params: { vm_id: vm.id, action, ...params },
    outcome: refusal ? "failed" : undefined,
    error: refusal ?? undefined,
    meta: { from: vm.state },
  });
  if (!readOnly) lockVm(vm, task);
  if (!refusal && def.transitional) vm.state = def.transitional;
  return { task: taskOut(task, now) };
}

route("POST", "/vms/:id/actions/:action", (ctx) => {
  const { action } = ctx.params;
  if (!VM_ACTIONS[action] || action === "delete") {
    throw new ApiError(404, "UNKNOWN_ACTION", `Unknown VM action '${action}'`);
  }
  const params = body<{ params: Record<string, unknown> }>(ctx).params ?? {};
  return vmOperation(ctx, action, params);
});

route("DELETE", "/vms/:id", (ctx) =>
  vmOperation(ctx, "delete", { remove_files: ctx.query.remove_files === "true" }),
);

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

route("POST", "/vms", (ctx) => {
  const { state, now } = ctx;
  const b = body<VmCreateBody>(ctx) as VmCreateBody;
  const host = hostById(state, b.hostId);
  requireOnline(host, now);
  if (!NAME_RE.test(b.name ?? "")) throw validation("name: letters, digits, - and _ only");
  if (!Array.isArray(b.disks) || !b.disks.length) throw validation("at least one disk is required");
  if (b.memoryDynamic) {
    const min = b.memoryMinMb ?? 512;
    const max = b.memoryMaxMb ?? b.memoryMb * 4;
    if (!(min <= b.memoryMb && b.memoryMb <= max)) {
      throw validation("dynamic memory needs min ≤ startup ≤ max");
    }
  }
  const placement = placementError(!!host.clusterId, hostDefaultVmPath(state, host), b.destinationStorage);
  if (placement) throw new ApiError(400, "STORAGE_NOT_ALLOWED", placement);

  const vm = placeholderVm({
    name: b.name,
    hostId: host.id,
    firmware: b.firmware,
    vcpu: b.cpuCount,
    memoryMb: b.memoryMb,
    dynamic: b.memoryDynamic,
    minMb: b.memoryMinMb,
    maxMb: b.memoryMaxMb,
    linux: b.os === "linux",
    nested: b.nestedVirtualization,
    ha: !!host.clusterId && b.haEnabled,
    notes: b.notes?.trim() || null,
    now,
  });
  state.vms.push(vm);
  const task = queueTask(state, now, {
    kind: "vm_create",
    targetType: "vm",
    targetId: vm.id,
    targetName: vm.name,
    hostId: host.id,
    requestedBy: DEMO_USER_EMAIL,
    params: {
      vm_id: vm.id,
      name: b.name,
      os: b.os,
      generation: b.firmware === "UEFI" ? 2 : 1,
      cpu_count: b.cpuCount,
      memory_mb: b.memoryMb,
      memory_dynamic: b.memoryDynamic,
      memory_min_mb: b.memoryMinMb,
      memory_max_mb: b.memoryMaxMb,
      destination_storage: b.destinationStorage,
      vlan_id: b.vlanId ?? 0,
      switch_name: b.switchName,
      nested_virtualization: b.nestedVirtualization,
      ha_enabled: b.haEnabled,
      dvd: b.dvd,
      start_now: b.startNow,
      disks: b.disks.map((d) => ({ name: d.name, type: d.type, size_gb: d.sizeGb })),
    },
    meta: { body: b },
  });
  lockVm(vm, task);
  return { vm: vmOut(state, vm, now), task: taskOut(task, now) };
});

route("POST", "/vms/clone", (ctx) => {
  const { state, now } = ctx;
  const b = body<VmCloneBody>(ctx) as VmCloneBody;
  const host = hostById(state, b.hostId);
  requireOnline(host, now);
  if (!NAME_RE.test(b.name ?? "")) throw validation("name: letters, digits, - and _ only");

  let source: DemoVm | undefined;
  let cpu = b.cpuCount;
  let memMb = b.memoryMb;
  let linux = false;
  if (b.source === "vm") {
    source = vmById(state, b.sourceVmId ?? "");
    if (source.hostId !== host.id) {
      throw conflict("CROSS_HOST_CLONE", "A VM can only be cloned onto its own host");
    }
    if (source.state !== "Off") {
      throw conflict("SOURCE_NOT_OFF", `'${source.name}' must be powered off to clone it`);
    }
    if (!source.vmUuid) throw conflict("VM_NOT_READY", `'${source.name}' has not been reported yet`);
    if (source.lock) throw vmLocked(source);
    cpu ??= source.vcpu;
    memMb ??= Math.round(source.memory.assignedBytes / 1024 ** 2);
    linux = source.secureBootTemplate === "Linux";
  } else {
    const tpl = getOr404(state.templates, b.templateId ?? "", "Template");
    const tplHost = hostById(state, tpl.hostId);
    const sameCluster = !!tplHost.clusterId && tplHost.clusterId === host.clusterId;
    if (tpl.hostId !== host.id && !sameCluster) {
      throw conflict("TEMPLATE_UNREACHABLE", `Template '${tpl.name}' is not reachable from '${host.name}'`);
    }
    cpu ??= tpl.cpuCount;
    memMb ??= tpl.memoryMb;
    linux = /linux|ubuntu|red hat/i.test(tpl.guestOs ?? "");
  }
  const placement = placementError(!!host.clusterId, hostDefaultVmPath(state, host), b.destinationStorage);
  if (placement) throw new ApiError(400, "STORAGE_NOT_ALLOWED", placement);

  const vm = placeholderVm({
    name: b.name,
    hostId: host.id,
    firmware: source?.firmware ?? "UEFI",
    vcpu: cpu ?? 2,
    memoryMb: memMb ?? 4096,
    dynamic: false,
    linux,
    nested: b.nestedVirtualization,
    ha: !!host.clusterId && b.haEnabled,
    notes: b.notes?.trim() || null,
    now,
  });
  state.vms.push(vm);
  const task = queueTask(state, now, {
    kind: "vm_clone",
    targetType: "vm",
    targetId: vm.id,
    targetName: vm.name,
    hostId: host.id,
    requestedBy: DEMO_USER_EMAIL,
    params: {
      vm_id: vm.id,
      name: b.name,
      target_host: host.shortId,
      source: b.source,
      source_vm_id: b.sourceVmId,
      template_id: b.templateId,
      cpu_count: cpu,
      memory_mb: memMb,
      destination_storage: b.destinationStorage,
      vlan_id: b.vlanId ?? 0,
      expand_disks: b.expandDisks,
      start_now: b.startNow,
    },
    meta: { body: b },
  });
  lockVm(vm, task);
  if (source) lockVm(source, task);
  return { vm: vmOut(state, vm, now), task: taskOut(task, now) };
});

// ---- VM locks (admin) ----------------------------------------------------------------

route("GET", "/vm-locks", ({ state, now }): VmLockEntry[] =>
  state.vms
    .filter((v) => v.lock)
    .map((v) => {
      const task = state.tasks.find((t) => t.id === v.lock!.taskId);
      const end = task ? task.createdAt + task.queueMs + task.runMs : now;
      return {
        ...v.lock!,
        vmId: v.id,
        vmName: v.name,
        ttl: Math.max(0, Math.round((end + 60_000 - now) / 1000)),
        taskStatus: task ? taskStatus(task, now) : null,
      };
    }),
);

route("DELETE", "/vm-locks", ({ state }) => {
  let released = 0;
  for (const v of state.vms) {
    if (v.lock) {
      v.lock = null;
      released++;
    }
  }
  return { released };
});

route("DELETE", "/vm-locks/:vmId", ({ state, params }) => {
  const vm = state.vms.find((v) => v.id === params.vmId);
  const released = !!vm?.lock;
  if (vm) vm.lock = null;
  return { released };
});

// ---- tasks ------------------------------------------------------------------------------

route("GET", "/tasks", ({ state, query, now }) => {
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  return state.tasks
    .filter((t) => !query.vmId || t.targetId === query.vmId)
    .filter((t) => !query.hostId || t.hostId === query.hostId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => taskOut(t, now))
    .filter((t) => !query.status || t.status === query.status)
    .slice(0, limit);
});

route("GET", "/tasks/:id", ({ state, params, now }) =>
  taskDetailOut(getOr404(state.tasks, params.id, "Task"), now),
);

// ---- images -------------------------------------------------------------------------------

route("GET", "/templates", ({ state }) => [...state.templates].sort(byName));
route("GET", "/isos", ({ state }) => [...state.isos].sort(byName));

// ---- agent builds (admin) --------------------------------------------------------------

route("GET", "/agent-binaries", ({ state, query }) =>
  state.agentBinaries
    .filter((b) => !query.hypervisor || b.hypervisor === query.hypervisor)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
);

route("GET", "/agent-binaries/storage", () => ({
  backend: "local",
  location: "/var/lib/ovc/agent-binaries",
  downloadUrlTtlSeconds: 900,
  downloadsEnabled: true,
}));

function activate(state: DemoState, binary: AgentBinary) {
  for (const b of state.agentBinaries) {
    if (b.hypervisor === binary.hypervisor) b.isActive = b.id === binary.id;
  }
}

route("POST", "/agent-binaries", ({ state, body: raw, now }) => {
  if (!(raw instanceof FormData)) throw validation("multipart form data expected");
  const file = raw.get("file");
  const version = String(raw.get("version") ?? "").trim();
  const hypervisor = String(raw.get("hypervisor") ?? "hyperv") as AgentBinary["hypervisor"];
  if (!(file instanceof File) || !version) throw validation("file and version are required");
  if (file.size > 128 * 1024 ** 2) {
    throw new ApiError(413, "TOO_LARGE", "Agent binary exceeds the 128 MiB limit");
  }
  if (state.agentBinaries.some((b) => b.version === version && b.hypervisor === hypervisor)) {
    throw conflict("DUPLICATE", `Agent binary ${version} (${hypervisor}) already exists`);
  }
  const binary: AgentBinary = {
    id: uuid(),
    version,
    hypervisor,
    filename: file.name,
    sizeBytes: file.size,
    checksumSha256: randomHex(64),
    contentType: file.type || "application/octet-stream",
    storageBackend: "local",
    notes: String(raw.get("notes") ?? "").trim() || null,
    isActive: false,
    uploadedBy: DEMO_USER_EMAIL,
    createdAt: new Date(now).toISOString(),
  };
  state.agentBinaries.push(binary);
  if (raw.get("makeActive") === "true") activate(state, binary);
  return binary;
});

route("PATCH", "/agent-binaries/:id", (ctx) => {
  const binary = getOr404(ctx.state.agentBinaries, ctx.params.id, "Agent binary");
  const b = body<{ notes: string; isActive: boolean }>(ctx);
  if (typeof b.notes === "string") binary.notes = b.notes.trim() || null;
  if (b.isActive === true) activate(ctx.state, binary);
  if (b.isActive === false) binary.isActive = false;
  return binary;
});

route("DELETE", "/agent-binaries/:id", ({ state, params }) => {
  const binary = getOr404(state.agentBinaries, params.id, "Agent binary");
  if (binary.isActive) {
    throw conflict("ACTIVE_BINARY", `${binary.version} is the active build - activate another one first`);
  }
  state.agentBinaries = state.agentBinaries.filter((b) => b.id !== binary.id);
});

route("POST", "/agent-binaries/:id/rollout", (ctx) => {
  const { state, now } = ctx;
  const binary = getOr404(state.agentBinaries, ctx.params.id, "Agent binary");
  const hostIds = body<{ hostIds: string[] | null }>(ctx).hostIds;
  const candidates = state.hosts.filter(
    (h) => h.hypervisor === binary.hypervisor && (!hostIds || hostIds.includes(h.id)),
  );
  const tasks = [];
  const skipped = [];
  for (const h of candidates) {
    const reason = !hostOnline(h, now)
      ? "agent offline"
      : h.agentVersion === binary.version
        ? `already on ${binary.version}`
        : runningTask(state, now, h.id, new Set(["host_update_agent"]))
          ? "upgrade already in progress"
          : null;
    if (reason) {
      if (hostIds || reason !== `already on ${binary.version}`) {
        skipped.push({ hostId: h.id, hostName: h.name, reason });
      }
      continue;
    }
    tasks.push(taskOut(queueAgentUpgrade(state, now, h, binary), now));
  }
  return { tasks, skipped };
});
