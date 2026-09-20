import { request } from '../client'
import type { Cluster } from '../types'

export const getClusters = (signal?: AbortSignal) =>
  request<Cluster[]>('/clusters', { signal })

export const getCluster = (id: string, signal?: AbortSignal) =>
  request<Cluster>(`/clusters/${id}`, { signal })

export const createCluster = (body: { name: string }) =>
  request<Cluster>('/clusters', { method: 'POST', body })

export const updateCluster = (id: string, body: { name: string }) =>
  request<Cluster>(`/clusters/${id}`, { method: 'PATCH', body })

/** Only an empty cluster (no member hosts) can be deleted. */
export const deleteCluster = (id: string) =>
  request<void>(`/clusters/${id}`, { method: 'DELETE' })
