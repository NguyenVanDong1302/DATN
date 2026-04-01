import { useEffect, useRef, useState } from 'react'
import styles from './StoriesBar.module.css'
import { useModal } from '../../../../components/Modal'
import StoryViewer from './StoryViewer'
import { useStoriesApi } from '../../../../features/stories/stories.api'
import type { StoryGroup } from '../../../../features/stories/stories.types'

function avatarOf(story?: StoryGroup | null) {
  if (story?.avatarUrl) return story.avatarUrl
  const seed = encodeURIComponent(story?.username || 'story')
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`
}

export default function StoriesBar() {
  const modal = useModal()
  const api = useStoriesApi()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [stories, setStories] = useState<StoryGroup[]>([])

  useEffect(() => {
    api.list().then(setStories).catch(() => undefined)
  }, [api])

  return (
    <div className={styles.wrap}>
      <button className={styles.storyBtn} onClick={() => fileRef.current?.click()}>
        <div className={styles.story}>
          <div className={styles.ring} style={{ background: '#e9eefc' }}>
            <div className={styles.avatar} style={{ display:'grid', placeItems:'center', background:'#4f46e5', color:'#fff', border:'3px solid #fff' }}>+</div>
          </div>
          <div className={styles.name}>Tin của bạn</div>
        </div>
      </button>
      <input ref={fileRef} hidden type="file" accept="image/*,video/*" onChange={async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        const created = await api.create(file)
        const list = await api.list()
        setStories(list)
        const idx = list.findIndex((entry) => entry.authorId === created.authorId)
        modal.openFullscreen(<StoryViewer groups={list} startGroupIndex={Math.max(idx, 0)} startItemIndex={0} onChanged={setStories} />)
      }} />
      {stories.map((s, index) => (
        <button key={s.id} className={styles.storyBtn} onClick={() => modal.openFullscreen(<StoryViewer groups={stories} startGroupIndex={index} startItemIndex={0} onChanged={setStories} />)}>
          <div className={styles.story}>
            <div className={styles.ring}>
              <img className={styles.avatar} src={avatarOf(s)} alt={s.username} />
            </div>
            <div className={styles.name}>{s.username}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
