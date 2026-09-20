import { request } from '../client'
import type { Folder } from '../types'

export const getFolders = (
  params: { hostId?: string; clusterId?: string } = {},
  signal?: AbortSignal,
) => request<Folder[]>('/folders', { query: params, signal })

/** Exactly one of clusterId / hostId. */
export const createFolder = (body: {
  name: string
  clusterId?: string
  hostId?: string
}) => request<Folder>('/folders', { method: 'POST', body })

export const renameFolder = (id: string, name: string) =>
  request<Folder>(`/folders/${id}`, { method: 'PATCH', body: { name } })

export const deleteFolder = (id: string) =>
  request<void>(`/folders/${id}`, { method: 'DELETE' })
