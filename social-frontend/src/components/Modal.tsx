import React, { createContext, useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

type Mode = 'normal' | 'fullscreen'

type Ctx = {
  open: (node: React.ReactNode) => void
  openFullscreen: (node: React.ReactNode) => void
  close: () => void
}

const ModalCtx = createContext<Ctx | null>(null)

export function useModal() {
  const ctx = useContext(ModalCtx)
  if (!ctx) throw new Error('useModal must be used within <ModalProvider>')
  return ctx
}

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [node, setNode] = useState<React.ReactNode | null>(null)
  const [mode, setMode] = useState<Mode>('normal')

  const close = () => setNode(null)

  const open = (n: React.ReactNode) => {
    setMode('normal')
    setNode(n)
  }

  const openFullscreen = (n: React.ReactNode) => {
    setMode('fullscreen')
    setNode(n)
  }

  const value = useMemo(() => ({ open, openFullscreen, close }), [])

  return (
    <ModalCtx.Provider value={value}>
      {children}
      <ModalHost node={node} mode={mode} onClose={close} />
    </ModalCtx.Provider>
  )
}

function ModalHost({
  node,
  mode,
  onClose,
}: {
  node: React.ReactNode | null
  mode: Mode
  onClose: () => void
}) {
  if (!node) return null

  const overlay = (
    <div
      className={mode === 'fullscreen' ? styles.fullscreenOverlay : styles.overlay}
      onMouseDown={(e) => {
        if (mode === 'normal' && e.target === e.currentTarget) onClose()
      }}
    >
      {mode === 'normal' ? (
        <div className={styles.modal}>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Dong popup">
            {'\u00D7'}
          </button>
          <div className={styles.body}>{node}</div>
        </div>
      ) : (
        <>{node}</>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}
