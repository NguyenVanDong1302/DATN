export type StoryItem = {
  id: string
  authorId: string
  authorUsername: string
  mediaType: 'image' | 'video'
  mediaUrl: string
  thumbnailUrl?: string
  caption?: string
  likesCount: number
  likedByMe: boolean
  createdAt: string
  expiresAt: string
}

export type StoryGroup = {
  id: string
  authorId: string
  username: string
  avatarUrl?: string
  hasUnseen?: boolean
  latestCreatedAt?: string
  stories: StoryItem[]
}
