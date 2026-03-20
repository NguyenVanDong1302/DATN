import { useEffect, useState } from 'react'
import { useSocket } from '../state/socket'

export default function NotificationsPage() {
  const { socket } = useSocket()
  const [items, setItems] = useState<string[]>([])

  useEffect(() => {
    if (!socket) return

    const push = (label: string, payload: any) => {
      setItems((prev) => [`${label}: ${JSON.stringify(payload)}`, ...prev].slice(0, 50))
    }

    const n1 = (p: any) => push('notify', p)
    const n2 = (p: any) => push('post:like', p)
    const n3 = (p: any) => push('post:comment', p)
    const n4 = (p: any) => push('notification:new', p)

    socket.on('notify', n1)
    socket.on('post:like', n2)
    socket.on('post:comment', n3)
    socket.on('notification:new', n4)

    return () => {
      socket.off('notify', n1)
      socket.off('post:like', n2)
      socket.off('post:comment', n3)
      socket.off('notification:new', n4)
    }
  }, [socket])

  return (
    <div className="card">
      <div className="row">
        <strong>Notifications</strong>
        <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={() => setItems([])}>Clear</button>
      </div>

      <div className="muted" style={{ marginTop: 8 }}>
        Realtime events từ socket sẽ hiện ở đây.
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((t, i) => (
          <div key={i} className="card" style={{ background: 'var(--card2)' }}>{t}</div>
        ))}
        {!items.length && <div className="muted">Chưa có thông báo.</div>}
      </div>
    </div>
  )
}
