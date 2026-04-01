import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUsersApi, type UserSummary } from '../../features/users/users.api'
import styles from '../../pages/NotificationsPage.module.css'

function avatarOf(user?: Pick<UserSummary, 'avatarUrl' | 'username'> | null) {
  if (user?.avatarUrl) return user.avatarUrl
  const seed = encodeURIComponent(user?.username || 'user')
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`
}
function normalize(value?: string | null) { return String(value || '').trim().toLowerCase() }
function score(user: UserSummary, query: string) {
  const keyword = normalize(query)
  if (!keyword) return 0
  const fields = [normalize(user.username), normalize(user.bio), normalize(user.email)]
  let value = 0
  if (fields[0] === keyword) value += 1000
  if (fields[0].startsWith(keyword)) value += 700
  if (fields[0].includes(keyword)) value += 350
  if (fields[1].includes(keyword)) value += 150
  if (fields[2].includes(keyword)) value += 120
  return value
}

export default function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useUsersApi()
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open || users.length) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const items = await api.getAllUsers()
        if (mounted) setUsers(items)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [open, api, users.length])

  const filtered = useMemo(() => {
    const keyword = normalize(query)
    return [...users]
      .filter((user) => !keyword || score(user, keyword) > 0)
      .sort((a,b) => score(b, keyword)-score(a, keyword) || a.username.localeCompare(b.username, 'vi'))
      .slice(0, 30)
  }, [users, query])

  if (!open) return null
  return (
    <div className={styles.overlayFixed} onClick={onClose}>
      <aside className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}><h1 className={styles.title}>Tìm kiếm</h1><button type="button" className={styles.closeBtn} onClick={onClose}>×</button></div>
        <div className={styles.searchBox} style={{ padding: '0 24px 8px' }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm kiếm" className={styles.searchInput || ''} style={{ width:'100%', height:44, borderRadius:12, border:'none', outline:'none', boxShadow:'none', background:'#f2f3f5', padding:'0 14px' }} autoFocus />
        </div>
        <div className={styles.sections}>
          {loading ? <div className={styles.sectionTitle}>Đang tải...</div> : null}
          {!loading && filtered.map((user) => (
            <button key={user._id} type="button" className={styles.row} onClick={() => { onClose(); navigate(`/profile/${encodeURIComponent(user.username)}`) }}>
              <img className={styles.avatar} src={avatarOf(user)} alt={user.username} />
              <div className={styles.main} style={{ textAlign:'left' }}>
                <div className={styles.messageText}><strong>{user.username}</strong></div>
                <div className={styles.preview}>{user.bio || user.email || 'Người dùng'}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>
    </div>
  )
}
