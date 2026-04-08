import { useMemo } from 'react'
import { useApi } from '../../lib/api'

export type AccountMonthlyStat = {
  month: string
  newAccounts: number
  loginCount: number
}

export type AccountStatsResponse = {
  summary: {
    totalAccounts: number
    totalLogins: number
    activeLast30Days: number
  }
  monthly: AccountMonthlyStat[]
  topLoginUsers: Array<{
    id: string
    username: string
    role: 'user' | 'admin' | string
    loginCount: number
    lastLoginAt?: string | null
  }>
}

export type AdminPostRow = {
  id: string
  title: string
  fullTitle?: string
  thumbnailUrl?: string
  mediaType?: 'image' | 'video' | 'text' | string
  authorUsername: string
  createdAt?: string | null
  likesCount: number
  commentsCount: number
  engagementCount: number
  reportCount?: number
  pendingCount?: number
  latestReason?: string
  lastReportedAt?: string | null
  statuses?: string[]
  moderationStatus?: string
  moderationReason?: string
}

export type PaginatedAdminPosts = {
  items: AdminPostRow[]
  page: number
  limit: number
  total: number
  totalPages: number
  filters?: {
    startDate?: string
    endDate?: string
    sort?: 'engagement_desc' | 'engagement_asc' | string
    status?: string
  }
}

export type AdminViolationsResponse = {
  summary: {
    violatingAccounts: number
    violatingPosts: number
  }
  accounts: Array<{
    id: string
    username: string
    email: string
    role: string
    moderationStatus: string
    moderationReason: string
    loginCount: number
    lastLoginAt?: string | null
    createdAt?: string | null
    updatedAt?: string | null
  }>
  posts: Array<{
    id: string
    title: string
    thumbnailUrl?: string
    mediaType?: string
    authorUsername: string
    moderationStatus: string
    moderationReason: string
    reportCount: number
    likesCount: number
    commentsCount: number
    engagementCount: number
    createdAt?: string | null
    updatedAt?: string | null
  }>
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const raw = query.toString()
  return raw ? `?${raw}` : ''
}

export function useAdminApi() {
  const api = useApi()

  return useMemo(
    () => ({
      getAccountStats: async (months = 12) => {
        const res = await api.get(`/admin/accounts/stats${buildQuery({ months })}`)
        return res?.data as AccountStatsResponse
      },
      getPosts: async (params: {
        page?: number
        limit?: number
        startDate?: string
        endDate?: string
        sort?: 'engagement_desc' | 'engagement_asc'
      }) => {
        const res = await api.get(`/admin/posts${buildQuery(params || {})}`)
        return res?.data as PaginatedAdminPosts
      },
      getReportedPosts: async (params: {
        page?: number
        limit?: number
        startDate?: string
        endDate?: string
        status?: 'all' | 'pending' | 'reviewed' | 'accepted' | 'rejected'
      }) => {
        const res = await api.get(`/admin/reports/posts${buildQuery(params || {})}`)
        return res?.data as PaginatedAdminPosts
      },
      getViolations: async (includeWarning = true) => {
        const res = await api.get(`/admin/violations${buildQuery({ includeWarning })}`)
        return res?.data as AdminViolationsResponse
      },
      updatePostModeration: async (postId: string, payload: { status: 'normal' | 'reported' | 'violating'; reason?: string }) => {
        const res = await api.patch(`/admin/posts/${encodeURIComponent(postId)}/moderation`, payload)
        return res?.data
      },
      updateUserModeration: async (userId: string, payload: { status: 'normal' | 'warning' | 'violating'; reason?: string }) => {
        const res = await api.patch(`/admin/users/${encodeURIComponent(userId)}/moderation`, payload)
        return res?.data
      },
    }),
    [api],
  )
}
