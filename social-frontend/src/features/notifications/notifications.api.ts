import { useMemo } from 'react'
import { useApi } from '../../lib/api'
import type { NotificationItem } from './notifications.types'

export function useNotificationsApi() {
  const api = useApi()

  return useMemo(() => ({
    async list(onlyUnread = false): Promise<{ items: NotificationItem[]; unreadCount: number }> {
      const res = await api.get(`/notifications${onlyUnread ? '?onlyUnread=true' : ''}`)
      return res || { items: [], unreadCount: 0 }
    },
    async read(id: string) {
      return await api.patch(`/notifications/${id}/read`, {})
    },
    async unread(id: string) {
      return await api.patch(`/notifications/${id}/unread`, {})
    },
    async readAll() {
      return await api.patch('/notifications/read-all', {})
    },
  }), [api])
}