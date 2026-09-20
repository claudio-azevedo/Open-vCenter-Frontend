import { request } from '../client'
import type {
  AgentBinary,
  AgentRolloutResult,
  AgentStorageInfo,
} from '../types'

export const getAgentBinaries = (signal?: AbortSignal) =>
  request<AgentBinary[]>('/agent-binaries', { signal })

export const getAgentStorage = (signal?: AbortSignal) =>
  request<AgentStorageInfo>('/agent-binaries/storage', { signal })

export const uploadAgentBinary = (input: {
  file: File
  version: string
  hypervisor?: string
  notes?: string
  makeActive?: boolean
}) => {
  const form = new FormData()
  form.append('file', input.file)
  form.append('version', input.version)
  if (input.hypervisor) form.append('hypervisor', input.hypervisor)
  if (input.notes) form.append('notes', input.notes)
  if (input.makeActive) form.append('makeActive', 'true')
  return request<AgentBinary>('/agent-binaries', {
    method: 'POST',
    body: form,
  })
}

export const updateAgentBinary = (
  id: string,
  body: { notes?: string; isActive?: boolean },
) => request<AgentBinary>(`/agent-binaries/${id}`, { method: 'PATCH', body })

export const deleteAgentBinary = (id: string) =>
  request<void>(`/agent-binaries/${id}`, { method: 'DELETE' })

export const rolloutAgentBinary = (id: string, hostIds?: string[]) =>
  request<AgentRolloutResult>(`/agent-binaries/${id}/rollout`, {
    method: 'POST',
    body: { hostIds: hostIds ?? null },
  })
