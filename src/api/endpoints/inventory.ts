import { request } from '../client'
import type { Iso, Template } from '../types'

/** Flat cross-host lists. No dedicated screen in milestone 1. */
export const getTemplates = (signal?: AbortSignal) =>
  request<Template[]>('/templates', { signal })

export const getIsos = (signal?: AbortSignal) =>
  request<Iso[]>('/isos', { signal })
