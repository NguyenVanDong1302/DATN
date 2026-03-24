import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useToast } from '../components/Toast'
import { useAppStore } from './store'

type Ctx = { socket: Socket | null }
const SocketCtx = createContext<Ctx>({ socket: null })

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const toast = useToast()
  const { state } = useAppStore()

  useEffect(() => {
    if (!state.username) return

    const s = io({ auth: { username: state.username } })
    setSocket(s)

    s.on('connect', () => toast.push('Kết nối realtime thành công'))
    s.on('connect_error', () => toast.push('Realtime đang gặp lỗi kết nối'))

    return () => {
      s.disconnect()
      setSocket(null)
    }
  }, [state.username, toast])

  const value = useMemo(() => ({ socket }), [socket])
  return <SocketCtx.Provider value={value}>{children}</SocketCtx.Provider>
}

export function useSocket() {
  return useContext(SocketCtx)
}
