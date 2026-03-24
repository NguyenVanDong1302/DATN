export type NotificationType = 'like' | 'comment' | 'reply' | 'comment_like'

export type NotificationItem = {
  _id: string
  ownerId: string
  type: NotificationType
  postId: string
  commentId?: string | null
  actors: string[]
  actorUsernames: string[]
  totalEvents: number
  actorsCount: number
  latestContentPreview?: string
  isRead: boolean
  readAt?: string | null
  lastEventAt?: string
  createdAt?: string
  updatedAt?: string
}
