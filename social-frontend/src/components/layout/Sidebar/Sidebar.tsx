import { type ReactNode, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import styles from './Sidebar.module.css'
import { useAuth } from '../../../features/auth/AuthProvider'
import { useNotifications } from '../../../features/notifications/NotificationProvider'

type NavItem = {
  to: string
  label: string
  icon: ReactNode
}

function Icon({ children }: { children: ReactNode }) {
  return <span className={styles.icon}>{children}</span>
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { unreadCount } = useNotifications()
  const navigate = useNavigate()

  const profileSlug = useMemo(() => {
    const raw = user?.displayName || user?.email?.split('@')[0] || 'user'
    return encodeURIComponent(raw)
  }, [user])

  const items: NavItem[] = [
    { to: '/', label: 'Trang chủ', icon: <Icon>🏠</Icon> },
    { to: '/reels', label: 'Reels', icon: <Icon>🎬</Icon> },
    { to: '/messages', label: 'Tin nhắn', icon: <Icon>✉️</Icon> },
    { to: '/search', label: 'Tìm kiếm', icon: <Icon>🔎</Icon> },
    { to: '/explore', label: 'Khám phá', icon: <Icon>🧭</Icon> },
    { to: '/notifications', label: 'Thông báo', icon: <Icon>🤍</Icon> },
    { to: '/create', label: 'Tạo', icon: <Icon>➕</Icon> },
    { to: `/profile/${profileSlug}`, label: 'Trang cá nhân', icon: <Icon>👤</Icon> },
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className={styles.sidebar} aria-label="Sidebar">
      <div className={styles.logoRow}>
        <div className={styles.logoIcon}>T</div>
      </div>

      <nav className={styles.nav}>
        {items.map((it) => (
          <NavLink
            key={it.label}
            to={it.to}
            className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
            title={it.label}
          >
            <span className={styles.iconWrap}>
              {it.icon}
              {it.to === '/notifications' && unreadCount > 0 ? (
                <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
              ) : null}
            </span>
            <span className={styles.label}>{it.label}</span>
          </NavLink>
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
