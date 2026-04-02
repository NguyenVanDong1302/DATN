import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../../lib/api'
import { useSocket } from '../../state/socket'
import { useAppStore } from '../../state/store'

type MessageIndicatorContextValue = {
  unreadConversations: number
  unreadMessages: number
  refresh: () => Promise<void>
}

const MessageIndicatorContext = createContext<MessageIndicatorContextValue | null>(null)

export function MessageIndicatorProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAppStore()
  const { socket } = useSocket()
  const api = useApi()
  const [unreadConversations, setUnreadConversations] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!state.username) {
      if (mountedRef.current) {
        setUnreadConversations(0)
        setUnreadMessages(0)
      }
      return
    }

    try {
      const res = await api.get('/messages/unread-summary')
      const data = res?.data || res || {}
      if (!mountedRef.current) return
      setUnreadMessages(Number(data.totalUnreadMessages) || 0)
      setUnreadConversations(Number(data.totalUnreadConversations) || 0)
    } catch {
      if (!mountedRef.current) return
      setUnreadMessages(0)
      setUnreadConversations(0)
    }
  }, [api, state.username])

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [refresh])

  useEffect(() => {
    if (!socket) return
    const onRefresh = () => {
      refresh().catch(() => undefined)
    }

    socket.on('inbox:update', onRefresh)
    socket.on('inbox:refresh', onRefresh)
    socket.on('conversation:updated', onRefresh)
    socket.on('message:new', onRefresh)
    socket.on('message:seen', onRefresh)

    return () => {
      socket.off('inbox:update', onRefresh)
      socket.off('inbox:refresh', onRefresh)
      socket.off('conversation:updated', onRefresh)
      socket.off('message:new', onRefresh)
      socket.off('message:seen', onRefresh)
    }
  }, [socket, refresh])

  const value = useMemo(
    () => ({ unreadConversations, unreadMessages, refresh }),
    [unreadConversations, unreadMessages, refresh],
  )

  return <MessageIndicatorContext.Provider value={value}>{children}</MessageIndicatorContext.Provider>
}

export function useMessageIndicator() {
  const ctx = useContext(MessageIndicatorContext)
  if (!ctx) {
    return {
      unreadConversations: 0,
      unreadMessages: 0,
      refresh: async () => undefined,
    }
  }
  return ctx
}
