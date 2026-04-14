import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { useUsersApi } from '../features/users/users.api'
import { resolveMediaUrl } from '../lib/api'
import { useAppStore } from '../state/store'
import styles from './SettingsPage.module.css'

const GENDER_OPTIONS = [
  { value: '', label: 'Khong muon tiet lo' },
  { value: 'Nam', label: 'Nam' },
  { value: 'Nu', label: 'Nu' },
  { value: 'Khac', label: 'Khac' },
]

const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/

function fallbackAvatar(username?: string) {
  const seed = encodeURIComponent(username || 'user')
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`
}

export default function SettingsPage() {
  const { state, setState } = useAppStore()
  const usersApi = useUsersApi()
  const toast = useToast()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const avatarObjectUrlRef = useRef('')

  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)

  const [form, setForm] = useState({
    fullName: '',
    website: '',
    bio: '',
    gender: '',
    showThreadsBadge: false,
    showSuggestedAccountsOnProfile: true,
    isPrivateAccount: false,
    showActivityStatus: true,
    avatarUrl: '',
    avatarFile: null as File | null,
  })

  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('')
  const [usernameDraft, setUsernameDraft] = useState('')
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const revokeAvatarPreview = () => {
    if (!avatarObjectUrlRef.current) return
    URL.revokeObjectURL(avatarObjectUrlRef.current)
    avatarObjectUrlRef.current = ''
  }

  useEffect(() => {
    return () => {
      revokeAvatarPreview()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        setLoading(true)
        const profile = await usersApi.getProfile(state.username)
        if (!mounted) return

        revokeAvatarPreview()
        setAvatarPreviewUrl('')
        setForm({
          fullName: profile.fullName || '',
          website: profile.website || '',
          bio: profile.bio || '',
          gender: profile.gender || '',
          showThreadsBadge: Boolean(profile.showThreadsBadge),
          showSuggestedAccountsOnProfile: profile.showSuggestedAccountsOnProfile !== false,
          isPrivateAccount: Boolean(profile.isPrivateAccount),
          showActivityStatus: profile.showActivityStatus !== false,
          avatarUrl: profile.avatarUrl || '',
          avatarFile: null,
        })
        setUsernameDraft(profile.username || state.username)
      } catch (error: any) {
        if (!mounted) return
        toast.push(error?.message || 'Khong tai duoc ho so hien tai')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [state.username, toast, usersApi])

  const avatarSrc = useMemo(() => {
    if (avatarPreviewUrl) return avatarPreviewUrl
    const normalized = resolveMediaUrl(form.avatarUrl)
    return normalized || fallbackAvatar(state.username)
  }, [avatarPreviewUrl, form.avatarUrl, state.username])

  const handleAvatarPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    revokeAvatarPreview()
    const preview = URL.createObjectURL(file)
    avatarObjectUrlRef.current = preview
    setAvatarPreviewUrl(preview)
    setForm((current) => ({ ...current, avatarFile: file }))
  }

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      setSavingProfile(true)
      const nextProfile = await usersApi.updateMyProfile({
        fullName: form.fullName,
        website: form.website,
        bio: form.bio,
        gender: form.gender,
        showThreadsBadge: form.showThreadsBadge,
        showSuggestedAccountsOnProfile: form.showSuggestedAccountsOnProfile,
        isPrivateAccount: form.isPrivateAccount,
        showActivityStatus: form.showActivityStatus,
        avatarFile: form.avatarFile,
      })

      revokeAvatarPreview()
      setAvatarPreviewUrl('')
      setForm((current) => ({
        ...current,
        avatarFile: null,
        avatarUrl: nextProfile.avatarUrl || current.avatarUrl,
      }))

      toast.push('Da cap nhat ho so')
      navigate(`/profile/${encodeURIComponent(nextProfile.username || state.username)}`)
    } catch (error: any) {
      toast.push(error?.message || 'Cap nhat that bai')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleUsernameSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const nextUsername = usernameDraft.trim().toLowerCase()
    if (!nextUsername) {
      toast.push('Vui long nhap username moi')
      return
    }
    if (!USERNAME_PATTERN.test(nextUsername)) {
      toast.push('Username chi gom chu thuong, so, dau gach duoi hoac dau cham (3-30 ky tu)')
      return
    }

    try {
      setSavingUsername(true)
      const profile = await usersApi.changeMyUsername({ username: nextUsername })
      const normalized = profile.username || nextUsername

      setState({ username: normalized })
      setUsernameDraft(normalized)
      toast.push('Da doi username thanh cong')
      navigate(`/profile/${encodeURIComponent(normalized)}`)
    } catch (error: any) {
      toast.push(error?.message || 'Khong the doi username')
    } finally {
      setSavingUsername(false)
    }
  }

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const { currentPassword, newPassword, confirmPassword } = passwordForm
    if (!currentPassword || !newPassword) {
      toast.push('Vui long nhap mat khau hien tai va mat khau moi')
      return
    }
    if (newPassword.length < 6) {
      toast.push('Mat khau moi phai co it nhat 6 ky tu')
      return
    }
    if (confirmPassword && confirmPassword !== newPassword) {
      toast.push('Xac nhan mat khau khong khop')
      return
    }

    try {
      setSavingPassword(true)
      await usersApi.changeMyPassword({
        currentPassword,
        newPassword,
        confirmPassword,
      })

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      toast.push('Doi mat khau thanh cong')
    } catch (error: any) {
      toast.push(error?.message || 'Khong the doi mat khau')
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) {
    return <div className={styles.state}>Dang tai trang chinh sua trang ca nhan...</div>
  }

  return (
    <div className={styles.page}>
      <form className={styles.container} onSubmit={handleProfileSubmit}>
        <div className={styles.profileCard}>
          <div className={styles.profileLeft}>
            <img className={styles.avatar} src={avatarSrc} alt={state.username} />
            <div>
              <div className={styles.username}>{state.username}</div>
              <div className={styles.fullName}>{form.fullName || 'Chua dat ten hien thi'}</div>
            </div>
          </div>
          <button className={styles.changePhotoBtn} type="button" onClick={() => fileInputRef.current?.click()}>
            Doi anh
          </button>
          <input ref={fileInputRef} hidden type="file" accept="image/*" onChange={handleAvatarPick} />
        </div>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Trang web</label>
          <input
            className={styles.input}
            placeholder="Trang web"
            value={form.website}
            onChange={(e) => setForm((current) => ({ ...current, website: e.target.value }))}
          />
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Tieu su</label>
          <div className={styles.textareaWrap}>
            <textarea
              className={styles.textarea}
              placeholder="Tieu su"
              maxLength={150}
              value={form.bio}
              onChange={(e) => setForm((current) => ({ ...current, bio: e.target.value }))}
            />
            <div className={styles.counter}>{form.bio.length} / 150</div>
          </div>
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Ten hien thi</label>
          <input
            className={styles.input}
            placeholder="Ten hien thi"
            value={form.fullName}
            onChange={(e) => setForm((current) => ({ ...current, fullName: e.target.value }))}
          />
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Gioi tinh</label>
          <div className={styles.selectWrap}>
            <select
              className={styles.select}
              value={form.gender}
              onChange={(e) => setForm((current) => ({ ...current, gender: e.target.value }))}
            >
              {GENDER_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Hien thi huy hieu Threads</label>
          <div className={styles.switchCard}>
            <div className={styles.switchTitle}>Hien thi huy hieu Threads</div>
            <button
              type="button"
              className={`${styles.switch} ${form.showThreadsBadge ? styles.switchOn : ''}`}
              onClick={() => setForm((current) => ({ ...current, showThreadsBadge: !current.showThreadsBadge }))}
              aria-pressed={form.showThreadsBadge}
            >
              <span className={styles.switchThumb} />
            </button>
          </div>
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Goi y tai khoan tren profile</label>
          <div className={styles.switchCard}>
            <div className={styles.switchTitle}>Hien thi goi y tai khoan tren profile</div>
            <button
              type="button"
              className={`${styles.switch} ${form.showSuggestedAccountsOnProfile ? styles.switchOn : ''}`}
              onClick={() => setForm((current) => ({ ...current, showSuggestedAccountsOnProfile: !current.showSuggestedAccountsOnProfile }))}
              aria-pressed={form.showSuggestedAccountsOnProfile}
            >
              <span className={styles.switchThumb} />
            </button>
          </div>
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Quyen rieng tu tai khoan</label>
          <div className={styles.switchCard}>
            <div>
              <div className={styles.switchTitle}>Tai khoan rieng tu</div>
              <div className={styles.switchDesc}>Chi nguoi theo doi moi xem duoc noi dung cua ban.</div>
            </div>
            <button
              type="button"
              className={`${styles.switch} ${form.isPrivateAccount ? styles.switchOn : ''}`}
              onClick={() => setForm((current) => ({ ...current, isPrivateAccount: !current.isPrivateAccount }))}
              aria-pressed={form.isPrivateAccount}
            >
              <span className={styles.switchThumb} />
            </button>
          </div>
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Trang thai hoat dong</label>
          <div className={styles.switchCard}>
            <div>
              <div className={styles.switchTitle}>Hien thi trang thai hoat dong</div>
              <div className={styles.switchDesc}>Cho phep nguoi khac biet khi ban dang online.</div>
            </div>
            <button
              type="button"
              className={`${styles.switch} ${form.showActivityStatus ? styles.switchOn : ''}`}
              onClick={() => setForm((current) => ({ ...current, showActivityStatus: !current.showActivityStatus }))}
              aria-pressed={form.showActivityStatus}
            >
              <span className={styles.switchThumb} />
            </button>
          </div>
        </section>

        <div className={styles.actions}>
          <button className={styles.submitBtn} type="submit" disabled={savingProfile}>
            {savingProfile ? 'Dang luu...' : 'Luu thong tin ho so'}
          </button>
        </div>
      </form>

      <form className={styles.panel} onSubmit={handleUsernameSubmit}>
        <div className={styles.panelTitle}>Doi username</div>
        <div className={styles.inlineField}>
          <input
            className={styles.input}
            value={usernameDraft}
            onChange={(e) => setUsernameDraft(e.target.value)}
            placeholder="username moi"
            autoComplete="off"
          />
          <button className={styles.secondaryBtn} type="submit" disabled={savingUsername}>
            {savingUsername ? 'Dang doi...' : 'Doi username'}
          </button>
        </div>
      </form>

      <form className={styles.panel} onSubmit={handlePasswordSubmit}>
        <div className={styles.panelTitle}>Doi mat khau</div>
        <div className={styles.grid2}>
          <input
            className={styles.input}
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm((current) => ({ ...current, currentPassword: e.target.value }))}
            placeholder="Mat khau hien tai"
            autoComplete="current-password"
          />
          <input
            className={styles.input}
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm((current) => ({ ...current, newPassword: e.target.value }))}
            placeholder="Mat khau moi"
            autoComplete="new-password"
          />
          <input
            className={styles.input}
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm((current) => ({ ...current, confirmPassword: e.target.value }))}
            placeholder="Xac nhan mat khau moi"
            autoComplete="new-password"
          />
        </div>
        <div className={styles.actionsLeft}>
          <button className={styles.secondaryBtn} type="submit" disabled={savingPassword}>
            {savingPassword ? 'Dang cap nhat...' : 'Doi mat khau'}
          </button>
        </div>
      </form>
    </div>
  )
}