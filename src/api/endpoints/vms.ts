import { request } from "../client";
import type {
  Task,
  Vm,
  VmCloneBody,
  VmCreateBody,
  VmLockEntry,
  VmManagementAction,
  VmMetricSample,
  VmPowerAction,
  VmState,
} from "../types";

export type VmListParams = {
  hostId?: string;
  folderId?: string;
  state?: VmState;
};

export const getVms = (params: VmListParams = {}, signal?: AbortSignal) =>
  request<Vm[]>("/vms", { query: params, signal });

export const getVm = (id: string, signal?: AbortSignal) =>
  request<Vm>(`/vms/${id}`, { signal });

/** Quick VM metrics for the last hour, oldest first. `[]` until metering is on. */
export const getVmMetrics = (id: string, signal?: AbortSignal) =>
  request<VmMetricSample[]>(`/vms/${id}/metrics`, { signal });

/** Provision a new VM. Returns the placeholder VM row + the `vm_create` task. */
export const createVm = (body: VmCreateBody) =>
  request<{ vm: Vm; task: Task }>("/vms", { method: "POST", body });

/** Move the VM into a folder, or `null` to remove it from any folder. */
export const moveVm = (id: string, folderId: string | null) =>
  request<Vm>(`/vms/${id}`, { method: "PATCH", body: { folderId } });

export type VmActionParams = Record<string, unknown>;

/**
 * Power/lifecycle/management action. Returns a Task to poll - the work is async
 * via RabbitMQ. `params` are forwarded to the agent as `AgentRequest.params`
 * (wrapped in `{ params }` on the wire).
 */
export const runVmAction = (
  id: string,
  action: VmPowerAction | VmManagementAction,
  params?: VmActionParams,
) => {
  if (action === "delete") {
    // `removeFiles` also wipes the VM's folder/files from disk on the host.
    const removeFiles = params?.removeFiles === true;
    return request<{ task: Task }>(`/vms/${id}`, {
      method: "DELETE",
      query: removeFiles ? { remove_files: true } : undefined,
    });
  }
  return request<{ task: Task }>(`/vms/${id}/actions/${action}`, {
    method: "POST",
    body: params ? { params } : undefined,
  });
};

/**
 * Remove the VM record from the database only - no agent request. For a VM left
 * `Unknown` on a host that is gone for good. Backend returns 409 `HOST_ONLINE`
 * if the host agent is still reporting the VM.
 */
export const removeVmFromInventory = (id: string) =>
  request<{ removed: boolean }>(`/vms/${id}/from-inventory`, {
    method: "DELETE",
  });

/** Every VM currently locked by a running operation (admin only). */
export const getVmLocks = (signal?: AbortSignal) =>
  request<VmLockEntry[]>("/vm-locks", { signal });

/** Force-release a stuck VM lock (admin only - backend 403s otherwise). */
export const releaseVmLock = (id: string) =>
  request<{ released: boolean }>(`/vm-locks/${id}`, { method: "DELETE" });

/** Force-release every VM lock (admin only). */
export const releaseAllVmLocks = () =>
  request<{ released: number }>("/vm-locks", { method: "DELETE" });

/**
 * Provision a new VM by cloning an off VM or deploying an exported template.
 * Returns the placeholder VM row + the `vm_clone` task to poll.
 */
export const cloneVm = (body: VmCloneBody) =>
  request<{ vm: Vm; task: Task }>("/vms/clone", { method: "POST", body });
