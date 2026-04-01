import { type ReactNode, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import styles from './Sidebar.module.css'
import { useAuth } from '../../../features/auth/AuthProvider'
import { useNotifications } from '../../../features/notifications/NotificationProvider'
import { useMessageIndicator } from '../../../features/messages/MessageIndicatorProvider'
import { useAppStore } from '../../../state/store'

type NavItem = {
  to?: string
  label: string
  icon: ReactNode
  action?: () => void
}

function Icon({ children }: { children: ReactNode }) {
  return <span className={styles.icon}>{children}</span>
}

export default function Sidebar({ onToggleNotifications, onToggleSearch, notificationsOpen = false, searchOpen = false }: { onToggleNotifications?: () => void; onToggleSearch?: () => void; notificationsOpen?: boolean; searchOpen?: boolean }) {
  const { user, logout } = useAuth()
  const { unreadCount } = useNotifications()
  const { unreadConversations } = useMessageIndicator()
  const { state, setState } = useAppStore()
  const navigate = useNavigate()

  const profileSlug = useMemo(() => {
    const raw = state.username || user?.displayName || user?.email?.split('@')[0] || 'user'
    return encodeURIComponent(raw)
  }, [state.username, user])

  const items: NavItem[] = [
    { to: '/', label: 'Trang chủ', icon: <Icon>🏠</Icon> },
    { to: '/reels', label: 'Reels', icon: <Icon>🎬</Icon> },
    { to: '/messages', label: 'Tin nhắn', icon: <Icon>✉️</Icon> },
    { label: 'Tìm kiếm', icon: <Icon>🔎</Icon>, action: onToggleSearch },
    { to: '/explore', label: 'Khám phá', icon: <Icon>🧭</Icon> },
    { label: 'Thông báo', icon: <Icon>{notificationsOpen ? '❤️' : '🤍'}</Icon>, action: onToggleNotifications },
    { to: '/create', label: 'Tạo', icon: <Icon>➕</Icon> },
    { to: `/profile/${profileSlug}`, label: 'Trang cá nhân', icon: <Icon>👤</Icon> },
  ]

  const handleLogout = async () => {
    try {
      if (user) await logout()
    } catch {
      // ignore firebase logout error when using backend auth only
    }
    setState({ username: '', token: '' })
    navigate('/login', { replace: true })
  }

  return (
    <aside className={styles.sidebar} aria-label="Sidebar">
      <div className={styles.logoRow}>
        <div className={styles.logoIcon}>T</div>
      </div>

      <nav className={styles.nav}>
        
{items.map((it) => (
  it.to ? (
    <NavLink
      key={it.label}
      to={it.to}
      className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
      title={it.label}
    >
      <span className={styles.iconWrap}>
        {it.icon}
        {it.to === '/messages' && unreadConversations > 0 ? <span className={styles.badge}>{unreadConversations > 99 ? '99+' : unreadConversations}</span> : null}
      </span>
      <span className={styles.label}>{it.label}</span>
    </NavLink>
  ) : (
    <button key={it.label} type="button" className={`${styles.itemBtn} ${((it.label === 'Thông báo' && notificationsOpen) || (it.label === 'Tìm kiếm' && searchOpen)) ? styles.active : ''}`} title={it.label} onClick={it.action}>
      <span className={styles.iconWrap}>
        {it.icon}
        {it.label === 'Thông báo' && unreadCount > 0 ? <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </span>
      <span className={styles.label}>{it.label}</span>
    </button>
  )
))}

      </nav>

      <div className={styles.bottom}>
        <button className={styles.itemBtn} type="button" title="Xem thêm">
          <span className={styles.icon}>≡</span>
          <span className={styles.label}>Xem thêm</span>
        </button>

        <button className={styles.itemBtn} type="button" title="Đăng xuất" onClick={handleLogout}>
          <span className={styles.icon}>↪</span>
          <span className={styles.label}>Đăng xuất</span>
        </button>
      </div>
    </aside>
  )
}
