export type PostMedia = {
  type?: 'image' | 'video' | string
  url?: string
  mimeType?: string
  thumbnailUrl?: string
  filename?: string
}

export type Post = {
  _id: string
  authorId?: string
  authorUsername?: string
  content?: string
  imageUrl?: string
  visibility?: 'public' | 'friends' | 'private' | string
  likes?: string[]
  likesCount?: number
  likedByMe?: boolean
  commentsCount?: number
  createdAt?: string
  viewsCount?: number
  media?: PostMedia[]
}

export type PostCommentReplyTo = {
  commentId?: string | null
  authorId?: string | null
  authorUsername?: string | null
} | null

export type PostComment = {
  _id: string
  postId?: string
  authorId?: string
  authorUsername?: string
  content: string
  createdAt?: string
  updatedAt?: string
  parentCommentId?: string | null
  replyToCommentId?: string | null
  replyToAuthorId?: string | null
  replyToAuthorUsername?: string | null
  replyTo?: PostCommentReplyTo
  isReply?: boolean
  likesCount?: number
  likedByMe?: boolean
  canDelete?: boolean
}
