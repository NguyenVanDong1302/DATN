import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { resolveMediaUrl, useApi } from '../../../../lib/api'
import { useModal } from '../../../../components/Modal'
import { useToast } from '../../../../components/Toast'
import GlobalPostCard from '../../../../components/PostCard'
import CommentSheet from '../../../../components/comments/CommentSheet'
import type { Post } from '../../../../types'
import { useUsersApi } from '../../../../features/users/users.api'
import { usePostsApi } from '../../../../features/posts/posts.api'
import { useAppStore } from '../../../../state/store'
import styles from './Feed.module.css'

type NormalizedMedia = {
  type: 'image' | 'video'
  url: string
}

type DetailModalProps = {
  post: Post
  onOpenAuthor: () => void
  onOpenPostPage: () => void
  onOpenComment: () => void
}

type EditModalProps = {
  post: Post
  onSave: (nextContent: string) => Promise<void>
  onCancel: () => void
}

function detectMediaType(item: any): 'image' | 'video' | null {
  const type = String(item?.type || '').toLowerCase()
  const mime = String(item?.mimeType || '').toLowerCase()
  const url = String(item?.url || item || '').toLowerCase()

  if (type === 'video' || mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)$/i.test(url)) return 'video'
  if (type === 'image' || mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(url)) return 'image'
  return null
}

function getPostMedia(post: Post): NormalizedMedia[] {
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
    const type = detectMediaType({ url }) || 'image'
    if (url) list.push({ type, url })
  }

  return list
}

function DetailModal({ post, onOpenAuthor, onOpenPostPage, onOpenComment }: DetailModalProps) {
  const media = useMemo(() => getPostMedia(post), [post])
  const [active, setActive] = useState(0)
  const likesCount = Number(post.likesCount || (Array.isArray(post.likes) ? post.likes.length : 0))
  const commentsCount = Number(post.commentsCount || 0)

  useEffect(() => {
    setActive(0)
  }, [post._id])

  const current = media[active] || null
  const hasMany = media.length > 1

  return (
    <div className={styles.detailModal}>
      <div className={styles.detailHeader}>
        <button type="button" className={styles.detailAuthorBtn} onClick={onOpenAuthor}>
          @{post.authorUsername || 'user'}
        </button>
        <span className={styles.detailMeta}>{post.createdAt ? new Date(post.createdAt).toLocaleString('vi-VN') : 'Vua xong'}</span>
      </div>

      <div className={styles.detailMediaWrap}>
        {current?.type === 'video' ? (
          <video className={styles.detailMedia} src={current.url} controls playsInline preload="metadata" />
        ) : current?.url ? (
          <img className={styles.detailMedia} src={current.url} alt={post.content || 'post'} />
        ) : (
          <div className={styles.state}>Bai viet nay chua co media.</div>
        )}
      </div>

      {hasMany ? (
        <div className={styles.detailNavRow}>
          <button type="button" className={styles.detailNavBtn} onClick={() => setActive((value) => (value - 1 + media.length) % media.length)}>
            Truoc
          </button>
          <span>{active + 1}/{media.length}</span>
          <button type="button" className={styles.detailNavBtn} onClick={() => setActive((value) => (value + 1) % media.length)}>
            Sau
          </button>
        </div>
      ) : null}

      {post.content ? <div className={styles.detailCaption}>{post.content}</div> : null}

      <div className={styles.detailStats}>
        <span>{likesCount} luot thich</span>
        <span>{commentsCount} binh luan</span>
      </div>

      <div className={styles.detailActionRow}>
        <button type="button" className={styles.detailActionBtn} onClick={onOpenComment}>Mo binh luan</button>
        <button type="button" className={styles.detailActionBtn} onClick={onOpenPostPage}>Mo trang chi tiet</button>
      </div>
    </div>
  )
}

