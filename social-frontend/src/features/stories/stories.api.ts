import { useMemo } from 'react'
import { useApi } from '../../lib/api'
import type { StoryGroup, StoryItem } from './stories.types'

export function useStoriesApi() {
  const api = useApi()
  return useMemo(() => ({
    async list(): Promise<StoryGroup[]> {
      const res = await api.get('/stories')
      return (res?.data?.items || []) as StoryGroup[]
    },
    async create(media: File, caption = ''): Promise<StoryItem> {
      const form = new FormData()
      form.append('media', media)
      if (caption) form.append('caption', caption)
      const res = await api.postForm('/stories', form)
      return res?.data?.item as StoryItem
    },
    async toggleLike(storyId: string): Promise<{ liked: boolean; likesCount: number }> {
      const res = await api.post(`/stories/${storyId}/like`, {})
      return res?.data || { liked: false, likesCount: 0 }
    },
  }), [api])
}
