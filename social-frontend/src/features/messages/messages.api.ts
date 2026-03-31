import { useApi } from '../../lib/api'
import type { ChatMessage, ConversationItem, SearchUsersResponse } from './messages.types'

export function useMessagesApi() {
  const api = useApi()

  return {
    searchUsers: async (q: string) => {
      const res = await api.get(`/messages/search-users?q=${encodeURIComponent(q)}`)
      return (res?.data || { following: [], suggested: [] }) as SearchUsersResponse
    },
    getConversations: async () => {
      const res = await api.get('/messages/conversations')
      return (res?.data?.items || []) as ConversationItem[]
    },
    getConversation: async (conversationId: string) => {
      const res = await api.get(`/messages/conversations/${conversationId}`)
      return res?.data as ConversationItem
    },
    getMessages: async (conversationId: string) => {
      const res = await api.get(`/messages/conversations/${conversationId}/messages`)
      return (res?.data?.items || []) as ChatMessage[]
    },
    createDirectConversation: async (targetUserId: string) => {
      const res = await api.post('/messages/conversations/direct', { targetUserId })
      return res?.data?.conversation as ConversationItem
    },
    sendMessageHttp: async (conversationId: string, text: string) => {
      const res = await api.post(`/messages/conversations/${conversationId}/messages`, { text })
      return res?.data?.message as ChatMessage
    },
    markRead: async (conversationId: string) => {
      await api.post(`/messages/conversations/${conversationId}/read`, {})
    },
    unreadSummary: async () => {
      const res = await api.get('/messages/unread-summary')
      return res?.data || { totalUnreadMessages: 0, totalUnreadConversations: 0 }
    },
  }
}
