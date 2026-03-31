import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useAppStore } from '../../state/store'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const { state } = useAppStore()
  const location = useLocation()

  const hasBackendSession = Boolean(state.username && state.token)

  if (loading && !hasBackendSession) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontSize: 16,
          fontWeight: 600,
          color: '#737373',
          background: '#ffffff',
        }}
      >
        Đang kiểm tra phiên đăng nhập...
      </div>
    )
  }

  if (!user && !hasBackendSession) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
