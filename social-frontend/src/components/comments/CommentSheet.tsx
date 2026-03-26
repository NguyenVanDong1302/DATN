import { useCallback, useEffect, useMemo, useState } from 'react'
import styles from './CommentSheet.module.css'
import { useApi, resolveMediaUrl } from '../../lib/api'
import { useToast } from '../Toast'
import { useAppStore } from '../../state/store'
import type { Post, PostComment } from '../../types'

type Props = {
  postId: string
  onChanged?: (count: number) => void
}

type NormalizedMedia = {
  type: 'image' | 'video'
  url: string
}

type GroupedComment = {
  root: PostComment
  replies: PostComment[]
}

function detectMediaType(item: any): 'image' | 'video' | null {
  const type = String(item?.type || '').toLowerCase()
  const mime = String(item?.mimeType || '').toLowerCase()
  const url = String(item?.url || item || '').toLowerCase()

  if (type === 'video' || mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)$/i.test(url)) {
    return 'video'
  }
  if (type === 'image' || mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(url)) {
    return 'image'
  }
  return null
}

function getPostMedia(post: Post | null): NormalizedMedia[] {
  if (!post) return []
  const list: NormalizedMedia[] = []

  if (Array.isArray(post.media)) {
    for (const item of post.media) {
      const type = detectMediaType(item)
      const url = resolveMediaUrl(item?.url)
      if (!type || !url) continue
      list.push({ type, url })
    }
  }

  if (!list.length && post.imageUrl) {
    const url = resolveMediaUrl(post.imageUrl)
    if (url) list.push({ type: detectMediaType({ url }) || 'image', url })
  }

  return list
}

function formatRelative(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} phút`
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} giờ`
  if (diff < week) return `${Math.max(1, Math.floor(diff / day))} ngày`
  return `${Math.max(1, Math.floor(diff / week))} tuần`
}

function groupComments(items: PostComment[]): GroupedComment[] {
  const roots = items.filter((item) => !item.parentCommentId)
  const repliesMap = new Map<string, PostComment[]>()

  for (const item of items) {
    if (!item.parentCommentId) continue
    const bucket = repliesMap.get(item.parentCommentId) || []
    bucket.push(item)
    repliesMap.set(item.parentCommentId, bucket)
  }

  roots.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
  for (const [, replyItems] of repliesMap) {
    replyItems.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
  }

  return roots.map((root) => ({
    root,
    replies: repliesMap.get(root._id) || [],
  }))
}

