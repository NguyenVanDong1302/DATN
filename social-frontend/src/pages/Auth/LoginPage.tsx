import { useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '../../features/auth/AuthProvider'
import { useApi } from '../../lib/api'
import { useAppStore } from '../../state/store'
import styles from './LoginPage.module.css'

type LocationState = {
  from?: { pathname?: string }
}

const photoLeft = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=700&q=80'
const photoCenter = 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80'
const photoRight = 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=700&q=80'
const photoProfile = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80'

function getFirebaseMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/popup-closed-by-user':
        return 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.'
      case 'auth/popup-blocked':
        return 'Trình duyệt đang chặn popup. Hãy cho phép popup rồi thử lại.'
      case 'auth/unauthorized-domain':
        return 'Domain hiện tại chưa được thêm vào danh sách Authorized domains của Firebase.'
      default:
        return error.message
    }
  }
  return 'Đăng nhập thất bại. Vui lòng thử lại.'
}

export default function LoginPage() {
  const api = useApi()
  const { setState, state } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loginWithGoogle, configError } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formState, setFormState] = useState({ email: '', password: '' })

  const redirectTo = useMemo(() => {
    const state = location.state as LocationState | null
    return state?.from?.pathname || '/'
  }, [location.state])

  if (user || (state.username && state.token)) {
    return <Navigate to={redirectTo} replace />
  }

  const onGoogleLogin = async () => {
    setError('')
    setIsSubmitting(true)
    try {
      await loginWithGoogle()
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(getFirebaseMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onSubmitBackend = async () => {
    setError('')
    setIsSubmitting(true)
    try {
      const res = await api.post('/auth/login', formState)
      const token = res?.data?.token || ''
      const username = res?.data?.user?.username || ''
      const role = res?.data?.user?.role === 'admin' ? 'admin' : 'user'
      setState({ username, token, role })
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      setError(err?.message || 'Đăng nhập thất bại')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <section className={styles.visual}>
          <div className={styles.logo} aria-hidden="true" />
          <div className={styles.visualInner}>
            <div className={styles.hero}>
              <h1>Hãy xem các khoảnh khắc thường ngày của <span className={styles.highlightWarm}>bạn</span> <span className={styles.highlightPink}>thân nhé.</span></h1>
            </div>
            <div className={styles.stack} aria-hidden="true">
              <div className={styles.card}><img className={styles.photo} src={photoLeft} alt="" /><div className={styles.storyBar} /></div>
              <div className={styles.cardCenter}><img className={styles.photo} src={photoCenter} alt="" /><div className={styles.storyBar} /><div className={styles.reactionBubble}>🔮👀🥳</div><div className={styles.bottomInput} /><div className={styles.bottomIcons}>♡</div></div>
              <div className={styles.cardRight}><img className={styles.photo} src={photoRight} alt="" /><div className={styles.likeBubble}>💗</div></div>
              <div className={styles.profileBubble}><img src={photoProfile} alt="Profile highlight" /></div>
            </div>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.formWrap}>
            <div className={styles.formHeader}><button type="button" className={styles.backBtn} onClick={() => navigate(-1)} aria-label="Quay lại">‹</button><div>Đăng nhập vào Instagram</div></div>
            <div className={styles.form}>
              {configError ? <div className={styles.error}>{configError}</div> : null}
              {error ? <div className={styles.error}>{error}</div> : null}
              <input className={styles.input} placeholder="Email" value={formState.email} onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))} />
              <input className={styles.input} type="password" placeholder="Mật khẩu" value={formState.password} onChange={(e) => setFormState((prev) => ({ ...prev, password: e.target.value }))} />
              <button type="button" className={styles.primaryBtn} onClick={onSubmitBackend} disabled={isSubmitting}>Đăng nhập</button>
              <div className={styles.links}>
                <button type="button" className={styles.textLink}>Quên mật khẩu?</button>
                <button type="button" className={styles.facebookBtn}>Đăng nhập bằng Facebook</button>
                <button type="button" className={styles.outlineBtn} onClick={() => navigate('/register')}>Tạo tài khoản mới</button>
              </div>
              <button type="button" className={styles.googleBtn} onClick={onGoogleLogin} disabled={isSubmitting || Boolean(configError)}>
                {isSubmitting ? 'Đang kết nối...' : 'Tiếp tục với Google'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
