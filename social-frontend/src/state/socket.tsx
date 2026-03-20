import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useToast } from '../components/Toast'

type Ctx = { socket: Socket | null }
const SocketCtx = createContext<Ctx>({ socket: null })

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const toast = useToast()

  useEffect(() => {
    const s = io()
    setSocket(s)

    s.on('connect', () => toast.push('Socket connected'))
    s.on('notify', () => toast.push('notify'))
    s.on('post:like', () => toast.push('post:like'))
    s.on('post:comment', () => toast.push('post:comment'))
    s.on('notification:new', () => toast.push('notification:new'))

    return () => {
      s.disconnect()
      setSocket(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo(() => ({ socket }), [socket])
  return <SocketCtx.Provider value={value}>{children}</SocketCtx.Provider>
}

export function useSocket() {
  return useContext(SocketCtx)
}
