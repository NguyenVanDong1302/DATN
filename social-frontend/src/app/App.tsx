import { Outlet, Route, Routes } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import { SocketProvider } from '../state/socket'
import { AppStoreProvider } from '../state/store'
import HomePage from '../pages/Home/HomePage'
import ExplorePage from '../pages/ExplorePage'
import ProfilePage from '../pages/Profile/ProfilePage'
import NotificationsPage from '../pages/NotificationsPage'
import SettingsPage from '../pages/SettingsPage'
import { ToastHost } from '../components/Toast'
import { ModalProvider } from '../components/Modal'
import ReelsPage from '../pages/Reel/Reel'
import MessagesPage from '../pages/Messages/MessagesPage'
import CreatePostPage from '../pages/CreatePostPage'
import PostPage from '../pages/PostPage'
import LoginPage from '../pages/Auth/LoginPage'
import { AuthProvider } from '../features/auth/AuthProvider'
import ProtectedRoute from '../features/auth/ProtectedRoute'

function ProtectedShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}

export default function App() {
  return (
    <AppStoreProvider>
      <AuthProvider>
        <SocketProvider>
          <ModalProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<ProtectedShell />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/explore" element={<ExplorePage />} />
                  <Route path="/profile/:username" element={<ProfilePage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/reels" element={<ReelsPage />} />
                  <Route path="/messages" element={<MessagesPage />} />
                  <Route path="/create" element={<CreatePostPage />} />
                  <Route path="/post/:id" element={<PostPage />} />
                </Route>
              </Route>
            </Routes>
          </ModalProvider>
          <ToastHost />
        </SocketProvider>
      </AuthProvider>
    </AppStoreProvider>
  )
}
