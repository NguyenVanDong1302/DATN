import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApi, resolveMediaUrl } from '../../lib/api'
import { useUsersApi, type UserProfile } from '../../features/users/users.api'
import { useAppStore } from '../../state/store'
import { useMessagesApi } from '../../features/messages/messages.api'
import type { Post } from '../../types'
import CommentSheet from '../../components/comments/CommentSheet'
import styles from './ProfilePage.module.css'

type ModalMediaItem = {
  type: 'image' | 'video'
  url: string
  thumbnailUrl?: string
}

function avatarOf(profile?: Pick<UserProfile, 'avatarUrl' | 'username'> | null) {
  if (profile?.avatarUrl) return profile.avatarUrl
  const seed = encodeURIComponent(profile?.username || 'user')
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`
}

function normalizeMedia(post: Post): ModalMediaItem[] {
  const items = Array.isArray(post.media) ? post.media : []
  const mapped = items
    .map((item) => {
      const type = item?.type === 'video' || item?.mimeType?.startsWith('video/') ? 'video' : 'image'
      const url = resolveMediaUrl(item?.url)
      if (!url) return null
      return {
        type,
        url,
        thumbnailUrl: resolveMediaUrl(item?.thumbnailUrl),
      }
    })
    .filter(Boolean) as ModalMediaItem[]

  if (mapped.length) return mapped
  if (post.imageUrl) return [{ type: 'image', url: resolveMediaUrl(post.imageUrl) }]
  return []
}

function formatNumber(value?: number) {
  return Number(value || 0).toLocaleString('vi-VN')
}


function VideoThumbnail({ src, poster, alt }: { src: string; poster?: string; alt: string }) {
  const [preview, setPreview] = useState(poster || '')
  const cacheKey = `${src}|${poster || ''}`
  const doneRef = useRef('')

  useEffect(() => {
    if (poster) {
      setPreview(poster)
      doneRef.current = cacheKey
      return
    }
    if (doneRef.current === cacheKey) return

    let cancelled = false
    const video = document.createElement('video')
    video.src = src
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.crossOrigin = 'anonymous'

    const cleanup = () => {
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
      } catch {}
    }

    const capture = () => {
      if (cancelled) return
      try {
        const width = Math.max(video.videoWidth || 720, 320)
        const height = Math.max(video.videoHeight || 900, 320)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no-canvas')
        ctx.drawImage(video, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
        if (!cancelled) {
          setPreview(dataUrl)
          doneRef.current = cacheKey
        }
      } catch {
        if (!cancelled) {
          setPreview('')
          doneRef.current = cacheKey
        }
      } finally {
        cleanup()
      }
    }

    const onLoaded = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 1
      const seekTarget = duration > 1 ? Math.max(0.6, Math.min(duration * 0.2, duration - 0.2)) : 0.35
      try {
        video.currentTime = seekTarget
      } catch {
        capture()
      }
    }

    video.addEventListener('loadeddata', onLoaded, { once: true })
    video.addEventListener('seeked', capture, { once: true })
    video.addEventListener('error', cleanup, { once: true })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [cacheKey, poster, src])

  if (preview) return <img className={styles.tileMedia} src={preview} alt={alt} />
  return <div className={styles.videoFallback}>▶</div>
}


function ProfilePostModal({
  posts,
  index,
  onClose,
  onMove,
  onCommentsChanged,
}: {
  posts: Post[]
  index: number
  onClose: () => void
  onMove: (next: number) => void
  onCommentsChanged: (postId: string, count: number) => void
}) {
  const post = posts[index]
  const canPrevPost = index > 0
  const canNextPost = index < posts.length - 1

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' && canNextPost) onMove(index + 1)
      if (event.key === 'ArrowLeft' && canPrevPost) onMove(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canNextPost, canPrevPost, index, onClose, onMove])

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalShellWide} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        {canPrevPost ? <button type="button" className={`${styles.modalNav} ${styles.modalPrev}`} onClick={() => onMove(index - 1)}>‹</button> : null}
        {canNextPost ? <button type="button" className={`${styles.modalNav} ${styles.modalNext}`} onClick={() => onMove(index + 1)}>›</button> : null}
        <CommentSheet postId={post._id} onChanged={(count) => onCommentsChanged(post._id, count)} />
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { username = '' } = useParams()
  const navigate = useNavigate()
  const api = useApi()
  const usersApi = useUsersApi()
  const messagesApi = useMessagesApi()
  const { state } = useAppStore()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [followPending, setFollowPending] = useState(false)
  const [error, setError] = useState('')
  const [activePostIndex, setActivePostIndex] = useState<number | null>(null)

  const isMe = profile?.relationship?.isMe ?? state.username === username

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const [profileData, postsRes] = await Promise.all([usersApi.getProfile(username), api.get('/posts?page=1&limit=100')])
        if (!mounted) return
        const allPosts = (postsRes?.data?.items || []) as Post[]
        setProfile(profileData)
        setPosts(allPosts.filter((post) => post.authorUsername === username || post.authorId === profileData._id || post.authorId === profileData.id))
      } catch (err: any) {
        if (!mounted) return
        setError(err?.message || 'Không tải được trang cá nhân')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [api, username, usersApi])

  const postItems = useMemo(() => posts.map((post) => ({ ...post, normalizedMedia: normalizeMedia(post) })), [posts])

  useEffect(() => {
    const handlePostDeleted = (event: Event) => {
      const postId = String((event as CustomEvent).detail?.postId || '')
      if (!postId) return
      setPosts((prev) => {
        const next = prev.filter((item) => item._id !== postId)
        setActivePostIndex((current) => {
          if (current == null) return current
          if (!next.length) return null
          return Math.min(current, next.length - 1)
        })
        return next
      })
    }
    window.addEventListener('post:deleted', handlePostDeleted as EventListener)
    return () => window.removeEventListener('post:deleted', handlePostDeleted as EventListener)
  }, [])



  const handleFollowToggle = async () => {
    if (!profile || followPending || isMe) return
    setFollowPending(true)

    const previous = profile
    const isFollowing = !!profile.relationship?.isFollowing

    setProfile({
      ...profile,
      counts: {
        ...profile.counts,
        followers: Math.max(0, (profile.counts?.followers ?? 0) + (isFollowing ? -1 : 1)),
      },
      relationship: {
        ...profile.relationship,
        isFollowing: !isFollowing,
      },
    })

    try {
      const data = isFollowing
        ? await usersApi.unfollowUser({ username: profile.username, followingId: profile._id })
        : await usersApi.followUser({ username: profile.username, followingId: profile._id })

      setProfile((current) =>
        current
          ? {
              ...current,
              counts: {
                ...current.counts,
                followers: data.counts?.followers ?? current.counts?.followers ?? 0,
              },
              relationship: {
                ...current.relationship,
                ...data.relationship,
              },
            }
          : current,
      )
    } catch {
      setProfile(previous)
    } finally {
      setFollowPending(false)
    }
  }

  const handleMessage = async () => {
    if (!profile || isMe) {
      navigate('/messages')
      return
    }

    try {
      const conversation = await messagesApi.createDirectConversation(profile._id)
      navigate(`/messages?conversation=${encodeURIComponent(conversation.id)}`)
    } catch {
      navigate('/messages')
    }
  }

  if (loading) {
    return <div className={styles.state}>Đang tải trang cá nhân...</div>
  }

  if (error || !profile) {
    return <div className={styles.state}>{error || 'Không tìm thấy người dùng'}</div>
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.header}>
          <div className={styles.avatarWrap}>
            <img className={styles.avatar} src={avatarOf(profile)} alt={profile.username} />
          </div>

          <div className={styles.meta}>
            <div className={styles.topRow}>
              <div className={styles.username}>{profile.username}</div>
              {profile.showThreadsBadge ? <div className={styles.threadsBadge}>@</div> : null}
              <button className={styles.moreButton} type="button">
                •••
              </button>
            </div>

            <div className={styles.stats}>
              <span><b>{postItems.length}</b> bài viết</span>
              <span><b>{profile.counts?.followers ?? 0}</b> người theo dõi</span>
              <span>Đang theo dõi <b>{profile.counts?.following ?? 0}</b> người dùng</span>
            </div>

            <div className={styles.bioBlock}>
              <div className={styles.bioName}>{profile.fullName || profile.username.toUpperCase()}</div>
              {profile.website ? (
                <a className={styles.websiteLink} href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer">
                  {profile.website}
                </a>
              ) : null}
              <div className={styles.bioText}>{profile.bio || 'Chưa có tiểu sử.'}</div>
            </div>

            <div className={styles.actions}>
              {isMe ? (
                <button className={styles.secondaryBtn} type="button" onClick={() => navigate('/settings')}>
                  Chỉnh sửa trang cá nhân
                </button>
              ) : (
                <>
                  <button className={styles.followBtn} type="button" onClick={handleFollowToggle} disabled={followPending}>
                    {followPending ? 'Đang xử lý...' : profile.relationship.isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
                  </button>
                  <button className={styles.secondaryBtn} type="button" onClick={handleMessage}>
                    Nhắn tin
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        <section className={styles.storyRow}>
          <div className={styles.storyItem}>
            <div className={styles.storyCircle}>
              <img className={styles.storyThumb} src={avatarOf(profile)} alt={profile.username} />
            </div>
            <div className={styles.storyLabel}>{profile.username}</div>
          </div>
        </section>

        <section className={styles.tabBar}>
          <div className={styles.tabActive}>Bài viết</div>
          <div className={styles.tab}>Reels</div>
          <div className={styles.tab}>Được gắn thẻ</div>
        </section>

        <section className={styles.grid}>
          {postItems.length ? (
            postItems.map((post, index) => {
              const firstMedia = post.normalizedMedia?.[0]
              const preview = firstMedia?.thumbnailUrl || firstMedia?.url || resolveMediaUrl(post.imageUrl) || ''
              return (
                <button key={post._id} type="button" className={styles.tile} onClick={() => setActivePostIndex(index)}>
                  {preview ? (
                    <>
                      {firstMedia?.type === 'video' ? (
                        <VideoThumbnail src={firstMedia.url} poster={firstMedia.thumbnailUrl} alt={post.authorUsername || profile.username} />
                      ) : (
                        <img className={styles.tileMedia} src={preview} alt={post.authorUsername || profile.username} />
                      )}
                      {firstMedia?.type === 'video' ? <div className={styles.videoBadge}>▶</div> : null}
                      {(post.normalizedMedia?.length || 0) > 1 ? <div className={styles.multiBadge}>◫</div> : null}
                    </>
                  ) : (
                    <div className={styles.textTile}>{post.content || 'Bài viết'}</div>
                  )}
                </button>
              )
            })
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyCircle}>📷</div>
              <div className={styles.emptyTitle}>{postItems.length} bài viết</div>
              <div className={styles.emptyText}>Người dùng này chưa có bài viết nào.</div>
            </div>
          )}
        </section>
      </div>

      {activePostIndex !== null ? (
        <ProfilePostModal posts={posts} index={activePostIndex} onClose={() => setActivePostIndex(null)} onMove={(next) => setActivePostIndex(next)} onCommentsChanged={(postId, count) => setPosts((prev) => prev.map((post) => post._id === postId ? { ...post, commentsCount: count } : post))} />
      ) : null}
    </div>
  )
}
