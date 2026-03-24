import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../../../lib/api'
import { useModal } from '../../../../components/Modal'
import { useToast } from '../../../../components/Toast'
import GlobalPostCard from '../../../../components/PostCard'
import CommentSheet from '../../../../components/comments/CommentSheet'
import type { Post } from '../../../../types'
import styles from './Feed.module.css'

export default function Feed() {
  const api = useApi()
  const nav = useNavigate()
  const modal = useModal()
  const toast = useToast()

  const [items, setItems] = useState<Post[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get(`/posts?page=${page}&limit=10`)
      const payload = response?.data || {}
      setItems(Array.isArray(payload.items) ? payload.items : [])
      setTotalPages(Math.max(Number(payload.totalPages) || 1, 1))
    } catch (error: any) {
      toast.push(error?.message || 'Không tải được danh sách bài viết')
    } finally {
      setLoading(false)
    }
  }, [api, page, toast])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  const refresh = () => {
    loadPosts()
  }

  const updatePost = (postId: string, patch: Partial<Post>) => {
    setItems((prev) => prev.map((item) => (item._id === postId ? { ...item, ...patch } : item)))
  }

  const toggleLike = async (post: Post) => {
    const previous = { likedByMe: !!post.likedByMe, likesCount: post.likesCount || 0 }
    const nextLiked = !previous.likedByMe
    updatePost(post._id, {
      likedByMe: nextLiked,
      likesCount: Math.max(0, previous.likesCount + (nextLiked ? 1 : -1)),
    })

    try {
      if (post.likedByMe) {
        const res = await api.del(`/posts/${post._id}/like`)
        updatePost(post._id, res?.data || {})
      } else {
        const res = await api.post(`/posts/${post._id}/like`, {})
        updatePost(post._id, res?.data || {})
      }
    } catch (error: any) {
      updatePost(post._id, previous)
      toast.push(error?.message || 'Không thể cập nhật lượt thích')
    }
  }

  return (
    <div className={styles.feed}>
      <div className={styles.topbar}>
        <div>
          <div className={styles.title}>Bài viết mới nhất</div>
          <div className={styles.subtitle}>Hiển thị toàn bộ bài viết theo thời gian gần nhất</div>
        </div>
        <button className="btn" type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {loading && !items.length ? <div className={styles.state}>Đang tải bài viết...</div> : null}
      {!loading && !items.length ? <div className={styles.state}>Chưa có bài viết nào.</div> : null}

      {items.map((post) => (
        <GlobalPostCard
          key={post._id}
          post={post}
          onLike={() => toggleLike(post)}
          onOpenComment={() =>
            modal.open(
              <CommentSheet
                postId={post._id}
                onChanged={(count) => updatePost(post._id, { commentsCount: count })}
              />,
            )
          }
          onOpenDetail={() => nav(`/post/${post._id}`)}
          onOpenAuthor={() => nav(`/profile/${encodeURIComponent(post.authorUsername || post.authorId || 'user')}`)}
        />
      ))}

      {items.length ? (
        <div className={styles.pagination}>
          <button className="btn" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
            Trước
          </button>
          <span className={styles.pageText}>
            Trang {page}/{totalPages}
          </span>
          <button className="btn" type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading}>
            Sau
          </button>
        </div>
      ) : null}
    </div>
  )
}
