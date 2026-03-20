import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../lib/api'
import { Post } from '../types'
import { useToast } from '../components/Toast'

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

function getPostMedia(post: Post | null): NormalizedMedia[] {
  if (!post) return []
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

function VideoItem({ src, active }: { src: string; active: boolean }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting && entry.intersectionRatio >= 0.6)
      },
      { threshold: [0.2, 0.4, 0.6, 0.8] }
    )

    observer.observe(wrap)
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
    if (videoRef.current) videoRef.current.muted = next
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
    <div style={{ marginTop: 14 }}>
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
                <VideoItem src={item.url} active={i === index} />
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

export default function PostPage() {
  const { id = '' } = useParams()
  const api = useApi()
  const toast = useToast()

  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')

  const media = useMemo(() => getPostMedia(post), [post])

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/posts/${id}`)
      setPost(res?.data?.post || res?.data || res)
    } catch (e: any) {
      toast.push(`Load lỗi: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
  }, [id])

  const send = async () => {
    const v = text.trim()
    if (!v) return
    setStatus('Sending...')
    try {
      await api.post(`/posts/${id}/comments`, { content: v })
      setText('')
      setStatus('Sent!')
      toast.push('Commented')
    } catch (e: any) {
      setStatus(e.message || 'Comment failed')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.topRow}>
          <div>
            <div style={styles.title}>Bài viết</div>
            <div style={styles.subTitle}>{id}</div>
          </div>
          <button style={styles.refreshBtn} onClick={load}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {!post && !loading && (
          <div style={{ color: '#777', marginTop: 12 }}>Post not found / forbidden</div>
        )}

        {post && (
          <div style={{ marginTop: 12 }}>
            <div style={styles.authorLine}>
              <div style={styles.avatar} />
              <div>
                <div style={styles.authorName}>{post.authorUsername || post.authorId || 'user'}</div>
                <div style={styles.authorMeta}>
                  {post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Vừa xong'} ·{' '}
                  {post.visibility || 'public'}
                </div>
              </div>
            </div>

            {post.content && <div style={styles.content}>{post.content}</div>}

            <MediaSlider media={media} />

            <div style={styles.stats}>
              <span>♥ {post.likesCount ?? 0}</span>
              <span>💬 {post.commentsCount ?? 0}</span>
              <span>👁 {post.viewsCount ?? 0}</span>
            </div>
          </div>
        )}

        <div style={styles.commentBox}>
          <input
            style={styles.input}
            placeholder="Write a comment..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button style={styles.sendBtn} onClick={send}>
            Send
          </button>
        </div>

        {status && <div style={styles.status}>{status}</div>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 12px 40px',
    background: '#f6f6f7',
    minHeight: '100vh',
  },
  card: {
    width: '100%',
    maxWidth: 760,
    background: '#fff',
    border: '1px solid #e8e8ea',
    borderRadius: 22,
    padding: 18,
    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: '#111',
  },
  subTitle: {
    color: '#8a8a8f',
    fontSize: 12,
    marginTop: 4,
  },
  refreshBtn: {
    border: 'none',
    background: '#111827',
    color: '#fff',
    borderRadius: 999,
    padding: '10px 16px',
    cursor: 'pointer',
  },
  authorLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #f9ce34 0%, #ee2a7b 45%, #6228d7 100%)',
  },
  authorName: {
    fontWeight: 700,
    fontSize: 15,
  },
  authorMeta: {
    fontSize: 12,
    color: '#777',
    marginTop: 3,
  },
  content: {
    marginTop: 12,
    whiteSpace: 'pre-wrap',
    lineHeight: 1.6,
    color: '#111',
    fontSize: 15,
  },
  sliderWrap: {
    position: 'relative',
    borderRadius: 18,
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
    background: '#07111f',
    borderRadius: 18,
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
    background: '#07111f',
  },

  videoMedia: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    background: '#07111f',
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 38,
    height: 38,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255,255,255,0.94)',
    color: '#111',
    fontSize: 28,
    lineHeight: '38px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
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
    width: 40,
    height: 40,
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
    fontSize: 58,
    color: '#fff',
    background: 'linear-gradient(to top, rgba(0,0,0,0.18), rgba(0,0,0,0.04))',
    cursor: 'pointer',
    userSelect: 'none',
  },
  stats: {
    display: 'flex',
    gap: 16,
    marginTop: 12,
    color: '#444',
    fontSize: 14,
    flexWrap: 'wrap',
  },
  commentBox: {
    display: 'flex',
    gap: 10,
    marginTop: 18,
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    border: '1px solid #ddd',
    padding: '0 14px',
    outline: 'none',
    fontSize: 14,
  },
  sendBtn: {
    border: 'none',
    background: '#4f46e5',
    color: '#fff',
    borderRadius: 14,
    padding: '0 18px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  status: {
    marginTop: 10,
    color: '#777',
    fontSize: 13,
  },
}