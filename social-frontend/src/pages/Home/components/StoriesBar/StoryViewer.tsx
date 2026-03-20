// ✅ FIX SLIDE ANIMATION (2-phase): src/pages/Home/components/StoriesBar/StoryViewer.tsx
// Nguyên nhân bạn "không thấy trượt": class transition được set cùng lúc với việc render pane incoming,
// nên browser không có “trạng thái trước” để animate (nó nhảy thẳng sang trạng thái cuối).
//
// Cách sửa: dùng 2-phase (prep -> run):
// - Phase "prep": render incoming ở vị trí ngoài màn (±100%) nhưng CHƯA có transition
// - next RAF: thêm class "run" => bắt đầu transition trượt mượt

import { useEffect, useMemo, useRef, useState } from 'react'
import { stories as storiesMock, Story } from '../../mock'
import styles from './StoryViewer.module.css'
import { useModal } from '../../../../components/Modal'

const DEFAULT_MS = 15000
const SLIDE_MS = 240

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

type Target = { storyIndex: number; itemIndex: number }
type Dir = 'next' | 'prev'
type AnimPhase = 'idle' | 'prep' | 'run'

export default function StoryViewer({ startStoryId }: { startStoryId: string }) {
  const modal = useModal()

  const stories = storiesMock
  const startIndex = Math.max(0, stories.findIndex((s) => s.id === startStoryId))

  const [storyIndex, setStoryIndex] = useState(startIndex)
  const [itemIndex, setItemIndex] = useState(0)

  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)

  const [anim, setAnim] = useState<{
    phase: AnimPhase
    dir: Dir
    target: Target | null
  }>({ phase: 'idle', dir: 'next', target: null })

  const commitTimerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  const currentStory: Story = stories[clamp(storyIndex, 0, stories.length - 1)]
  const currentItem = currentStory.items[clamp(itemIndex, 0, currentStory.items.length - 1)]
  const durationMs = currentItem.durationMs ?? DEFAULT_MS

  const computeNext = (): Target | null => {
    const s = stories[storyIndex]
    if (itemIndex < s.items.length - 1) return { storyIndex, itemIndex: itemIndex + 1 }
    if (storyIndex < stories.length - 1) return { storyIndex: storyIndex + 1, itemIndex: 0 }
    return null
  }

  const computePrev = (): Target => {
    if (itemIndex > 0) return { storyIndex, itemIndex: itemIndex - 1 }
    if (storyIndex > 0) {
      const prevStory = stories[storyIndex - 1]
      return { storyIndex: storyIndex - 1, itemIndex: prevStory.items.length - 1 }
    }
    return { storyIndex, itemIndex: 0 }
  }

  const startSlide = (dir: Dir, target: Target | null) => {
    if (anim.phase !== 'idle') return

    if (!target) {
      modal.close()
      return
    }

    // pause while animating
    setPaused(true)
    lastTsRef.current = null

    // Phase 1: prep (render incoming outside viewport, no transition)
    setAnim({ phase: 'prep', dir, target })

    // Phase 2: run (add transition) on next frame so browser has initial layout
    requestAnimationFrame(() => {
      setAnim((a) => (a.phase === 'prep' ? { ...a, phase: 'run' } : a))
    })

    if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current)
    commitTimerRef.current = window.setTimeout(() => {
      setStoryIndex(target.storyIndex)
      setItemIndex(target.itemIndex)
      setProgress(0)

      setAnim({ phase: 'idle', dir, target: null })
      setPaused(false)
      lastTsRef.current = null
    }, SLIDE_MS)
  }

  const goNext = () => startSlide('next', computeNext())
  const goPrev = () => startSlide('prev', computePrev())

  // RAF progress
  useEffect(() => {
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts

      if (!paused && anim.phase === 'idle') {
        setProgress((p) => {
          const next = p + dt / durationMs
          if (next >= 1) {
            queueMicrotask(goNext)
            return 0
          }
          return next
        })
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, durationMs, storyIndex, itemIndex, anim.phase])

  useEffect(() => {
    return () => {
      if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current)
      commitTimerRef.current = null
    }
  }, [])

  // keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') modal.close()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === ' ' || e.key === 'k') setPaused((p) => !p)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyIndex, itemIndex, anim.phase])

  const bars = useMemo(() => {
    const s = stories[storyIndex]
    return s.items.map((_, idx) => {
      if (idx < itemIndex) return 1
      if (idx === itemIndex) return progress
      return 0
    })
  }, [stories, storyIndex, itemIndex, progress])

  const incoming = useMemo(() => {
    if (anim.phase === 'idle' || !anim.target) return null
    const s = stories[clamp(anim.target.storyIndex, 0, stories.length - 1)]
    const it = s.items[clamp(anim.target.itemIndex, 0, s.items.length - 1)]
    return { story: s, item: it }
  }, [anim.phase, anim.target, stories])

  const renderMedia = (type: 'image' | 'video', src: string) => {
    if (type === 'image') return <img className={styles.media} src={src} alt="" draggable={false} />
    return <video className={styles.media} src={src} autoPlay muted playsInline />
  }

  const onOverlayMouseDown = (e: React.MouseEvent) => {
    if (anim.phase !== 'idle') return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width * 0.35) goPrev()
    else if (x > rect.width * 0.65) goNext()
    else setPaused((p) => !p)
  }

  const nextPreview = stories[storyIndex + 1] || null

  return (
    <div className={styles.stage}>
      <div className={styles.topLeftBrand}>Instagram</div>

      <button className={styles.closeBtn} onClick={modal.close} aria-label="Close">
        ✕
      </button>

      <div className={styles.viewerRow}>
        <button className={styles.navBtn} onClick={goPrev} aria-label="Previous" title="Previous">
          ‹
        </button>

        <div
          className={styles.storyCard}
          onMouseDown={onOverlayMouseDown}
          onMouseDownCapture={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          {/* progress */}
          <div className={styles.progressRow}>
            {bars.map((v, idx) => (
              <div key={idx} className={styles.barTrack}>
                <div className={styles.barFill} style={{ transform: `scaleX(${clamp(v, 0, 1)})` }} />
              </div>
            ))}
          </div>

          {/* header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <img className={styles.headerAvatar} src={currentStory.avatar} alt="" />
              <div className={styles.headerMeta}>
                <div className={styles.headerUserRow}>
                  <span className={styles.headerUser}>{currentStory.name}</span>
                  <span className={styles.headerTime}>{currentStory.timeLabel}</span>
                </div>
                <div className={styles.headerSub}>|| Motel Radio • Happiness Pie</div>
              </div>
            </div>

            <div className={styles.headerRight}>
              <button
                className={styles.iconBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  setPaused((p) => !p)
                }}
                aria-label="Pause"
              >
                {paused ? '▶' : '⏸'}
              </button>
              <button className={styles.iconBtn} onClick={(e) => e.stopPropagation()} aria-label="More">
                …
              </button>
            </div>
          </div>

          {/* content + slide */}
          <div className={styles.content}>
            <div
              className={[
                styles.slideStage,
                anim.dir === 'next' ? styles.dirNext : styles.dirPrev,
                anim.phase === 'run' ? styles.run : '',
              ].join(' ')}
              style={{ ['--slideMs' as any]: `${SLIDE_MS}ms` }}
            >
              <div className={styles.paneCurrent}>{renderMedia(currentItem.type, currentItem.src)}</div>

              {incoming && <div className={styles.paneIncoming}>{renderMedia(incoming.item.type, incoming.item.src)}</div>}
            </div>
          </div>

          {/* footer */}
          <div className={styles.footer}>
            <div className={styles.replyBox}>Trả lời {currentStory.name}…</div>
            <div className={styles.footerIcons}>
              <span className={styles.footerIcon}>♡</span>
              <span className={styles.footerIcon}>✈</span>
            </div>
          </div>
        </div>

        <button className={styles.navBtn} onClick={goNext} aria-label="Next" title="Next">
          ›
        </button>

        {/* preview right */}
        <div className={styles.previewCol}>
          {nextPreview ? (
            <div className={styles.previewCard}>
              <img className={styles.previewMedia} src={nextPreview.items[0]?.src} alt="" />
              <div className={styles.previewOverlay}>
                <div className={styles.previewCenter}>
                  <div className={styles.previewRing}>
                    <img className={styles.previewAvatar} src={nextPreview.avatar} alt="" />
                  </div>
                  <div className={styles.previewUser}>{nextPreview.name}</div>
                  <div className={styles.previewTime}>{nextPreview.timeLabel}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.previewEmpty} />
          )}
        </div>
      </div>
    </div>
  )
}