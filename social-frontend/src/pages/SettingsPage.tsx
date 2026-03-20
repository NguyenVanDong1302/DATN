import { useState } from 'react'
import { useAppStore } from '../state/store'
import { useToast } from '../components/Toast'

export default function SettingsPage() {
  const { state, setState } = useAppStore()
  const toast = useToast()

  const [username, setUsername] = useState(state.username)
  const [token, setToken] = useState(state.token)

  return (
    <div className="card">
      <div className="row">
        <strong>Settings</strong>
        <span className="muted">Account & mode</span>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="muted">X-Username (demo mode)</div>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <button
          className="btn ok"
          style={{ marginTop: 18 }}
          onClick={() => {
            const v = username.trim()
            if (!v) return toast.push('Username rỗng')
            setState({ username: v })
            toast.push('Saved username')
          }}
        >
          Save
        </button>
      </div>

      <div className="muted" style={{ marginTop: 14 }}>
        Nếu bạn dùng JWT thật (api/auth), lưu token vào đây:
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <input className="input" style={{ flex: 1 }} placeholder="Bearer token..." value={token} onChange={(e) => setToken(e.target.value)} />
        <button
          className="btn"
          onClick={() => {
            setState({ token: token.trim() })
            toast.push('Token set')
          }}
        >
          Set token
        </button>
        <button
          className="btn danger"
          onClick={() => {
            setToken('')
            setState({ token: '' })
            toast.push('Token cleared')
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}
