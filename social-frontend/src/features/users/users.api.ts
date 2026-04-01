import { useMemo } from 'react'
import { useApi } from '../../lib/api'

export type UserSummary = {
  _id: string
  id: string
  username: string
  email?: string
  fullName?: string
  website?: string
  bio?: string
  gender?: string
  showThreadsBadge?: boolean
  showSuggestedAccountsOnProfile?: boolean
  avatarUrl?: string
  createdAt?: string | null
}

export type UserRelationship = {
  isMe: boolean
  isFollowing: boolean
  isFollowedBy: boolean
}

export type UserProfile = UserSummary & {
  counts: {
    followers: number
    following: number
  }
  relationship: UserRelationship
}

export function useUsersApi() {
  const api = useApi()

  return useMemo(
    () => ({
      getAllUsers: async () => {
        const res = await api.get('/users')
        return (res?.data || []) as UserSummary[]
      },
      getProfile: async (username: string) => {
        const res = await api.get(`/users/${encodeURIComponent(username)}`)
        return res?.data as UserProfile
      },
      getFollowers: async (username: string) => {
        const res = await api.get(`/users/${encodeURIComponent(username)}/followers`)
        return (res?.data || []) as UserSummary[]
      },
      getFollowing: async (username: string) => {
        const res = await api.get(`/users/${encodeURIComponent(username)}/following`)
        return (res?.data || []) as UserSummary[]
      },
      followUser: async (payload: { followingId?: string; username?: string }) => {
        const res = await api.post('/users/follow', payload)
        return res?.data as {
          targetUser: UserSummary
          counts: { followers: number; following: number }
          relationship: UserRelationship
        }
      },

      updateMyProfile: async (payload: {
        fullName?: string
        website?: string
        bio?: string
        gender?: string
        avatarUrl?: string
        showThreadsBadge?: boolean
        showSuggestedAccountsOnProfile?: boolean
      }) => {
        const res = await api.patch('/users/me/profile', payload)
        return res?.data as UserProfile
      },
      unfollowUser: async (payload: { followingId?: string; username?: string }) => {
        const body = JSON.stringify(payload || {})
        const response = await fetch('/api/users/follow', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(localStorage.getItem('x_username') ? { 'X-Username': localStorage.getItem('x_username') || '' } : {}),
            ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}),
          },
          body,
        })

        const text = await response.text()
        let parsed: any = null
        try {
          parsed = text ? JSON.parse(text) : null
        } catch {
          parsed = null
        }
        if (!response.ok) {
          throw new Error(parsed?.message || `HTTP ${response.status}`)
        }
        return parsed?.data as {
          targetUser: UserSummary
          counts: { followers: number; following: number }
          relationship: UserRelationship
        }
      },
    }),
    [api],
  )
}
