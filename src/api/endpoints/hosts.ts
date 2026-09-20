import { request } from "../client";
import type {
  Host,
  HostAgentConfig,
  HostAgentInstall,
  HostDetail,
  HostMetricSample,
  Iso,
  Task,
  Template,
  Vm,
} from "../types";

export const getHosts = (clusterId?: string, signal?: AbortSignal) =>
  request<Host[]>("/hosts", { query: { clusterId }, signal });

export const getHost = (id: string, signal?: AbortSignal) =>
  request<HostDetail>(`/hosts/${id}`, { signal });

/** Agent onboarding config (admin only). Used by the "Setup Agent" tab. */
export const getHostAgentConfig = (id: string, signal?: AbortSignal) =>
  request<HostAgentConfig>(`/hosts/${id}/agent-config`, { signal });

/** Mint a tokenized install.ps1 URL + paste-ready one-liner (admin only). */
export const getHostAgentInstall = (id: string, signal?: AbortSignal) =>
  request<HostAgentInstall>(`/hosts/${id}/agent-install-url`, { signal });

export const getHostVms = (id: string, signal?: AbortSignal) =>
  request<Vm[]>(`/hosts/${id}/vms`, { signal });

export const getHostMetrics = (id: string, signal?: AbortSignal) =>
  request<HostMetricSample[]>(`/hosts/${id}/metrics`, { signal });

export const getHostTemplates = (id: string, signal?: AbortSignal) =>
  request<Template[]>(`/hosts/${id}/templates`, { signal });

export const getHostIsos = (id: string, signal?: AbortSignal) =>
  request<Iso[]>(`/hosts/${id}/isos`, { signal });

export const createHost = (body: { name: string; clusterId?: string | null }) =>
  request<HostDetail>("/hosts", { method: "POST", body });

/**
 * Patch a host. Any subset of:
 * - `name` - rename the host record
 * - `fqdn` - override the agent-resolved FQDN (normally left to the agent)
 * - `clusterId` - a cluster id to join, or `null` to make it standalone
 */
export const updateHost = (
  id: string,
  body: { name?: string; fqdn?: string; clusterId?: string | null },
) => request<HostDetail>(`/hosts/${id}`, { method: "PATCH", body });

export const deleteHost = (id: string) =>
  request<void>(`/hosts/${id}`, { method: "DELETE" });

/**
 * Queue a `host_update_agent` task. `binaryId` omitted ⇒ the active build for
 * the host's hypervisor.
 */
export const updateHostAgent = (id: string, binaryId?: string) =>
  request<{ task: Task }>(`/hosts/${id}/actions/update-agent`, {
    method: "POST",
    body: { binaryId: binaryId ?? null },
  });
