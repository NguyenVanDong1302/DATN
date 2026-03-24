import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../lib/api'
import { useToast } from '../components/Toast'
import PostCard from '../components/PostCard'
import CommentSheet from '../components/comments/CommentSheet'
import { useModal } from '../components/Modal'
import type { Post } from '../types'

export default function PostPage() {
  const { id = '' } = useParams()
  const api = useApi()
  const toast = useToast()
  const modal = useModal()

  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/posts/${id}`)
      setPost(res?.data?.post || res?.data || null)
    } catch (e: any) {
      toast.push(`Load lỗi: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
  }, [id])

  const toggleLike = async () => {
    if (!post) return
    const previous = { likedByMe: !!post.likedByMe, likesCount: post.likesCount || 0 }
    const nextLiked = !previous.likedByMe
    setPost((curr) => curr ? { ...curr, likedByMe: nextLiked, likesCount: Math.max(0, previous.likesCount + (nextLiked ? 1 : -1)) } : curr)

    try {
      const res = post.likedByMe ? await api.del(`/posts/${post._id}/like`) : await api.post(`/posts/${post._id}/like`, {})
      setPost((curr) => curr ? { ...curr, ...(res?.data || {}) } : curr)
    } catch (error: any) {
      setPost((curr) => curr ? { ...curr, ...previous } : curr)
      toast.push(error?.message || 'Không thể cập nhật lượt thích')
    }
  }

  if (loading && !post) return <div className="card">Đang tải bài viết...</div>
  if (!post) return <div className="card">Không tìm thấy bài viết.</div>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <PostCard
        post={post}
        onLike={toggleLike}
        onOpenComment={() => modal.open(<CommentSheet postId={post._id} onChanged={(count) => setPost((curr) => curr ? { ...curr, commentsCount: count } : curr)} />)}
        onOpenDetail={() => undefined}
        onOpenAuthor={() => undefined}
      />
    </div>
  )
}
