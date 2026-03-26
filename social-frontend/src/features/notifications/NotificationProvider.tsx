import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNotificationsApi } from './notifications.api'
import type { NotificationItem } from './notifications.types'
import { useSocket } from '../../state/socket'
import { useAppStore } from '../../state/store'

type NotificationCtxValue = {
  items: NotificationItem[]
  unreadCount: number
  loading: boolean
  refresh: (onlyUnread?: boolean) => Promise<void>
  markRead: (id: string) => Promise<void>
  markUnread: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const NotificationCtx = createContext<NotificationCtxValue | null>(null)

function mergeItems(prev: NotificationItem[], incoming: NotificationItem) {
  const next = [incoming, ...prev.filter((item) => item._id !== incoming._id)]
  next.sort(
    (a, b) =>
      new Date(b.lastEventAt || b.createdAt || 0).getTime() -
      new Date(a.lastEventAt || a.createdAt || 0).getTime(),
  )
  return next
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const api = useNotificationsApi()
  const { socket } = useSocket()
  const { state } = useAppStore()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(
    async (onlyUnread = false) => {
      setLoading(true)
      try {
        const data = await api.list(onlyUnread)
        setItems(Array.isArray(data.items) ? data.items : [])
        setUnreadCount(Number(data.unreadCount) || 0)
      } finally {
        setLoading(false)
      }
    },
    [api],
  )

  useEffect(() => {
    if (!state.username) return
    refresh().catch(() => undefined)
  }, [refresh, state.username])

  useEffect(() => {
    if (!socket) return

    const onNew = (payload: NotificationItem) => {
      if (!payload?._id) return
      setItems((prev) => {
        const existed = prev.find((item) => item._id === payload._id)
        setUnreadCount((count) => {
          if (!payload.isRead && (!existed || existed.isRead)) return count + 1
          if (payload.isRead && existed && !existed.isRead) return Math.max(0, count - 1)
          return count
        })
        return mergeItems(prev, payload)
      })
    }

    const onCount = (payload: { unreadCount?: number }) => {
      setUnreadCount(Number(payload?.unreadCount) || 0)
    }

    socket.on('notification:new', onNew)
    socket.on('notification:count', onCount)

    return () => {
      socket.off('notification:new', onNew)
      socket.off('notification:count', onCount)
    }
  }, [socket])

  const markRead = useCallback(
    async (id: string) => {
      const item = await api.read(id)
      setItems((prev) => prev.map((entry) => (entry._id === id ? item : entry)))
      setUnreadCount((count) => Math.max(0, count - 1))
    },
    [api],
  )

  const markUnread = useCallback(
    async (id: string) => {
      const item = await api.unread(id)
      setItems((prev) => prev.map((entry) => (entry._id === id ? item : entry)))
      setUnreadCount((count) => count + 1)
    },
    [api],
  )

  const markAllRead = useCallback(async () => {
    await api.readAll()
    const now = new Date().toISOString()
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true, readAt: now })))
    setUnreadCount(0)
  }, [api])

  const value = useMemo(
    () => ({ items, unreadCount, loading, refresh, markRead, markUnread, markAllRead }),
    [items, unreadCount, loading, refresh, markRead, markUnread, markAllRead],
  )

  return <NotificationCtx.Provider value={value}>{children}</NotificationCtx.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationCtx)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
