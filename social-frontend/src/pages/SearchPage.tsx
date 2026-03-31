import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUsersApi, type UserSummary } from '../features/users/users.api'
import styles from './SearchPage.module.css'

function avatarOf(user?: Pick<UserSummary, 'avatarUrl' | 'username'> | null) {
  if (user?.avatarUrl) return user.avatarUrl
  const seed = encodeURIComponent(user?.username || 'user')
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`
}

function normalize(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function matchUser(user: UserSummary, query: string) {
  const keyword = normalize(query)
  if (!keyword) return true
  const username = normalize(user.username)
  const bio = normalize(user.bio)
  const email = normalize(user.email)
  return username.includes(keyword) || bio.includes(keyword) || email.includes(keyword)
}

function scoreUser(user: UserSummary, query: string) {
  const keyword = normalize(query)
  if (!keyword) return 0
  const username = normalize(user.username)
  const bio = normalize(user.bio)
  const email = normalize(user.email)
  let score = 0
  if (username === keyword) score += 1000
  if (username.startsWith(keyword)) score += 600
  if (username.includes(keyword)) score += 320
  if (bio.startsWith(keyword)) score += 150
  if (bio.includes(keyword)) score += 90
  if (email.startsWith(keyword)) score += 120
  if (email.includes(keyword)) score += 70
  return score
}

export default function SearchPage() {
  const api = useUsersApi()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<UserSummary[]>([])
  const [error, setError] = useState('')

  const handleClose = () => {
    if (window.history.length > 1 && location.key !== 'default') {
      navigate(-1)
      return
    }
    navigate('/')
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const items = await api.getAllUsers()
        if (!mounted) return
        setUsers(items)
      } catch (err: any) {
        if (!mounted) return
        setError(err?.message || 'Không tải được danh sách người dùng')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const results = useMemo(() => {
    const keyword = normalize(query)
    return [...users]
      .filter((user) => matchUser(user, keyword))
      .sort((a, b) => {
        const scoreDiff = scoreUser(b, keyword) - scoreUser(a, keyword)
        if (scoreDiff !== 0) return scoreDiff
        return a.username.localeCompare(b.username, 'vi')
      })
      .slice(0, 50)
  }, [users, query])

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <section className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h1 className={styles.title}>Tìm kiếm</h1>
          <button type="button" className={styles.closeBtn} onClick={handleClose}>
            ×
          </button>
        </div>

        <div className={styles.searchBox}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm kiếm"
            className={styles.input}
            autoFocus
          />
          {query ? (
            <button type="button" className={styles.clearBtn} onClick={() => setQuery('')}>
              ×
            </button>
          ) : null}
        </div>

        <div className={styles.list}>
          {loading ? <div className={styles.state}>Đang tải người dùng...</div> : null}
          {!loading && error ? <div className={styles.state}>{error}</div> : null}
          {!loading && !error && !results.length ? <div className={styles.state}>Không tìm thấy người dùng phù hợp.</div> : null}

          {!loading && !error
            ? results.map((user) => (
                <button
                  key={user._id}
                  type="button"
                  className={styles.item}
                  onClick={() => navigate(`/profile/${encodeURIComponent(user.username)}`)}
                >
                  <img className={styles.avatar} src={avatarOf(user)} alt={user.username} />
                  <div className={styles.meta}>
                    <div className={styles.username}>{user.username}</div>
                    <div className={styles.subtext}>{user.bio || user.email || 'Người dùng Instagram clone'}</div>
                  </div>
                </button>
              ))
            : null}
        </div>
      </section>
    </div>
  )
}
