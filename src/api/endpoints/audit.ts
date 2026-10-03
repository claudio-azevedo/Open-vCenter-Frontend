import { request } from '../client'
import type { AuditEventPage, AuditOutcome, AuditTargetType } from '../types'

export interface AuditEventParams {
  /** partial match on target name or actor */
  q?: string
  targetType?: AuditTargetType
  targetId?: string
  /** the host and everything that was on it */
  hostId?: string
  /** the cluster and everything that was in it */
  clusterId?: string
  outcome?: AuditOutcome
  limit?: number
}

/** The audit log, newest first (admin only). */
export const getAuditEvents = (
  params: AuditEventParams & { cursor?: string },
  signal?: AbortSignal,
) => request<AuditEventPage>('/audit-events', { query: { ...params }, signal })
