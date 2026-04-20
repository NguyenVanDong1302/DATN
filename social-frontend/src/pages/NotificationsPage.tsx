import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../features/notifications/NotificationProvider'
import type { NotificationItem } from '../features/notifications/notifications.types'
import { combineResponsiveStyles } from '../lib/combineResponsiveStyles'
import styles from './NotificationsPage.module.css'
import desktopStyles from './NotificationsPage.desktop.module.css'
import tabletStyles from './NotificationsPage.tablet.module.css'
import mobileStyles from './NotificationsPage.mobile.module.css'

const FILTERS = [
  { key: 'all', label: 'Tat ca' },
  { key: 'activity', label: 'Tuong tac' },
  { key: 'follow', label: 'Theo doi' },
  { key: 'system', label: 'He thong' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function cx(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ')
}

const responsiveStyles = combineResponsiveStyles(desktopStyles, tabletStyles, mobileStyles)

function relativeTime(value?: string) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.max(1, Math.round(diff / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(value).toLocaleDateString('vi-VN')
}

function splitSections(items: NotificationItem[]) {
  const now = Date.now()
  const recent: NotificationItem[] = []
  const month: NotificationItem[] = []

  for (const item of items) {
    const stamp = new Date(item.lastEventAt || item.createdAt || 0).getTime()
    if (now - stamp <= 1000 * 60 * 60 * 24 * 7) recent.push(item)
    else month.push(item)
  }

  return [
    { title: 'New', items: recent },
    { title: 'This month', items: month },
  ].filter((section) => section.items.length)
}

function matchesFilter(item: NotificationItem, filter: FilterKey) {
  if (filter === 'all') return true
  if (filter === 'activity') return item.type === 'comment' || item.type === 'like'
  if (filter === 'follow') return item.type === 'follow'
  return item.type === 'moderation'
}

function buildLabel(item: NotificationItem) {
  const names = Array.isArray(item.actorUsernames) ? item.actorUsernames.filter(Boolean) : []
  const first = names[0] || 'Ai do'
  const total = Number(item.totalEvents) || names.length || 1
  const others = Math.max(total - 1, 0)

  if (item.type === 'follow') {
    return others > 0 ? `${first} va ${others} nguoi khac da theo doi ban` : `${first} started following you`
  }
  if (item.type === 'like') {
    return others > 0 ? `${first} va ${others} nguoi khac da thich bai viet cua ban` : `${first} liked your post`
  }
  if (item.type === 'moderation') {
    return item.previewText || 'Tai khoan cua ban co cap nhat moderation'
  }
  return others > 0 ? `${first} va ${others} nguoi khac da binh luan bai viet cua ban` : `${first} commented: ${item.previewText || ''}`
}

function getAccentClass(type: string) {
  if (type === 'follow') return styles.avatarFollow
  if (type === 'like') return styles.avatarLike
  if (type === 'moderation') return styles.avatarLike
  return styles.avatarComment
}

function getInitials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'
}

function NotificationRow({ item, onOpen, onToggleRead }: { item: NotificationItem; onOpen: () => void; onToggleRead: () => void }) {
  const names = Array.isArray(item.actorUsernames) ? item.actorUsernames.filter(Boolean) : []
  const first = names[0] || 'Ai do'

  return (
    <div className={`${styles.row} ${!item.isRead ? styles.rowUnread : ''}`}>
      <button type="button" className={`${styles.avatar} ${getAccentClass(item.type)}`} onClick={onOpen}>
        {getInitials(first)}
      </button>

      <button type="button" className={styles.main} onClick={onOpen}>
        <div className={styles.messageText}>
          <strong>{first}</strong>{' '}
          <span>{buildLabel(item).replace(first, '').trim()}</span>
          <span className={styles.time}>{relativeTime(item.lastEventAt || item.createdAt)}</span>
        </div>
        {item.previewText && item.type !== 'follow' ? <div className={styles.preview}>{item.previewText}</div> : null}
      </button>

      <div className={styles.actions}>
        <button
          type="button"
          className={item.isRead ? styles.statusBtn : styles.unreadDot}
          onClick={onToggleRead}
          aria-label={item.isRead ? 'Danh dau chua doc' : 'Danh dau da doc'}
          title={item.isRead ? 'Danh dau chua doc' : 'Danh dau da doc'}
        >
          {item.isRead ? 'Chua doc' : ''}
        </button>
      </div>
    </div>
  )
}

export default function NotificationsPage() {
  const { items, unreadCount, loading, markRead, markUnread, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterKey>('all')

  const visibleItems = useMemo(() => {
    return items.filter((item) => matchesFilter(item, filter))
  }, [items, filter])

  const sections = useMemo(() => splitSections(visibleItems), [visibleItems])

  const openNotification = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await markRead(item._id)
      } catch {
        // ignore
      }
    }

    if (item.type === 'follow') {
      const targetUsername = item.actorUsernames?.[0]
      navigate(targetUsername ? `/profile/${encodeURIComponent(targetUsername)}` : '/search')
      return
    }

    if (item.type === 'moderation') {
      if (item.postId) navigate(`/post/${encodeURIComponent(item.postId)}`)
      return
    }

    if (item.postId || item.targetId) {
      navigate(`/post/${encodeURIComponent(item.postId || item.targetId)}`)
    }
  }

  return (
    <div className={cx(styles.pageOverlay, responsiveStyles.pageOverlay)}>
      <aside className={cx(styles.pagePanel, responsiveStyles.pagePanel)}>
        <div className={cx(styles.pageTop, responsiveStyles.pageTop)}>
          <div className={styles.header}>
            <h1 className={styles.title}>Notifications</h1>
            <button type="button" className={styles.closeBtn} onClick={() => navigate(-1)}>
              ✕
            </button>
          </div>

          <div className={cx(styles.filterRow, responsiveStyles.filterRow)}>
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`${styles.filterBtn} ${filter === entry.key ? styles.filterBtnActive : ''}`}
                onClick={() => setFilter(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className={cx(styles.summaryRow, responsiveStyles.summaryRow)}>
            <span>{loading ? 'Dang tai...' : `${unreadCount} chua doc`}</span>
            <button type="button" className={styles.markAllBtn} onClick={() => markAllRead()} disabled={!unreadCount}>
              Mark all as read
            </button>
          </div>
        </div>

        <div className={cx(styles.content, responsiveStyles.content)}>
          {sections.map((section) => (
            <section key={section.title} className={styles.section}>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              <div className={styles.sectionList}>
                {section.items.map((item) => (
                  <NotificationRow
                    key={item._id}
                    item={item}
                    onOpen={() => openNotification(item)}
                    onToggleRead={() => (item.isRead ? markUnread(item._id) : markRead(item._id))}
                  />
                ))}
              </div>
            </section>
          ))}

          {!loading && !visibleItems.length ? <div className={styles.empty}>Chua co thong bao phu hop.</div> : null}
        </div>
      </aside>
    </div>
  )
}
