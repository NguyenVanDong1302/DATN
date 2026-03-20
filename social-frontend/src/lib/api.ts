import { useCallback, useMemo } from 'react'
import { useAppStore } from '../state/store'

const API_BASE = '/api'
export const MEDIA_BASE_URL = (import.meta.env.VITE_MEDIA_BASE_URL || 'http://localhost:4000').replace(/\/$/, '')

export type ApiError = Error & { status?: number; data?: any }

export function resolveMediaUrl(url?: string | null) {
  if (!url) return ''
  const raw = String(url).trim().replace(/\\/g, '/')
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw

  const uploadsIndex = raw.toLowerCase().indexOf('/uploads/')
  if (uploadsIndex >= 0) return `${MEDIA_BASE_URL}${raw.slice(uploadsIndex)}`
  if (raw.toLowerCase().startsWith('uploads/')) return `${MEDIA_BASE_URL}/${raw}`
  return `${MEDIA_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`
}

export function useApi() {
  const { state } = useAppStore()

  const buildHeaders = useCallback(
    (isFormData = false) => {
      const h: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' }
      if (state.username) h['X-Username'] = state.username
      if (state.token) h['Authorization'] = `Bearer ${state.token}`
      return h
    },
    [state.username, state.token],
  )

  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          ...buildHeaders(isFormData),
          ...(init?.headers || {}),
        },
      })

      const text = await res.text()
      let data: any = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = { raw: text }
      }

      if (!res.ok) {
        const err: ApiError = new Error(data?.message || `HTTP ${res.status}`)
        err.status = res.status
        err.data = data
        throw err
      }

      return data
    },
    [buildHeaders],
  )

  return useMemo(
    () => ({
      get: (p: string) => request(p),
      post: (p: string, body?: any) => request(p, { method: 'POST', body: JSON.stringify(body || {}) }),
      del: (p: string) => request(p, { method: 'DELETE' }),
      put: (p: string, body?: any) => request(p, { method: 'PUT', body: JSON.stringify(body || {}) }),
      patch: (p: string, body?: any) => request(p, { method: 'PATCH', body: JSON.stringify(body || {}) }),
      postForm: (p: string, body: FormData) => request(p, { method: 'POST', body }),
    }),
    [request],
  )
}
