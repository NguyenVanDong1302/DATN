export type PostVisibility = 'public' | 'friends' | 'private'

export type CreatePostPayload = {
  content?: string
  visibility?: PostVisibility
  isAnonymous?: boolean
  allowComments?: boolean
  hideLikeCount?: boolean
  location?: string
  collaborators?: string[]
  tags?: string[]
  altText?: string
  files?: File[]
}

export type CreatePostResponse = {
  ok: boolean
  message?: string
  data: any
}