function EditPostModal({ post, onSave, onCancel }: EditModalProps) {
  const [content, setContent] = useState(String(post.content || ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (saving) return
    const nextContent = String(content || '')
    const hasMedia = (Array.isArray(post.media) && post.media.length > 0) || Boolean(post.imageUrl)
    if (!hasMedia && !nextContent.trim()) {
      setError('Bai viet dang text-only thi khong duoc de trong noi dung.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave(nextContent)
    } catch (err: any) {
      setError(err?.message || 'Khong cap nhat duoc bai viet')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.editBox}>
      <div className={styles.editTitle}>Chinh sua bai viet</div>
      <textarea
        className={styles.editTextarea}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Nhap noi dung moi"
      />
      {error ? <div className={styles.editError}>{error}</div> : null}
      <div className={styles.editActionRow}>
        <button type="button" className={styles.editCancelBtn} onClick={onCancel} disabled={saving}>Huy</button>
        <button type="button" className={styles.editSaveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Dang luu...' : 'Luu thay doi'}
        </button>
      </div>
    </div>
  )
}

export default function Feed() {
  const api = useApi()
  const usersApi = useUsersApi()
  const postsApi = usePostsApi()
  const nav = useNavigate()
  const modal = useModal()
  const toast = useToast()
  const { state } = useAppStore()

  const [items, setItems] = useState<Post[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set())
  const [followPendingMap, setFollowPendingMap] = useState<Record<string, boolean>>({})
  const [reportPendingMap, setReportPendingMap] = useState<Record<string, boolean>>({})

  const loadFollowState = useCallback(async () => {
    if (!state.username) return
    try {
      const following = await usersApi.getFollowing(state.username)
      setFollowingSet(new Set(following.map((user) => user.username)))
    } catch {
      // ignore follow state error on feed
    }
  }, [state.username, usersApi])

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get(`/posts?page=${page}&limit=10`)
      const payload = response?.data || {}
      setItems(Array.isArray(payload.items) ? payload.items : [])
      setTotalPages(Math.max(Number(payload.totalPages) || 1, 1))
    } catch (error: any) {
      toast.push(error?.message || 'Khong tai duoc danh sach bai viet')
    } finally {
      setLoading(false)
    }
  }, [api, page, toast])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  useEffect(() => {
    loadFollowState()
  }, [loadFollowState])

  const refresh = () => {
    loadPosts()
    loadFollowState()
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
      toast.push(error?.message || 'Khong the cap nhat luot thich')
    }
  }

  const handleToggleFollow = async (post: Post) => {
    const targetUsername = String(post.authorUsername || '').trim()
    if (!targetUsername || targetUsername === state.username || followPendingMap[targetUsername]) return

    const wasFollowing = followingSet.has(targetUsername)
    setFollowPendingMap((prev) => ({ ...prev, [targetUsername]: true }))
    setFollowingSet((prev) => {
      const next = new Set(prev)
      if (wasFollowing) next.delete(targetUsername)
      else next.add(targetUsername)
      return next
    })

    try {
      if (wasFollowing) {
        await usersApi.unfollowUser({ username: targetUsername })
      } else {
        await usersApi.followUser({ username: targetUsername })
      }
    } catch (error: any) {
      setFollowingSet((prev) => {
        const next = new Set(prev)
        if (wasFollowing) next.add(targetUsername)
        else next.delete(targetUsername)
        return next
      })
      toast.push(error?.message || 'Khong the cap nhat follow')
    } finally {
      setFollowPendingMap((prev) => ({ ...prev, [targetUsername]: false }))
    }
  }

  useEffect(() => {
    const handlePostDeleted = (event: Event) => {
      const postId = String((event as CustomEvent).detail?.postId || '')
      if (!postId) return
      setItems((prev) => prev.filter((item) => item._id !== postId))
    }
    window.addEventListener('post:deleted', handlePostDeleted as EventListener)
    return () => window.removeEventListener('post:deleted', handlePostDeleted as EventListener)
  }, [])

  const handleDeletePost = async (post: Post) => {
    try {
      await postsApi.deletePost(post._id)
      setItems((prev) => prev.filter((item) => item._id !== post._id))
      toast.push('Da xoa bai viet')
    } catch (error: any) {
      toast.push(error?.message || 'Khong the xoa bai viet')
    }
  }

  const handleEditPost = (post: Post) => {
    modal.open(
      <EditPostModal
        post={post}
        onCancel={() => modal.close()}
        onSave={async (nextContent) => {
          const data = await postsApi.updatePost(post._id, { content: nextContent })
          updatePost(post._id, data || {})
          toast.push('Da cap nhat bai viet')
          modal.close()
        }}
      />,
    )
  }

  const openDetailPopup = (post: Post) => {
    modal.open(
      <DetailModal
        post={post}
        onOpenAuthor={() => {
          modal.close()
          nav(`/profile/${encodeURIComponent(post.authorUsername || post.authorId || 'user')}`)
        }}
        onOpenPostPage={() => {
          modal.close()
          nav(`/post/${post._id}`)
        }}
        onOpenComment={() => {
          modal.open(
            <CommentSheet
              postId={post._id}
              onChanged={(count) => updatePost(post._id, { commentsCount: count })}
            />,
          )
        }}
      />,
    )
  }

  const handleReportPost = async (post: Post, reason: string) => {
    if (!post?._id || reportPendingMap[post._id]) return
    setReportPendingMap((prev) => ({ ...prev, [post._id]: true }))
    try {
      await api.post(`/posts/${post._id}/report`, { reason })
      toast.push('Da gui bao cao toi admin')
      updatePost(post._id, {
        moderationStatus: 'reported',
        reportCount: Number(post.reportCount || 0) + 1,
      })
    } catch (error: any) {
      toast.push(error?.message || 'Khong the bao cao bai viet')
    } finally {
      setReportPendingMap((prev) => ({ ...prev, [post._id]: false }))
    }
  }

  const followingLookup = useMemo(() => followingSet, [followingSet])
  const currentUsername = String(state.username || '').trim().toLowerCase()

  return (
    <div className={`${styles.feed} home-feed`}>
      <div className={`${styles.topbar} home-feed__topbar`}>
        <div>
          <div className={styles.title}>Bai viet moi nhat</div>
          <div className={`${styles.subtitle} home-feed__subtitle`}>Hien thi toan bo bai viet theo thoi gian gan nhat</div>
        </div>
        <button className="btn home-feed__refresh" type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Dang tai...' : 'Lam moi'}
        </button>
      </div>

      {loading && !items.length ? <div className={styles.state}>Dang tai bai viet...</div> : null}
      {!loading && !items.length ? <div className={styles.state}>Chua co bai viet nao.</div> : null}

      {items.map((post) => {
        const authorUsername = String(post.authorUsername || '').trim()
        const showFollowButton = !!authorUsername && authorUsername !== state.username
        const canManagePost = !!authorUsername && authorUsername.toLowerCase() === currentUsername

        return (
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
            onOpenDetail={() => openDetailPopup(post)}
            onOpenAuthor={() => nav(`/profile/${encodeURIComponent(post.authorUsername || post.authorId || 'user')}`)}
            showFollowButton={showFollowButton}
            following={followingLookup.has(authorUsername)}
            followPending={!!followPendingMap[authorUsername]}
            reportPending={!!reportPendingMap[post._id]}
            onToggleFollow={() => handleToggleFollow(post)}
            onDelete={canManagePost ? () => handleDeletePost(post) : undefined}
            onEdit={canManagePost ? () => handleEditPost(post) : undefined}
            onReport={(reason) => handleReportPost(post, reason)}
          />
        )
      })}

      {items.length ? (
        <div className={styles.pagination}>
          <button className="btn" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
            Truoc
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
