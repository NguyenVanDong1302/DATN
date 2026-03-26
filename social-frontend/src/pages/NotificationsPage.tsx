import { useMemo, useState } from 'react'
import { useNotifications } from '../features/notifications/NotificationProvider'

function formatTime(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('vi-VN')
}

function buildLabel(item: any) {
  const names = Array.isArray(item.actorUsernames) ? item.actorUsernames.filter(Boolean) : []
  const first = names[0] || 'Ai đó'
  const total = Number(item.totalEvents) || names.length || 1
  const others = Math.max(total - 1, 0)

  if (item.type === 'like') {
    return others > 0 ? `${first} và ${others} người khác đã thích bài viết của bạn.` : `${first} đã thích bài viết của bạn.`
  }

  return others > 0 ? `${first} và ${others} người khác đã bình luận về bài viết của bạn.` : `${first} đã bình luận về bài viết của bạn.`
}

export default function NotificationsPage() {
  const { items, unreadCount, loading, markRead, markUnread, markAllRead } = useNotifications()
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)

  const visibleItems = useMemo(() => (showUnreadOnly ? items.filter((item) => !item.isRead) : items), [items, showUnreadOnly])

  return (
    <div className="card">
      <div className="row">
        <strong>Thông báo</strong>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" type="button" onClick={() => setShowUnreadOnly((value) => !value)}>
            {showUnreadOnly ? 'Hiện tất cả' : `Chỉ chưa đọc (${unreadCount})`}
          </button>
          <button className="btn" type="button" onClick={() => markAllRead()}>Đánh dấu đã đọc</button>
        </div>
      </div>

      <div className="muted" style={{ marginTop: 8 }}>
        {loading ? 'Đang tải...' : `Bạn có ${unreadCount} thông báo chưa đọc.`}
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleItems.map((item) => (
          <div
            key={item._id}
            className="card"
            style={{ background: item.isRead ? 'var(--card2)' : '#fff5f7', border: item.isRead ? '1px solid var(--line)' : '1px solid #ffc2d1' }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{buildLabel(item)}</div>
                {item.previewText ? <div className="muted" style={{ marginTop: 6 }}>{item.previewText}</div> : null}
                <div className="muted" style={{ marginTop: 6 }}>{formatTime(item.lastEventAt || item.createdAt)}</div>
              </div>
              <button className="btn" type="button" onClick={() => (item.isRead ? markUnread(item._id) : markRead(item._id))}>
                {item.isRead ? 'Chưa đọc' : 'Đã đọc'}
              </button>
            </div>
          </div>
        ))}
        {!loading && !visibleItems.length && <div className="muted">Chưa có thông báo.</div>}
      </div>
    </div>
  )
}
