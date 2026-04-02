import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import styles from './ProfilePage.module.css'
import { useApi, resolveMediaUrl } from '../../lib/api'
import { getAvatarUrl } from '../../lib/avatar'
import type { Post } from '../../types'
import { useToast } from '../../components/Toast'
import { useModal } from '../../components/Modal'
import CommentSheet from '../../components/comments/CommentSheet'

type Profile = {
  _id?: string
  username: string
  fullName?: string
  bio?: string
  avatarUrl?: string
  followersCount?: number
  followingCount?: number
}

const footerLinks = ['Meta', 'Giới thiệu', 'Blog', 'Việc làm', 'Trợ giúp', 'API', 'Quyền riêng tư', 'Điều khoản', 'Vị trí', 'Meta AI', 'Threads']

function IconGrid({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z" stroke="currentColor" strokeWidth="1.8" /></svg>
}
function IconReel({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm0 4h16M9 4l3 6M15 4l3 6M10 14.5v4l4-2-4-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
}
function IconGear({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" stroke="currentColor" strokeWidth="1.8" /><path d="M19.4 15.1c.03-.2.05-.41.05-.62s-.02-.42-.05-.62l2-1.55a.7.7 0 0 0 .17-.9l-1.9-3.29a.7.7 0 0 0-.85-.31l-2.35.95c-.33-.26-.7-.48-1.1-.66l-.35-2.5A.7.7 0 0 0 14.33 3h-3.8a.7.7 0 0 0-.69.59l-.35 2.5c-.4.18-.77.4-1.1.66l-2.35-.95a.7.7 0 0 0-.85.31L3.29 9.4a.7.7 0 0 0 .17.9l2 1.55c-.03.2-.05.41-.05.62s.02.42.05.62l-2 1.55a.7.7 0 0 0-.17.9l1.9 3.29c.18.3.54.42.85.31l2.35-.95c.33.26.7.48 1.1.66l.35 2.5c.05.34.34.59.69.59h3.8c.35 0 .64-.25.69-.59l.35-2.5c.4-.18.77-.4 1.1-.66l2.35.95c.31.12.67-.01.85-.31l1.9-3.29a.7.7 0 0 0-.17-.9l-2-1.55Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
}

function detectMediaType(item: any): 'image' | 'video' | null {
  const type = String(item?.type || item?.mediaType || '').toLowerCase()
  const mime = String(item?.mimeType || '').toLowerCase()
  const url = String(item?.url || item?.src || item || '').toLowerCase()
  if (type === 'video' || mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)$/i.test(url)) return 'video'
  if (type === 'image' || mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(url)) return 'image'
  return null
}

function normalizeMedia(post: Post): { type: 'image' | 'video'; url: string; thumbnailUrl?: string }[] {
  const items = Array.isArray(post.media) ? post.media : []
  const list = items
    .map((item: any) => {
      const type = detectMediaType(item)
      const url = resolveMediaUrl(item?.url || item?.src)
      if (!type || !url) return null
      return {
        type,
        url,
        thumbnailUrl: resolveMediaUrl(item?.thumbnailUrl || item?.poster || item?.thumbUrl || ''),
      }
    })
    .filter(Boolean) as { type: 'image' | 'video'; url: string; thumbnailUrl?: string }[]

  if (!list.length && post.imageUrl) {
    const url = resolveMediaUrl(post.imageUrl)
    if (url) list.push({ type: detectMediaType({ url }) || 'image', url })
  }
  return list
}

function isReelPost(post: Post) {
  const media = normalizeMedia(post)
  return media.length === 1 && media[0]?.type === 'video'
}

function getTileThumb(post: Post) {
  const media = normalizeMedia(post)
  if (!media.length) return { kind: 'empty' as const, src: '' }
  const first = media[0]
  if (isReelPost(post)) {
    const thumb = resolveMediaUrl((post as any).thumbnailUrl || first.thumbnailUrl || (post as any).poster || '')
    if (thumb) return { kind: 'image' as const, src: thumb }
    return { kind: 'video' as const, src: first.url }
  }
  const imageItem = media.find((item) => item.type === 'image') || first
  return { kind: imageItem.type === 'video' ? 'video' as const : 'image' as const, src: imageItem.url }
}

function ReelTilePreview({ src }: { src: string }) {
  return <video className={styles.tileVideo} src={src} muted playsInline preload="metadata" />
}

function PostDetailModal({ post, onChanged }: { post: Post; onChanged: () => void }) {
  const media = useMemo(() => normalizeMedia(post), [post])
  const [active, setActive] = useState(0)
  const authorAvatar = getAvatarUrl({ username: post.authorUsername, authorAvatarUrl: (post as any).authorAvatarUrl })
  const current = media[active]

  return (
    <div className={styles.detailShell}>
      <div className={styles.detailMediaCol}>
        <div className={styles.detailMediaWrap}>
          {current?.type === 'video' ? (
            <video className={styles.detailMedia} src={current.url} controls playsInline preload="metadata" />
          ) : current?.url ? (
            <img className={styles.detailMedia} src={current.url} alt={post.content || 'post'} />
          ) : (
            <div className={styles.detailMediaEmpty}>Bài viết này chưa có media.</div>
          )}

          {media.length > 1 ? (
            <>
              <button type="button" className={`${styles.detailNav} ${styles.detailPrev}`} onClick={() => setActive((v) => (v - 1 + media.length) % media.length)}>
                ‹
              </button>
              <button type="button" className={`${styles.detailNav} ${styles.detailNext}`} onClick={() => setActive((v) => (v + 1) % media.length)}>
                ›
              </button>
            </>
          ) : null}
        </div>
        {media.length > 1 ? (
          <div className={styles.detailDots}>
            {media.map((_, index) => (
              <button key={index} type="button" className={`${styles.detailDot} ${index === active ? styles.detailDotActive : ''}`} onClick={() => setActive(index)} />
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.detailSide}>
        <div className={styles.detailHeader}>
          <div className={styles.detailAuthor}>
            <img className={styles.detailAvatar} src={authorAvatar} alt={post.authorUsername || 'user'} />
            <div>
              <div className={styles.detailUsername}>{post.authorUsername || 'Người dùng'}</div>
              {post.content ? <div className={styles.detailCaption}>{post.content}</div> : null}
            </div>
          </div>
        </div>
        <div className={styles.detailComments}>
          <CommentSheet postId={post._id} onChanged={onChanged} mode="panel" />
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { username = '' } = useParams()
  const api = useApi()
  const toast = useToast()
  const nav = useNavigate()
  const modal = useModal()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [activeTab, setActiveTab] = useState<'posts' | 'reels'>('posts')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [profileRes, postsRes, followersRes, followingRes] = await Promise.allSettled([
          api.get(`/users/${encodeURIComponent(username)}`),
          api.get('/posts?page=1&limit=100'),
          api.get(`/users/${encodeURIComponent(username)}/followers`),
          api.get(`/users/${encodeURIComponent(username)}/following`),
        ])

        if (cancelled) return
        const p = profileRes.status === 'fulfilled' ? (profileRes.value?.data || profileRes.value) : null
        const allPosts: Post[] = postsRes.status === 'fulfilled' ? (postsRes.value?.data?.items || postsRes.value?.items || []) : []
        const mine = allPosts.filter((item) => String(item.authorUsername || item.authorId || '') === username)
        setPosts(mine)
        setProfile({
          ...(p || { username }),
          username,
          followersCount: followersRes.status === 'fulfilled' ? ((followersRes.value?.data || []).length) : 0,
          followingCount: followingRes.status === 'fulfilled' ? ((followingRes.value?.data || []).length) : 0,
        })
      } catch (error: any) {
        toast.push(error?.message || 'Không tải được trang cá nhân')
      }
    }
    if (username) load()
    return () => { cancelled = true }
  }, [api, toast, username])

  const reelPosts = useMemo(() => posts.filter(isReelPost), [posts])
  const shown = activeTab === 'posts' ? posts : reelPosts
  const avatarSrc = getAvatarUrl({ username, fullName: profile?.fullName, avatarUrl: profile?.avatarUrl })

  const openDetail = (post: Post) => {
    modal.open(
      <PostDetailModal
        post={post}
        onChanged={() => {
          setPosts((prev) => prev.map((item) => (item._id === post._id ? { ...item, commentsCount: (item.commentsCount || 0) + 1 } : item)))
        }}
      />,
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.header}>
          <div className={styles.avatarWrap}>
            <div className={styles.avatar}>
              <img className={styles.avatarImg} src={avatarSrc} alt={username} />
            </div>
          </div>

          <div className={styles.meta}>
            <div className={styles.topRow}>
              <div className={styles.username}>{username}</div>
              <button className={styles.gear} type="button" title="Cài đặt" onClick={() => nav('/settings')}>
                <IconGear size={16} />
              </button>
            </div>
            {profile?.fullName ? <div className={styles.name}>{profile.fullName}</div> : null}
            <div className={styles.stats}>
              <div className={styles.stat}><b>{posts.length}</b> bài viết</div>
              <div className={styles.stat}><b>{profile?.followersCount ?? 0}</b> người theo dõi</div>
              <div className={styles.stat}>Đang theo dõi <b>{profile?.followingCount ?? 0}</b> người dùng</div>
            </div>
            {profile?.bio ? <div className={styles.bio}>{profile.bio}</div> : null}
            <div className={styles.buttons}>
              <button className={styles.btn} type="button" onClick={() => nav('/settings')}>Chỉnh sửa trang cá nhân</button>
              <button className={styles.btn} type="button">Xem kho lưu trữ</button>
            </div>
          </div>
        </section>

        <section className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === 'posts' ? styles.tabActive : ''}`} onClick={() => setActiveTab('posts')}><IconGrid /> <span>Bài viết</span></button>
          <button className={`${styles.tab} ${activeTab === 'reels' ? styles.tabActive : ''}`} onClick={() => setActiveTab('reels')}><IconReel /> <span>Reels</span></button>
        </section>

        <section className={styles.grid}>
          {shown.map((post) => {
            const thumb = getTileThumb(post)
            return (
              <button key={post._id} className={styles.tile} type="button" onClick={() => openDetail(post)}>
                {thumb.kind === 'image' ? <img src={thumb.src} alt={post.content || 'post'} loading="lazy" /> : null}
                {thumb.kind === 'video' ? <ReelTilePreview src={thumb.src} /> : null}
                {thumb.kind === 'empty' ? <div className={styles.tileFallback}>Không có media</div> : null}
                {isReelPost(post) ? <span className={styles.reelBadge}>Reel</span> : null}
              </button>
            )
          })}
          {!shown.length ? <div className={styles.emptyState}>{activeTab === 'posts' ? 'Chưa có bài viết.' : 'Chưa có reel nào.'}</div> : null}
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerLinks}>{footerLinks.map((t) => <a key={t} href="#" onClick={(e) => e.preventDefault()}>{t}</a>)}</div>
        </footer>
      </div>
    </div>
  )
}
