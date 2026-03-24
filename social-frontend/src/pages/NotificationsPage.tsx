import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../features/notifications/NotificationProvider'
import type { NotificationItem } from '../features/notifications/notifications.types'

function getTitle(item: NotificationItem) {
  const names = item.actorUsernames?.length ? item.actorUsernames : ['Ai đó']
  const first = names[0]
  const extra = Math.max((item.actorsCount || names.length || 1) - 1, 0)
  const actorText = extra > 0 ? `${first} và ${extra} người khác` : first

  switch (item.type) {
    case 'like':
      return `${actorText} đã thích bài viết của bạn`
    case 'comment':
      return `${actorText} đã bình luận về bài viết của bạn`
    case 'reply':
      return `${actorText} đã trả lời bình luận của bạn`
    case 'comment_like':
      return `${actorText} đã thích bình luận của bạn`
    default:
      return 'Bạn có thông báo mới'
  }
}

export default function NotificationsPage() {
  const nav = useNavigate()
  const { items, unreadCount, loading, refresh, markRead, markUnread, markAllRead } = useNotifications()
  const [tab, setTab] = useState<'all' | 'unread'>('all')

  const filtered = useMemo(() => (tab === 'unread' ? items.filter((item) => !item.isRead) : items), [items, tab])

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Thông báo</div>
          <div className="muted">{unreadCount} thông báo chưa đọc</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" type="button" onClick={() => refresh(tab === 'unread')} disabled={loading}>Làm mới</button>
          <button className="btn" type="button" onClick={markAllRead} disabled={!unreadCount}>Đọc tất cả</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="button" onClick={() => setTab('all')} style={{ opacity: tab === 'all' ? 1 : 0.65 }}>Tất cả</button>
        <button className="btn" type="button" onClick={() => setTab('unread')} style={{ opacity: tab === 'unread' ? 1 : 0.65 }}>Chưa đọc</button>
      </div>

      {loading && !items.length ? <div className="muted">Đang tải thông báo...</div> : null}
      {!loading && !filtered.length ? <div className="muted">Chưa có thông báo nào.</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((item) => (
          <div
            key={item._id}
            className="card"
            style={{
              border: item.isRead ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255, 76, 96, 0.25)',
              background: item.isRead ? 'var(--card)' : 'linear-gradient(180deg, rgba(255,244,246,1), rgba(255,255,255,1))',
              transition: 'transform 180ms ease, box-shadow 180ms ease',
            }}
          >
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: 999, background: item.isRead ? '#d0d0d0' : '#ff4d67', marginTop: 7 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{getTitle(item)}</div>
                {item.latestContentPreview ? (
                  <div className="muted" style={{ marginTop: 6 }}>
                    “{item.latestContentPreview}”
                  </div>
                ) : null}
                <div className="muted" style={{ marginTop: 8 }}>
                  {item.lastEventAt ? new Date(item.lastEventAt).toLocaleString() : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn" type="button" onClick={() => nav(`/post/${item.postId}`)}>Xem bài viết</button>
                {item.isRead ? (
                  <button className="btn" type="button" onClick={() => markUnread(item._id)}>Đánh dấu chưa đọc</button>
                ) : (
                  <button className="btn" type="button" onClick={() => markRead(item._id)}>Đánh dấu đã đọc</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
