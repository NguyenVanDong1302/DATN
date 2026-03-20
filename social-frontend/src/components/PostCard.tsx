import { useEffect, useMemo, useRef, useState } from 'react'
import { Post } from '../types'

type NormalizedMedia = {
  type: 'image' | 'video'
  url: string
}

function normalizeUrl(url?: string) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `http://localhost:4000${url.startsWith('/') ? '' : '/'}${url}`
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

function getPostMedia(post: Post): NormalizedMedia[] {
  const list: NormalizedMedia[] = []

  if (Array.isArray(post.media)) {
    for (const item of post.media) {
      const type = detectMediaType(item)
      const url = normalizeUrl(item?.url)
      if (!type || !url) continue
      list.push({ type, url })
    }
  }

  if (!list.length && post.imageUrl) {
    const url = normalizeUrl(post.imageUrl)
    const type = detectMediaType({ url }) || 'image'
    list.push({ type, url })
  }

  return list
}

function MediaVideo({ src, active }: { src: string; active: boolean }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting && entry.intersectionRatio >= 0.6)
      },
      { threshold: [0.2, 0.4, 0.6, 0.8] }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const shouldPlay = active && inView

    const run = async () => {
      try {
        if (shouldPlay) {
          video.muted = muted
          await video.play()
          setPlaying(true)
        } else {
          video.pause()
          setPlaying(false)
        }
      } catch {
        setPlaying(!video.paused)
      }
    }

    run()
  }, [active, inView, muted])

  const togglePlay = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if (video.paused) {
        await video.play()
        setPlaying(true)
      } else {
        video.pause()
        setPlaying(false)
      }
    } catch { }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !muted
    setMuted(next)
    if (videoRef.current) {
      videoRef.current.muted = next
    }
  }

  return (
    <div ref={wrapRef} style={styles.mediaFrame}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        muted={muted}
        preload="metadata"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        style={styles.videoMedia}
      />
      <button type="button" onClick={toggleMute} style={styles.muteBtn}>
        {muted ? '🔇' : '🔊'}
      </button>

      {!playing && (
        <div style={styles.playOverlay} onClick={togglePlay}>
          ▶
        </div>
      )}
    </div>
  )
}

function MediaSlider({ media }: { media: NormalizedMedia[] }) {
  const [index, setIndex] = useState(0)
  const total = media.length

  useEffect(() => {
    setIndex(0)
  }, [total])

  if (!media.length) return null

  const canSlide = total > 1
  const prev = () => setIndex((v) => (v - 1 + total) % total)
  const next = () => setIndex((v) => (v + 1) % total)

  return (
    <div style={{ marginTop: 12 }}>
      <div style={styles.sliderWrap}>
        <div
          style={{
            ...styles.sliderTrack,
            width: `${total * 100}%`,
            transform: `translate3d(-${index * (100 / total)}%, 0, 0)`,
          }}
        >
          {media.map((item, i) => (
            <div key={`${item.url}-${i}`} style={{ ...styles.slide, width: `${100 / total}%` }}>
              {item.type === 'video' ? (
                <MediaVideo src={item.url} active={i === index} />
              ) : (
                <div style={styles.mediaFrame}>
                  <img src={item.url} alt="post" style={styles.imageMedia} />
                </div>
              )}
            </div>
          ))}
        </div>

        {canSlide && (
          <>
            <button type="button" onClick={prev} style={{ ...styles.navBtn, left: 12 }}>
              ‹
            </button>
            <button type="button" onClick={next} style={{ ...styles.navBtn, right: 12 }}>
              ›
            </button>
          </>
        )}
      </div>

      {canSlide && (
        <div style={styles.dots}>
          {media.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              style={{
                ...styles.dot,
                opacity: i === index ? 1 : 0.35,
                transform: i === index ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PostCard({
  post,
  onLike,
  onOpenComment,
  onOpenDetail,
  onOpenAuthor,
}: {
  post: Post
  onLike: () => void
  onOpenComment: () => void
  onOpenDetail: () => void
  onOpenAuthor: () => void
}) {
  const likesCount = post.likesCount ?? (Array.isArray(post.likes) ? post.likes.length : 0)
  const likedByMe = !!post.likedByMe
  const commentsCount = post.commentsCount ?? 0
  const media = useMemo(() => getPostMedia(post), [post])

  return (
    <div style={styles.post}>
      <div style={styles.header}>
        <div style={styles.userBlock}>
          <div style={styles.avatar} />
          <div>
            <div style={styles.username} onClick={onOpenAuthor}>
              {post.authorUsername || post.authorId || 'user'}
            </div>
            <div style={styles.metaText}>
              {post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Vừa xong'}
            </div>
          </div>
        </div>

        <div style={styles.moreBtn}>•••</div>
      </div>

      {post.content && <div style={styles.content}>{post.content}</div>}

      <MediaSlider media={media} />

      <div style={styles.actions}>
        <button style={styles.actionBtn} onClick={onLike}>
          {likedByMe ? '♥' : '♡'} {likesCount}
        </button>
        <button style={styles.actionBtn} onClick={onOpenComment}>
          💬 {commentsCount}
        </button>
        <button style={{ ...styles.actionBtn, marginLeft: 'auto' }} onClick={onOpenDetail}>
          Xem chi tiết
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  post: {
    background: '#fff',
    border: '1px solid #e7e7e7',
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  userBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #f9ce34 0%, #ee2a7b 45%, #6228d7 100%)',
    padding: 2,
    position: 'relative',
  },
  username: {
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    lineHeight: 1.2,
  },
  metaText: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  moreBtn: {
    fontSize: 18,
    color: '#444',
    padding: '4px 8px',
    userSelect: 'none',
  },
  content: {
    marginTop: 10,
    whiteSpace: 'pre-wrap',
    lineHeight: 1.5,
    fontSize: 15,
    color: '#111',
  },
  sliderWrap: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  sliderTrack: {
    display: 'flex',
    transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
    willChange: 'transform',
  },
  slide: {
    flex: '0 0 auto',
  },
  mediaFrame: {
    width: '100%',
    aspectRatio: '4 / 5',
    background: '#0b1220',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageMedia: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    background: '#0b1220',
  },
  
  videoMedia: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    background: '#0b1220',
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255,255,255,0.92)',
    color: '#111',
    fontSize: 28,
    lineHeight: '36px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    zIndex: 3,
  },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    border: 'none',
    background: '#4f46e5',
    cursor: 'pointer',
    padding: 0,
    transition: 'all 220ms ease',
  },
  muteBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 38,
    height: 38,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: 18,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    zIndex: 2,
  },
  playOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    fontSize: 52,
    color: '#fff',
    background: 'linear-gradient(to top, rgba(0,0,0,0.16), rgba(0,0,0,0.04))',
    cursor: 'pointer',
    userSelect: 'none',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    border: 'none',
    background: '#f5f5f7',
    borderRadius: 999,
    padding: '10px 14px',
    fontSize: 14,
    cursor: 'pointer',
    color: '#111',
  },
}