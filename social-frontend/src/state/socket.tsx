import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useToast } from '../components/Toast'
import { useAppStore } from './store'

type Ctx = { socket: Socket | null }
const SocketCtx = createContext<Ctx>({ socket: null })

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000')).replace(/\/$/, '')

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const toast = useToast()
  const { state } = useAppStore()

  useEffect(() => {
    if (!state.username) return

    const s = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { username: state.username, token: state.token },
    })
    setSocket(s)

    s.on('connect', () => toast.push('Đã kết nối realtime'))
    s.on('notify', (payload: any) => toast.push(payload?.message || 'Bạn có thông báo mới'))

    return () => {
      s.disconnect()
      setSocket(null)
    }
  }, [state.username, state.token, toast])

  const value = useMemo(() => ({ socket }), [socket])
  return <SocketCtx.Provider value={value}>{children}</SocketCtx.Provider>
}

export function useSocket() {
  return useContext(SocketCtx)
}
