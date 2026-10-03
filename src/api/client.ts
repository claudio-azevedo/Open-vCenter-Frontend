import axios from 'redaxios'
import type { ApiErrorBody } from './types'

// The browser talks to the frontend's own server, which proxies to ovc-backend
// and injects the OIDC bearer token (see routes/frontend-api/api/$.ts).
// Dev/split-origin: set VITE_API_URL to the absolute proxy origin, e.g.
// http://localhost:3000/frontend-api/api
export const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '/frontend-api/api'

// ---- Error shape --------------------------------------------------------

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// ---- Request ----------------------------------------------------------

export type QueryValue = string | number | boolean | undefined | null
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, QueryValue>
  body?: unknown
  signal?: AbortSignal
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }

  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null) params.set(k, String(v))
  }
  const qs = params.toString()

  try {
    const res = await axios(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, {
      method: opts.method ?? 'GET',
      data: opts.body,
      headers,
      withCredentials: true,
    })
    return res.data as T
  } catch (err: unknown) {
    throw normalizeError(err)
  }
}

/**
 * Binary GET (images): same proxy, credentials and error normalization as
 * `request()`, but returns the body as a Blob plus the response headers. An
 * error body arrives as a Blob too, so failures carry only the HTTP status
 * (`code` = `HTTP_ERROR`).
 */
export async function requestBlob(
  path: string,
): Promise<{ blob: Blob; headers: Headers }> {
  try {
    const res = await axios(`${BASE_URL}${path}`, {
      method: 'GET',
      responseType: 'blob',
      withCredentials: true,
    })
    return { blob: res.data as Blob, headers: res.headers }
  } catch (err: unknown) {
    throw normalizeError(err)
  }
}

function normalizeError(err: unknown): ApiError {
  const e = err as {
    status?: number
    data?: ApiErrorBody
    message?: string
  }
  const status = e.status ?? 0
  const body = e.data?.error
  if (body) {
    return new ApiError(status, body.code, body.message, body.details)
  }
  if (status === 0) {
    return new ApiError(0, 'NETWORK', 'Backend unreachable')
  }
  return new ApiError(status, 'HTTP_ERROR', e.message ?? `HTTP ${status}`)
}
