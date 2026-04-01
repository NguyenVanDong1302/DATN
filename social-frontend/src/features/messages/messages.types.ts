export type MessageUser = {
  id: string
  username: string
  email?: string
  bio?: string
  avatarUrl?: string
  createdAt?: string | null
}

export type ConversationItem = {
  id: string
  type: 'direct'
  peer: MessageUser
  lastMessageText: string
  lastMessageAt?: string | null
  unreadCount: number
}

export type StoryReply = {
  storyId: string
  ownerUsername: string
  mediaType: 'image' | 'video'
  mediaUrl: string
  thumbnailUrl?: string
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  senderUsername: string
  receiverId: string
  receiverUsername: string
  type: 'text'
  text: string
  storyReply?: StoryReply | null
  status: 'sent' | 'delivered' | 'seen'
  seenAt?: string | null
  createdAt: string
}

export type SearchUsersResponse = {
  recent: MessageUser[]
  following: MessageUser[]
  suggested: MessageUser[]
}
