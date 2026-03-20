import React, { createContext, useContext, useMemo, useState } from 'react'

type ToastItem = { id: string; msg: string }
type Ctx = { push: (msg: string) => void }

const ToastCtx = createContext<Ctx>({ push: () => {} })

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = (msg: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setItems((prev) => [{ id, msg }, ...prev].slice(0, 5))
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 3500)
  }

  const value = useMemo(() => ({ push }), [])
  return (
    <ToastCtx.Provider value={value}>
      <div className="toast">
        {items.map((t) => (
          <div key={t.id} className="toastItem">{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
