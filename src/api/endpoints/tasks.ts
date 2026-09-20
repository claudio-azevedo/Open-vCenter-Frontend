import { request } from '../client'
import type { Task, TaskDetail, TaskStatus } from '../types'

export const getTasks = (
  params: { vmId?: string; hostId?: string; status?: TaskStatus; limit?: number } = {},
  signal?: AbortSignal,
) => request<Task[]>('/tasks', { query: params, signal })

export const getTask = (id: string, signal?: AbortSignal) =>
  request<TaskDetail>(`/tasks/${id}`, { signal })
