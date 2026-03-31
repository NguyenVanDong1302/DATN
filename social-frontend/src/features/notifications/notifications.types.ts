export type NotificationItem = {
  _id: string
  recipientId: string
  type: 'like' | 'comment' | 'follow' | string
  targetType: 'post' | 'user' | string
  targetId: string
  postId: string
  actors?: string[]
  actorUsernames?: string[]
  totalEvents?: number
  previewText?: string
  isRead: boolean
  readAt?: string | null
  lastEventAt?: string
  createdAt?: string
  updatedAt?: string
}
