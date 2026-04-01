import { useEffect, useMemo, useRef, useState } from 'react'
import { useModal } from '../../../../components/Modal'
import styles from './StoryViewer.module.css'
import type { StoryGroup } from '../../../../features/stories/stories.types'
import { useStoriesApi } from '../../../../features/stories/stories.api'
import { useMessagesApi } from '../../../../features/messages/messages.api'

const DEFAULT_MS = 7000
const SLIDE_MS = 320

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)) }
function avatarOf(username: string, avatarUrl?: string) {
  if (avatarUrl) return avatarUrl
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(username || 'story')}`
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

type Props = { groups: StoryGroup[]; startGroupIndex: number; startItemIndex: number; onChanged?: (items: StoryGroup[]) => void }

export default function StoryViewer({ groups, startGroupIndex, startItemIndex, onChanged }: Props) {
  const modal = useModal()
  const api = useStoriesApi()
  const messagesApi = useMessagesApi()
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>(groups)
  const [groupIndex, setGroupIndex] = useState(startGroupIndex)
  const [itemIndex, setItemIndex] = useState(startItemIndex)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reply, setReply] = useState('')
  const [muted, setMuted] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'run'>('idle')
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [target, setTarget] = useState<{ groupIndex: number; itemIndex: number } | null>(null)
  const lastTsRef = useRef<number | null>(null)

  useEffect(() => {
    setStoryGroups(groups)
  }, [groups])

  const emitChanged = (items: StoryGroup[]) => {
    setStoryGroups(items)
    onChanged?.(items)
  }

  const currentGroup = storyGroups[clamp(groupIndex, 0, Math.max(storyGroups.length - 1, 0))]
  const currentItem = currentGroup?.stories?.[clamp(itemIndex, 0, Math.max((currentGroup?.stories?.length || 1) - 1, 0))]
  const incoming = useMemo(() => {
    if (!target) return null
    const g = storyGroups[clamp(target.groupIndex, 0, storyGroups.length - 1)]
    const it = g?.stories?.[clamp(target.itemIndex, 0, (g?.stories?.length || 1) - 1)]
    return g && it ? { group: g, item: it } : null
  }, [target, storyGroups])

  const bars = useMemo(() => (currentGroup?.stories || []).map((_, idx) => idx < itemIndex ? 1 : idx === itemIndex ? progress : 0), [currentGroup, itemIndex, progress])

  const computeNext = () => {
    if (!currentGroup) return null
    if (itemIndex < currentGroup.stories.length - 1) return { groupIndex, itemIndex: itemIndex + 1 }
    if (groupIndex < storyGroups.length - 1) return { groupIndex: groupIndex + 1, itemIndex: 0 }
    return null
  }
  const computePrev = () => {
    if (!currentGroup) return null
    if (itemIndex > 0) return { groupIndex, itemIndex: itemIndex - 1 }
    if (groupIndex > 0) {
      const prev = storyGroups[groupIndex - 1]
      return { groupIndex: groupIndex - 1, itemIndex: Math.max(0, prev.stories.length - 1) }
    }
    return { groupIndex, itemIndex: 0 }
  }

  const startSlide = (nextTarget: { groupIndex: number; itemIndex: number } | null, nextDir: 'next' | 'prev') => {
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
    }, SLIDE_MS)
  }

  useEffect(() => {
    let raf = 0
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts
      if (!paused && !target && currentItem) {
        setProgress((prev) => {
          const next = prev + dt / (currentItem.mediaType === 'video' ? 10000 : DEFAULT_MS)
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
    return () => cancelAnimationFrame(raf)
  }, [paused, target, currentItem, groupIndex, itemIndex, storyGroups])

  const renderMedia = (item?: typeof currentItem) => {
    if (!item) return null
    if (item.mediaType === 'video') return <video className={styles.media} src={item.mediaUrl} poster={item.thumbnailUrl} autoPlay playsInline muted={muted} />
    return <img className={styles.media} src={item.mediaUrl} alt="story" draggable={false} />
  }

  const handleLike = async () => {
    if (!currentItem) return
    const optimisticLiked = !currentItem.likedByMe
    const optimisticCount = Math.max(0, (currentItem.likesCount || 0) + (optimisticLiked ? 1 : -1))
    const optimisticGroups = storyGroups.map((group, gi) => gi !== groupIndex ? group : ({
      ...group,
      stories: group.stories.map((story, si) => si !== itemIndex ? story : ({ ...story, likedByMe: optimisticLiked, likesCount: optimisticCount })),
    }))
    emitChanged(optimisticGroups)

    try {
      const result = await api.toggleLike(currentItem.id)
      const confirmedGroups = optimisticGroups.map((group, gi) => gi !== groupIndex ? group : ({
        ...group,
        stories: group.stories.map((story, si) => si !== itemIndex ? story : ({ ...story, likedByMe: result.liked, likesCount: result.likesCount })),
      }))
      emitChanged(confirmedGroups)
    } catch {
      emitChanged(storyGroups)
    }
  }

  const handleReply = async () => {
    if (!currentItem || !currentGroup) return
    const conversation = await messagesApi.createDirectConversation(currentGroup.authorId)
    await messagesApi.sendMessageHttp(conversation.id, reply.trim() || '❤️', {
      storyId: currentItem.id,
      ownerUsername: currentGroup.username,
      mediaType: currentItem.mediaType,
      mediaUrl: currentItem.mediaUrl,
      thumbnailUrl: currentItem.thumbnailUrl,
    })
    setReply('')
  }

  return (
    <div className={styles.stage}>
      <button className={styles.closeBtn} onClick={modal.close}>✕</button>
      <div className={styles.viewerRow}>
        <button className={styles.navBtn} onClick={() => startSlide(computePrev(), 'prev')}>‹</button>
        <div className={styles.storyCard}>
          <div className={styles.progressRow}>{bars.map((v, idx) => <div key={idx} className={styles.barTrack}><div className={styles.barFill} style={{ transform:`scaleX(${v})` }} /></div>)}</div>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <img className={styles.headerAvatar} src={avatarOf(currentGroup?.username || '', currentGroup?.avatarUrl)} alt="" />
              <div className={styles.headerMeta}><div className={styles.headerUserRow}><span className={styles.headerUser}>{currentGroup?.username}</span><span className={styles.headerTime}>{timeLabel(currentItem?.createdAt)}</span></div></div>
            </div>
            {currentItem?.mediaType === 'video' ? <button className={styles.soundBtn} onClick={() => setMuted((v) => !v)}>{muted ? '🔇' : '🔊'}</button> : null}
          </div>
          <div className={styles.content} onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            const x = e.clientX - rect.left
            if (x < rect.width * 0.33) startSlide(computePrev(), 'prev')
            else if (x > rect.width * 0.66) startSlide(computeNext(), 'next')
          }}>
            <div className={[styles.slideStage, dir === 'next' ? styles.dirNext : styles.dirPrev, phase === 'run' ? styles.run : ''].join(' ')} style={{ ['--slideMs' as any]: `${SLIDE_MS}ms` }}>
              <div className={styles.paneCurrent}>{renderMedia(currentItem)}</div>
              {incoming ? <div className={styles.paneIncoming}>{renderMedia(incoming.item)}</div> : null}
            </div>
          </div>
          <div className={styles.footer}>
            <input className={styles.replyBox as any} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Trả lời ${currentGroup?.username}...`} />
            <button className={styles.iconBtn} onClick={handleLike}>{currentItem?.likedByMe ? '♥' : '♡'}</button>
            <button className={styles.iconBtn} onClick={handleReply}>↗</button>
          </div>
        </div>
        <button className={styles.navBtn} onClick={() => startSlide(computeNext(), 'next')}>›</button>
      </div>
    </div>
  )
}
