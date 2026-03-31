import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useMessagesApi } from './messages.api'
import { useSocket } from '../../state/socket'
import { useAppStore } from '../../state/store'

type MessageIndicatorContextValue = {
  unreadConversations: number
  unreadMessages: number
  refresh: () => Promise<void>
}

const MessageIndicatorContext = createContext<MessageIndicatorContextValue | null>(null)

export function MessageIndicatorProvider({ children }: { children: React.ReactNode }) {
  const api = useMessagesApi()
  const { socket } = useSocket()
  const { state } = useAppStore()
  const [unreadConversations, setUnreadConversations] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const refresh = useCallback(async () => {
    if (!state.username) {
      setUnreadConversations(0)
      setUnreadMessages(0)
      return
    }
    const data = await api.unreadSummary()
    setUnreadMessages(Number(data.totalUnreadMessages) || 0)
    setUnreadConversations(Number(data.totalUnreadConversations) || 0)
  }, [api, state.username])

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [refresh])

  useEffect(() => {
    if (!socket) return
    const onRefresh = () => { refresh().catch(() => undefined) }
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

  const value = useMemo(() => ({ unreadConversations, unreadMessages, refresh }), [unreadConversations, unreadMessages, refresh])
  return <MessageIndicatorContext.Provider value={value}>{children}</MessageIndicatorContext.Provider>
}

export function useMessageIndicator() {
  const ctx = useContext(MessageIndicatorContext)
  if (!ctx) throw new Error('useMessageIndicator must be used within MessageIndicatorProvider')
  return ctx
}
