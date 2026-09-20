import { request } from '../client'
import type { Vlan } from '../types'

export type VlanListParams = { hostId?: string; clusterId?: string }

export const getVlans = (params: VlanListParams = {}, signal?: AbortSignal) =>
  request<Vlan[]>('/vlans', { query: params, signal })

/** Exactly one of clusterId / hostId. */
export const createVlan = (body: {
  name: string
  vlanId: number
  description?: string
  isDefault?: boolean
  clusterId?: string
  hostId?: string
}) => request<Vlan>('/vlans', { method: 'POST', body })

export const updateVlan = (
  id: string,
  body: { name?: string; description?: string; isDefault?: boolean },
) => request<Vlan>(`/vlans/${id}`, { method: 'PATCH', body })

export const deleteVlan = (id: string) =>
  request<void>(`/vlans/${id}`, { method: 'DELETE' })