function MediaPreview({ media }: { media: NormalizedMedia[] }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    setActive(0)
  }, [media.length])

  const current = media[active]
  if (!current) {
    return <div className={styles.mediaEmpty}>Bài viết này chưa có ảnh hoặc video.</div>
  }

  return (
    <div className={styles.mediaWrap}>
      <div className={styles.mediaStage}>
        {current.type === 'video' ? (
          <video className={styles.media} src={current.url} controls playsInline />
        ) : (
          <img className={styles.media} src={current.url} alt="post" />
        )}

        {media.length > 1 ? (
          <>
            <button
              type="button"
              className={`${styles.mediaNav} ${styles.mediaPrev}`}
              onClick={() => setActive((v) => (v - 1 + media.length) % media.length)}
              aria-label="Ảnh trước"
            >
              ‹
            </button>
            <button
              type="button"
              className={`${styles.mediaNav} ${styles.mediaNext}`}
              onClick={() => setActive((v) => (v + 1) % media.length)}
              aria-label="Ảnh sau"
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      {media.length > 1 ? (
        <div className={styles.mediaDots}>
          {media.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`${styles.mediaDot} ${index === active ? styles.mediaDotActive : ''}`}
              onClick={() => setActive(index)}
              aria-label={`Chuyển đến media ${index + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function CommentSheet({ postId, onChanged }: Props) {
  const api = useApi()
  const toast = useToast()
  const { state } = useAppStore()
  const [post, setPost] = useState<Post | null>(null)
  const [items, setItems] = useState<PostComment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<PostComment | null>(null)
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [postRes, commentRes] = await Promise.all([
        api.get(`/posts/${postId}`),
        api.get(`/posts/${postId}/comments`),
      ])

      setPost(postRes?.data?.post || postRes?.data || postRes || null)
      const next = Array.isArray(commentRes?.data) ? commentRes.data : []
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
        parentCommentId: replyTo ? replyTo.parentCommentId || replyTo._id : null,
        replyToCommentId: replyTo?._id || null,
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

  const remove = async (comment: PostComment) => {
    try {
      await api.del(`/posts/${postId}/comments/${comment._id}`)
      await load()
    } catch (error: any) {
      toast.push(error?.message || 'Không thể xóa bình luận')
    }
  }

  const toggleReplies = (rootId: string) => {
    setExpandedRoots((prev) => ({ ...prev, [rootId]: !prev[rootId] }))
  }

  const media = useMemo(() => getPostMedia(post), [post])
  const groups = useMemo(() => groupComments(items), [items])

  useEffect(() => {
    setExpandedRoots((prev) => {
      const next: Record<string, boolean> = {}
      for (const group of groups) {
        next[group.root._id] = prev[group.root._id] ?? true
      }
      return next
    })
  }, [groups])

  const renderComment = (comment: PostComment, mode: 'root' | 'reply') => {
    const canDelete = Boolean(comment.canDelete || (comment.authorUsername && state.username && comment.authorUsername === state.username))
    const targetUsername = comment.replyTo?.authorUsername || comment.replyToAuthorUsername
    const isReply = mode === 'reply'

    return (
      <div key={comment._id} className={`${styles.item} ${isReply ? styles.replyItem : ''}`}>
        <div className={styles.itemAvatar}>{(comment.authorUsername || 'u').slice(0, 1).toUpperCase()}</div>
        <div className={styles.itemBody}>
          {isReply ? (
            <div className={styles.replyBadgeRow}>
              <span className={styles.replyBadge}>Trả lời</span>
              {targetUsername ? <span className={styles.replyTarget}>@{targetUsername}</span> : null}
            </div>
          ) : null}

          <div className={`${styles.itemBubble} ${isReply ? styles.replyBubble : ''}`}>
            <div className={styles.itemTopline}>
              <span className={styles.author}>{comment.authorUsername || 'user'}</span>
              <span className={styles.time}>{formatRelative(comment.createdAt)}</span>
            </div>
            <div className={styles.content}>
              {isReply && targetUsername ? <span className={styles.mention}>@{targetUsername} </span> : null}
              {comment.content}
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.actionBtn} type="button" onClick={() => setReplyTo(comment)}>
              Trả lời
            </button>
            {canDelete ? (
              <button className={`${styles.actionBtn} ${styles.actionDanger}`} type="button" onClick={() => remove(comment)}>
                Xóa
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <div className={styles.previewCol}>
        <MediaPreview media={media} />
      </div>

      <div className={styles.panelCol}>
        <div className={styles.header}>
          <div className={styles.postMeta}>
            <div className={styles.postAvatar}>{(post?.authorUsername || 'u').slice(0, 1).toUpperCase()}</div>
            <div>
              <div className={styles.postAuthor}>{post?.authorUsername || 'user'}</div>
              <div className={styles.postDate}>{post?.createdAt ? new Date(post.createdAt).toLocaleString() : 'Bài viết'}</div>
            </div>
          </div>
          <button className={styles.refreshBtn} type="button" onClick={load} disabled={loading}>
            Làm mới
          </button>
        </div>

        {post?.content ? (
          <div className={styles.captionCard}>
            <span className={styles.captionAuthor}>{post.authorUsername || 'user'}</span>
            <span className={styles.captionText}>{post.content}</span>
          </div>
        ) : null}

        <div className={styles.list}>
          {loading ? <div className={styles.empty}>Đang tải bình luận...</div> : null}
          {!loading && !items.length ? <div className={styles.empty}>Chưa có bình luận nào. Hãy là người đầu tiên để lại lời nhắn.</div> : null}
          {groups.map(({ root, replies }) => (
            <div key={root._id} className={styles.thread}>
              {renderComment(root, 'root')}
              {replies.length ? (
                <div className={styles.repliesWrap}>
                  <button
                    type="button"
                    className={styles.repliesToggle}
                    onClick={() => toggleReplies(root._id)}
                  >
                    <span className={styles.repliesToggleLine} />
                    {expandedRoots[root._id] ? 'Ẩn câu trả lời' : `Xem ${replies.length} câu trả lời`}
                  </button>
                  {expandedRoots[root._id] ? (
                    <div className={styles.repliesStack}>
                      {replies.map((reply) => renderComment(reply, 'reply'))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className={styles.composer}>
          {replyTo ? (
            <div className={styles.replyHint}>
              <div>
                Đang trả lời <strong>@{replyTo.authorUsername}</strong>
                {replyTo.replyTo?.authorUsername || replyTo.replyToAuthorUsername ? (
                  <span className={styles.replyHintMeta}> trong luồng với @{replyTo.replyTo?.authorUsername || replyTo.replyToAuthorUsername}</span>
                ) : null}
              </div>
              <button className={styles.cancelReplyBtn} type="button" onClick={() => setReplyTo(null)}>
                Hủy
              </button>
            </div>
          ) : null}

          <div className={styles.composerRow}>
            <div className={styles.composerIcon}>☺</div>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={replyTo ? `Trả lời @${replyTo.authorUsername}...` : 'Thêm bình luận...'}
              rows={1}
            />
            <button className={styles.submitBtn} type="button" onClick={submit} disabled={submitting || !text.trim()}>
              {submitting ? 'Đang gửi...' : 'Đăng'}
            </button>
          </div>
          <div className={styles.footerMeta}>{items.length} bình luận</div>
        </div>
      </div>
    </div>
  )
}
