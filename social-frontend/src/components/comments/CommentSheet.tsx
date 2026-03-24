import { useCallback, useEffect, useMemo, useState } from 'react'
import styles from './CommentSheet.module.css'
import { useApi } from '../../lib/api'
import { useToast } from '../Toast'
import type { PostComment } from '../../types'

type Props = {
  postId: string
  onChanged?: (count: number) => void
}

function groupComments(items: PostComment[]) {
  const roots = items.filter((item) => !item.parentCommentId)
  const repliesMap = new Map<string, PostComment[]>()

  for (const item of items) {
    if (!item.parentCommentId) continue
    const bucket = repliesMap.get(item.parentCommentId) || []
    bucket.push(item)
    repliesMap.set(item.parentCommentId, bucket)
  }

  return { roots, repliesMap }
}

export default function CommentSheet({ postId, onChanged }: Props) {
  const api = useApi()
  const toast = useToast()
  const [items, setItems] = useState<PostComment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<PostComment | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/posts/${postId}/comments`)
      const next = Array.isArray(res?.data) ? res.data : []
      setItems(next)
      onChanged?.(next.length)
    } catch (error: any) {
      toast.push(error?.message || 'Không tải được bình luận')
    } finally {
      setLoading(false)
    }
  }, [api, onChanged, postId, toast])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    const content = text.trim()
    if (!content || submitting) return
    setSubmitting(true)
    try {
      await api.post(`/posts/${postId}/comments`, {
        content,
        parentCommentId: replyTo?._id || null,
      })
      setText('')
      setReplyTo(null)
      await load()
    } catch (error: any) {
      toast.push(error?.message || 'Không thể gửi bình luận')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleLike = async (comment: PostComment) => {
    try {
      const endpoint = `/posts/${postId}/comments/${comment._id}/like`
      if (comment.likedByMe) await api.del(endpoint)
      else await api.post(endpoint, {})
      await load()
    } catch (error: any) {
      toast.push(error?.message || 'Không thể thích bình luận')
    }
  }

  const remove = async (comment: PostComment) => {
    try {
      await api.del(`/posts/${postId}/comments/${comment._id}`)
      await load()
    } catch (error: any) {
      toast.push(error?.message || 'Không thể xóa bình luận')
    }
  }

  const { roots, repliesMap } = useMemo(() => groupComments(items), [items])

  const renderItem = (comment: PostComment, nested = false) => (
    <div key={comment._id} className={`${styles.item} ${nested ? styles.reply : ''}`}>
      <div className={styles.row}>
        <span className={styles.author}>{comment.authorUsername || 'user'}</span>
        <span className={styles.time}>{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ''}</span>
      </div>
      <div className={styles.content}>{comment.content}</div>
      <div className={styles.actions}>
        <button className={styles.actionBtn} type="button" onClick={() => toggleLike(comment)}>
          {comment.likedByMe ? '♥' : '♡'} {comment.likesCount || 0}
        </button>
        {!nested ? (
          <button className={styles.actionBtn} type="button" onClick={() => setReplyTo(comment)}>
            Trả lời
          </button>
        ) : null}
        <button className={styles.actionBtn} type="button" onClick={() => remove(comment)}>
          Xóa
        </button>
      </div>
      {(repliesMap.get(comment._id) || []).map((reply) => renderItem(reply, true))}
    </div>
  )

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.title}>Bình luận</div>
        <button className="btn" type="button" onClick={load} disabled={loading}>Làm mới</button>
      </div>

      <div className={styles.list}>
        {loading ? <div className={styles.empty}>Đang tải bình luận...</div> : null}
        {!loading && !items.length ? <div className={styles.empty}>Chưa có bình luận nào.</div> : null}
        {roots.map((comment) => renderItem(comment))}
      </div>

      <div className={styles.form}>
        {replyTo ? (
          <div className={styles.replyHint}>
            Đang trả lời <strong>@{replyTo.authorUsername}</strong>
            <button className={styles.actionBtn} type="button" onClick={() => setReplyTo(null)} style={{ marginLeft: 8 }}>
              Hủy
            </button>
          </div>
        ) : null}
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={replyTo ? 'Viết câu trả lời...' : 'Viết bình luận...'}
        />
        <div className={styles.formActions}>
          <div className={styles.replyHint}>{items.length} bình luận</div>
          <button className="btn" type="button" onClick={submit} disabled={submitting || !text.trim()}>
            {submitting ? 'Đang gửi...' : replyTo ? 'Trả lời' : 'Gửi bình luận'}
          </button>
        </div>
      </div>
    </div>
  )
}
