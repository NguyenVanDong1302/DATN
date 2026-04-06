export type MessageUser = {
  id: string
  username: string
  email?: string
  bio?: string
  avatarUrl?: string
}

export type ConversationItem = {
  id: string
  type: 'direct'
  peer: MessageUser
  lastMessageText: string
  lastMessageAt?: string | null
  unreadCount: number
  nickname?: string
  isBlocked?: boolean
  blockedAt?: string | null
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  senderUsername: string
  receiverId: string
  receiverUsername: string
  type: 'text' | 'image' | 'video'
  text: string
  mediaUrl?: string
  thumbnailUrl?: string
  fileName?: string
  mimeType?: string
  durationSec?: number
  heartCount?: number
  heartedByMe?: boolean
  replyToMessageId?: string
  replyToText?: string
  replyToSenderUsername?: string
  replyToType?: '' | 'text' | 'image' | 'video'
  replyToMediaUrl?: string
  status: 'sent' | 'delivered' | 'seen'
  seenAt?: string | null
  createdAt: string
  optimistic?: boolean
}

export type SearchUsersResponse = {
  following: MessageUser[]
  suggested: MessageUser[]
}

export type ConversationSettings = {
  conversationId: string
  nickname: string
  isBlocked: boolean
  blockedAt?: string | null
  peer: MessageUser | null
}
