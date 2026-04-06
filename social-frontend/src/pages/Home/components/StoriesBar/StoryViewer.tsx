import { useEffect, useMemo, useRef, useState } from 'react'
import { useModal } from '../../../../components/Modal'
import styles from './StoryViewer.module.css'
import type { StoryGroup, StoryItem } from '../../../../features/stories/stories.types'
import { useStoriesApi } from '../../../../features/stories/stories.api'
import { useMessagesApi } from '../../../../features/messages/messages.api'
import { useAppStore } from '../../../../state/store'

const DEFAULT_MS = 7000
const SLIDE_MS = 360

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

import { getAvatarUrl } from '../../../../lib/avatar'

function avatarOf(username: string, avatarUrl?: string) {
  return getAvatarUrl({ username, avatarUrl })
}

function timeLabel(value?: string) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.max(1, Math.round(diff / 60000))
  if (mins < 60) return `${mins} phút`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} giờ`
  return `${Math.round(hrs / 24)} ngày`
}

type Props = {
  groups: StoryGroup[]
  startGroupIndex: number
  startItemIndex: number
  onChanged?: (items: StoryGroup[]) => void
}

type Target = { groupIndex: number; itemIndex: number } | null

export default function StoryViewer({ groups, startGroupIndex, startItemIndex, onChanged }: Props) {
  const modal = useModal()
  const api = useStoriesApi()
  const messagesApi = useMessagesApi()
  const { state } = useAppStore()

  const [localGroups, setLocalGroups] = useState<StoryGroup[]>(groups)
  const [groupIndex, setGroupIndex] = useState(startGroupIndex)
  const [itemIndex, setItemIndex] = useState(startItemIndex)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [reply, setReply] = useState('')
  const [phase, setPhase] = useState<'idle' | 'run'>('idle')
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [target, setTarget] = useState<Target>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const lastTsRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setLocalGroups(groups)
  }, [groups])

  const safeGroupIndex = clamp(groupIndex, 0, Math.max(localGroups.length - 1, 0))
  const currentGroup = localGroups[safeGroupIndex]
  const safeItemIndex = clamp(itemIndex, 0, Math.max((currentGroup?.stories?.length || 1) - 1, 0))
  const currentItem = currentGroup?.stories?.[safeItemIndex]
  const isOwner = Boolean(currentGroup?.username && state.username && currentGroup.username === state.username)

  const incoming = useMemo(() => {
    if (!target) return null
    const g = localGroups[clamp(target.groupIndex, 0, localGroups.length - 1)]
    const it = g?.stories?.[clamp(target.itemIndex, 0, Math.max((g?.stories?.length || 1) - 1, 0))]
    return g && it ? { group: g, item: it } : null
  }, [target, localGroups])

  const bars = useMemo(
    () => (currentGroup?.stories || []).map((_, idx) => (idx < safeItemIndex ? 1 : idx === safeItemIndex ? progress : 0)),
    [currentGroup, safeItemIndex, progress],
  )

  const sideGroups = useMemo(() => {
    const out: Array<{ group: StoryGroup; index: number }> = []
    for (let offset = 1; offset <= 3; offset += 1) {
      const index = safeGroupIndex + offset
      if (index < localGroups.length) out.push({ group: localGroups[index], index })
    }
    return out
  }, [localGroups, safeGroupIndex])

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (!menuOpen) return
      if (menuRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [menuOpen])

  useEffect(() => {
    if (!currentItem) return
    if (currentItem.mediaType !== 'video') return
    const video = videoRef.current
    if (!video) return
    video.muted = muted
    video.currentTime = 0
    if (paused) {
      video.pause()
    } else {
      void video.play().catch(() => undefined)
    }
  }, [currentItem?.id, currentItem?.mediaType, muted, paused])

  useEffect(() => {
    if (!currentItem || currentItem.mediaType === 'video') return
    let raf = 0
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts
      if (!paused && !target) {
        setProgress((prev) => {
          const next = prev + dt / DEFAULT_MS
          if (next >= 1) {
            queueMicrotask(() => startSlide(computeNext(), 'next'))
            return 0
          }
          return next
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      lastTsRef.current = null
      cancelAnimationFrame(raf)
    }
  }, [paused, target, currentItem?.id, currentItem?.mediaType])

  const computeNext = () => {
    if (!currentGroup) return null
    if (safeItemIndex < currentGroup.stories.length - 1) return { groupIndex: safeGroupIndex, itemIndex: safeItemIndex + 1 }
    if (safeGroupIndex < localGroups.length - 1) return { groupIndex: safeGroupIndex + 1, itemIndex: 0 }
    return null
  }

  const computePrev = () => {
    if (!currentGroup) return null
    if (safeItemIndex > 0) return { groupIndex: safeGroupIndex, itemIndex: safeItemIndex - 1 }
    if (safeGroupIndex > 0) {
      const prev = localGroups[safeGroupIndex - 1]
      return { groupIndex: safeGroupIndex - 1, itemIndex: Math.max(0, (prev?.stories?.length || 1) - 1) }
    }
    return { groupIndex: safeGroupIndex, itemIndex: 0 }
  }

  const startSlide = (nextTarget: Target, nextDir: 'next' | 'prev') => {
    if (!nextTarget) return modal.close()
    setPaused(true)
    setDir(nextDir)
    setTarget(nextTarget)
    requestAnimationFrame(() => setPhase('run'))
    window.setTimeout(() => {
      setGroupIndex(nextTarget.groupIndex)
      setItemIndex(nextTarget.itemIndex)
      setTarget(null)
      setPhase('idle')
      setProgress(0)
      setPaused(false)
      setMenuOpen(false)
      setReply('')
    }, SLIDE_MS)
  }

  const applyGroups = (nextGroups: StoryGroup[], nextGroupIndex = safeGroupIndex, nextItemIndex = safeItemIndex) => {
    if (!nextGroups.length) {
      onChanged?.([])
      modal.close()
      return
    }
    const boundedGroupIndex = clamp(nextGroupIndex, 0, nextGroups.length - 1)
    const boundedItemIndex = clamp(nextItemIndex, 0, Math.max((nextGroups[boundedGroupIndex]?.stories?.length || 1) - 1, 0))
    setLocalGroups(nextGroups)
    setGroupIndex(boundedGroupIndex)
    setItemIndex(boundedItemIndex)
    setProgress(0)
    setPaused(false)
    setMenuOpen(false)
    setReply('')
    onChanged?.(nextGroups)
  }

  const handleLike = async () => {
    if (!currentItem || isOwner) return
    const previous = localGroups
    const optimistic = localGroups.map((group, gi) =>
      gi !== safeGroupIndex
        ? group
        : {
            ...group,
            stories: group.stories.map((story, si) =>
              si !== safeItemIndex
                ? story
                : {
                    ...story,
                    likedByMe: !story.likedByMe,
                    likesCount: Math.max(0, story.likesCount + (story.likedByMe ? -1 : 1)),
                  },
            ),
          },
    )
    applyGroups(optimistic)
    try {
      const result = await api.toggleLike(currentItem.id)
      const synced = optimistic.map((group, gi) =>
        gi !== safeGroupIndex
          ? group
          : {
              ...group,
              stories: group.stories.map((story, si) =>
                si !== safeItemIndex ? story : { ...story, likedByMe: result.liked, likesCount: result.likesCount },
              ),
            },
      )
      applyGroups(synced)
    } catch {
      applyGroups(previous)
    }
  }

  const handleReply = async () => {
    if (!currentItem || !currentGroup || isOwner) return
    const text = reply.trim() || '❤️'
    const conversation = await messagesApi.createDirectConversation(currentGroup.authorId)
    await messagesApi.sendMessageHttp(conversation.id, text, {
      storyId: currentItem.id,
      ownerUsername: currentGroup.username,
      mediaType: currentItem.mediaType,
      mediaUrl: currentItem.mediaUrl,
      thumbnailUrl: currentItem.thumbnailUrl,
    })
    setReply('')
  }

  const handleHide = async () => {
    if (!currentItem || !currentGroup || isOwner) return
    await api.hide(currentItem.id)
    const nextGroups = localGroups.filter((group) => group.authorId !== currentGroup.authorId)
    const fallbackIndex = safeGroupIndex >= nextGroups.length ? Math.max(0, nextGroups.length - 1) : safeGroupIndex
    applyGroups(nextGroups, fallbackIndex, 0)
  }

  const handleDelete = async () => {
    if (!currentItem || !currentGroup || !isOwner) return
    await api.remove(currentItem.id)
    const nextGroups = localGroups
      .map((group, gi) =>
        gi !== safeGroupIndex
          ? group
          : { ...group, stories: group.stories.filter((story) => story.id !== currentItem.id) },
      )
      .filter((group) => group.stories.length > 0)

    const sameGroupStillExists = Boolean(nextGroups[safeGroupIndex])
    const nextItem = sameGroupStillExists ? Math.min(safeItemIndex, Math.max(0, nextGroups[safeGroupIndex].stories.length - 1)) : 0
    const nextGroup = sameGroupStillExists ? safeGroupIndex : Math.max(0, safeGroupIndex - (safeGroupIndex >= nextGroups.length ? 1 : 0))
    applyGroups(nextGroups, nextGroup, nextItem)
  }

  const renderMedia = (item?: StoryItem) => {
    if (!item) return null
    if (item.mediaType === 'video') {
      return (
        <video
          ref={item.id === currentItem?.id ? videoRef : undefined}
          className={styles.media}
          src={item.mediaUrl}
          poster={item.thumbnailUrl}
          autoPlay
          muted={muted}
          playsInline
          onLoadedMetadata={(e) => {
            const video = e.currentTarget
            if (!Number.isFinite(video.duration) || video.duration <= 0) return
            if (!paused) {
              void video.play().catch(() => undefined)
            }
          }}
          onTimeUpdate={(e) => {
            if (item.id !== currentItem?.id || paused || target) return
            const video = e.currentTarget
            if (Number.isFinite(video.duration) && video.duration > 0) {
              setProgress(video.currentTime / video.duration)
            }
          }}
          onEnded={() => {
            if (item.id !== currentItem?.id) return
            startSlide(computeNext(), 'next')
          }}
        />
      )
    }
    return <img className={styles.media} src={item.mediaUrl} alt="story" draggable={false} />
  }

  if (!currentGroup || !currentItem) return null

  return (
    <div className={styles.stage}>
      <button className={styles.closeBtn} onClick={modal.close} aria-label="Đóng">✕</button>
      <div className={styles.viewerRow}>
        <button className={styles.navBtn} onClick={() => startSlide(computePrev(), 'prev')} aria-label="Trước">‹</button>

        <div className={styles.storyShell}>
          <div className={styles.storyCard}>
            <div className={styles.progressRow}>
              {bars.map((v, idx) => (
                <div key={idx} className={styles.barTrack}>
                  <div className={styles.barFill} style={{ transform: `scaleX(${v})` }} />
                </div>
              ))}
            </div>

            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <img className={styles.headerAvatar} src={avatarOf(currentGroup.username, currentGroup.avatarUrl)} alt="" />
                <div className={styles.headerMeta}>
                  <div className={styles.headerUserRow}>
                    <span className={styles.headerUser}>{currentGroup.username}</span>
                    <span className={styles.headerTime}>{timeLabel(currentItem.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className={styles.headerActions}>
                <button className={styles.circleBtn} onClick={() => setMuted((value) => !value)} aria-label="Âm thanh">
                  {muted ? '🔇' : '🔊'}
                </button>
                <button className={styles.circleBtn} onClick={() => setPaused((value) => !value)} aria-label="Tạm dừng">
                  {paused ? '▶' : '❚❚'}
                </button>
                <div className={styles.menuWrap} ref={menuRef}>
                  <button className={styles.circleBtn} onClick={() => setMenuOpen((value) => !value)} aria-label="Tùy chọn">⋯</button>
                  {menuOpen ? (
                    <div className={styles.menu}>
                      {isOwner ? (
                        <button className={styles.menuDanger} onClick={handleDelete}>Xóa story</button>
                      ) : (
                        <button className={styles.menuItem} onClick={handleHide}>Ẩn story này</button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div
              className={styles.content}
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                const x = e.clientX - rect.left
                if (x < rect.width * 0.28) startSlide(computePrev(), 'prev')
                else if (x > rect.width * 0.72) startSlide(computeNext(), 'next')
              }}
            >
              <div
                className={[styles.slideStage, dir === 'next' ? styles.dirNext : styles.dirPrev, phase === 'run' ? styles.run : '']
                  .filter(Boolean)
                  .join(' ')}
                style={{ ['--slideMs' as never]: `${SLIDE_MS}ms` }}
              >
                <div className={styles.paneCurrent}>{renderMedia(currentItem)}</div>
                {incoming ? <div className={styles.paneIncoming}>{renderMedia(incoming.item)}</div> : null}
              </div>
            </div>

            <div className={styles.footer}>
              {isOwner ? (
                <div className={styles.ownerSpacer} />
              ) : (
                <>
                  <input
                    className={styles.replyBox}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={`Trả lời ${currentGroup.username}...`}
                  />
                  <button className={styles.footerIcon} onClick={handleLike} aria-label="Thích story">
                    {currentItem.likedByMe ? '♥' : '♡'}
                  </button>
                  <button className={styles.footerIcon} onClick={handleReply} aria-label="Gửi phản hồi">↗</button>
                </>
              )}
            </div>
          </div>

          {sideGroups.length ? (
            <div className={styles.sideRail}>
              {sideGroups.map(({ group, index }) => (
                <button key={group.id} className={styles.sideCard} onClick={() => startSlide({ groupIndex: index, itemIndex: 0 }, 'next')}>
                  <div className={styles.sideOverlay} />
                  <img className={styles.sideMedia} src={group.stories[0]?.thumbnailUrl || group.stories[0]?.mediaUrl} alt={group.username} />
                  <div className={styles.sideMeta}>
                    <img className={styles.sideAvatar} src={avatarOf(group.username, group.avatarUrl)} alt="" />
                    <div className={styles.sideUser}>{group.username}</div>
                    <div className={styles.sideTime}>{timeLabel(group.stories[0]?.createdAt)}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button className={styles.navBtn} onClick={() => startSlide(computeNext(), 'next')} aria-label="Sau">›</button>
      </div>
    </div>
  )
}
