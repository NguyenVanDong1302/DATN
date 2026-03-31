import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApi, resolveMediaUrl } from '../../lib/api'
import { useUsersApi, type UserProfile } from '../../features/users/users.api'
import { useAppStore } from '../../state/store'
import { useMessagesApi } from '../../features/messages/messages.api'
import type { Post, PostMedia } from '../../types'
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

function getPostPreview(post: Post) {
  const media = normalizeMedia(post)
  if (media[0]?.type === 'video') return media[0].thumbnailUrl || media[0].url
  return media[0]?.url || ''
}

function formatNumber(value?: number) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function ProfilePostModal({
  posts,
  index,
  profile,
  onClose,
  onMove,
}: {
  posts: Post[]
  index: number
  profile: UserProfile
  onClose: () => void
  onMove: (next: number) => void
}) {
  const navigate = useNavigate()
  const post = posts[index]
  const media = useMemo(() => normalizeMedia(post), [post])
  const [mediaIndex, setMediaIndex] = useState(0)

  useEffect(() => {
    setMediaIndex(0)
  }, [post?._id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') onMove(Math.min(posts.length - 1, index + 1))
      if (event.key === 'ArrowLeft') onMove(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onClose, onMove, posts.length])

  const currentMedia = media[mediaIndex]
  const canPrevPost = index > 0
  const canNextPost = index < posts.length - 1
  const canSlideMedia = media.length > 1

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalShell} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.modalClose} onClick={onClose}>
          ✕
        </button>

        {canPrevPost ? (
          <button type="button" className={`${styles.modalNav} ${styles.modalPrev}`} onClick={() => onMove(index - 1)}>
            ‹
          </button>
        ) : null}
        {canNextPost ? (
          <button type="button" className={`${styles.modalNav} ${styles.modalNext}`} onClick={() => onMove(index + 1)}>
            ›
          </button>
        ) : null}

        <div className={styles.modalCard}>
          <div className={styles.modalMediaCol}>
            {currentMedia ? (
              currentMedia.type === 'video' ? (
                <video className={styles.modalMedia} src={currentMedia.url} poster={currentMedia.thumbnailUrl || currentMedia.url} controls autoPlay muted playsInline />
              ) : (
                <img className={styles.modalMedia} src={currentMedia.url} alt={post.authorUsername || profile.username} />
              )
            ) : (
              <div className={styles.modalTextFallback}>{post.content || 'Bài viết không có media'}</div>
            )}

            {canSlideMedia ? (
              <>
                <button type="button" className={`${styles.mediaNav} ${styles.mediaPrev}`} onClick={() => setMediaIndex((value) => (value - 1 + media.length) % media.length)}>
                  ‹
                </button>
                <button type="button" className={`${styles.mediaNav} ${styles.mediaNext}`} onClick={() => setMediaIndex((value) => (value + 1) % media.length)}>
                  ›
                </button>
                <div className={styles.mediaDots}>
                  {media.map((_, dotIndex) => (
                    <button
                      key={dotIndex}
                      type="button"
                      className={`${styles.mediaDot} ${dotIndex === mediaIndex ? styles.mediaDotActive : ''}`}
                      onClick={() => setMediaIndex(dotIndex)}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className={styles.modalAside}>
            <div className={styles.modalHead}>
              <button type="button" className={styles.modalAuthor} onClick={() => navigate(`/profile/${encodeURIComponent(profile.username)}`)}>
                <img className={styles.modalAvatar} src={avatarOf(profile)} alt={profile.username} />
                <div>
                  <div className={styles.modalUsername}>{profile.username}</div>
                  <div className={styles.modalSub}>{post.createdAt ? new Date(post.createdAt).toLocaleString('vi-VN') : 'Vừa xong'}</div>
                </div>
              </button>
              <button type="button" className={styles.followMiniBtn}>Theo dõi</button>
            </div>

            <div className={styles.modalContent}>{post.content || 'Không có mô tả cho bài viết này.'}</div>

            <div className={styles.modalStats}>
              <span>♡ {formatNumber(post.likesCount)}</span>
              <span>💬 {formatNumber(post.commentsCount)}</span>
              <span>👁 {formatNumber(post.viewsCount)}</span>
            </div>

            <div className={styles.modalFooter}>Bài viết {index + 1} / {posts.length}</div>
          </div>
        </div>
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
        const [profileData, postsRes] = await Promise.all([
          usersApi.getProfile(username),
          api.get('/posts?page=1&limit=100'),
        ])
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

  const postItems = useMemo(
    () => posts.map((post) => ({ ...post, preview: getPostPreview(post), normalizedMedia: normalizeMedia(post) })),
    [posts],
  )

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
              counts: data.counts,
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
              <div className={styles.bioName}>{profile.username.toUpperCase()}</div>
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
              return (
                <button key={post._id} type="button" className={styles.tile} onClick={() => setActivePostIndex(index)}>
                  {post.preview ? (
                    <>
                      <img src={post.preview} alt={post.authorUsername || profile.username} />
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
        <ProfilePostModal
          posts={posts}
          index={activePostIndex}
          profile={profile}
          onClose={() => setActivePostIndex(null)}
          onMove={(next) => setActivePostIndex(next)}
        />
      ) : null}
    </div>
  )
}
