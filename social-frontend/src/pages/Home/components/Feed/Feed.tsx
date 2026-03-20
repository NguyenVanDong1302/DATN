import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../../../lib/api'
import { useModal } from '../../../../components/Modal'
import { useToast } from '../../../../components/Toast'
import GlobalPostCard from '../../../../components/PostCard'
import type { Post } from '../../../../types'
import styles from './Feed.module.css'

function CommentForm({ postId, onDone }: { postId: string; onDone: () => void }) {
  const api = useApi()
  const toast = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    const content = text.trim()
    if (!content || sending) return

    setSending(true)
    try {
      await api.post(`/posts/${postId}/comments`, { content })
      setText('')
      toast.push('Đã thêm bình luận')
      onDone()
    } catch (error: any) {
      toast.push(error?.message || 'Không thể gửi bình luận')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.commentBox}>
      <div className={styles.commentTitle}>Bình luận</div>
      <textarea
        className={styles.commentInput}
        placeholder="Viết bình luận..."
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
      />
      <div className={styles.commentActions}>
        <button className="btn" type="button" onClick={submit} disabled={sending || !text.trim()}>
          {sending ? 'Đang gửi...' : 'Gửi'}
        </button>
      </div>
    </div>
  )
}

export default function Feed() {
  const api = useApi()
  const nav = useNavigate()
  const modal = useModal()
  const toast = useToast()

  const [items, setItems] = useState<Post[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

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
  }, [loadPosts, refreshKey])

  const refresh = () => {
    setPage(1)
    setRefreshKey((value) => value + 1)
  }

  const toggleLike = async (post: Post) => {
    try {
      if (post.likedByMe) await api.del(`/posts/${post._id}/like`)
      else await api.post(`/posts/${post._id}/like`, {})
      await loadPosts()
    } catch (error: any) {
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
            modal.open(<CommentForm postId={post._id} onDone={loadPosts} />)
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
