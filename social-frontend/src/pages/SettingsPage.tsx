import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { useUsersApi } from '../features/users/users.api'
import { useAppStore } from '../state/store'
import styles from './SettingsPage.module.css'

const GENDER_OPTIONS = [
  { value: '', label: 'Không muốn tiết lộ' },
  { value: 'Nam', label: 'Nam' },
  { value: 'Nữ', label: 'Nữ' },
  { value: 'Khác', label: 'Khác' },
]

function avatarOf(username?: string, avatarUrl?: string) {
  if (avatarUrl) return avatarUrl
  const seed = encodeURIComponent(username || 'user')
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`
}

export default function SettingsPage() {
  const { state } = useAppStore()
  const usersApi = useUsersApi()
  const toast = useToast()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    website: '',
    bio: '',
    gender: '',
    showThreadsBadge: false,
    showSuggestedAccountsOnProfile: true,
    avatarUrl: '',
  })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const profile = await usersApi.getProfile(state.username)
        if (!mounted) return
        setForm({
          fullName: profile.fullName || '',
          website: profile.website || '',
          bio: profile.bio || '',
          gender: profile.gender || '',
          showThreadsBadge: Boolean(profile.showThreadsBadge),
          showSuggestedAccountsOnProfile: profile.showSuggestedAccountsOnProfile !== false,
          avatarUrl: profile.avatarUrl || '',
        })
      } catch (error: any) {
        if (!mounted) return
        toast.push(error?.message || 'Không tải được hồ sơ hiện tại')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [state.username, toast, usersApi])

  const handleAvatarPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setForm((current) => ({ ...current, avatarUrl: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      setSaving(true)
      await usersApi.updateMyProfile(form)
      toast.push('Đã cập nhật trang cá nhân')
      navigate(`/profile/${encodeURIComponent(state.username)}`)
    } catch (error: any) {
      toast.push(error?.message || 'Cập nhật thất bại')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className={styles.state}>Đang tải trang chỉnh sửa trang cá nhân...</div>
  }

  return (
    <div className={styles.page}>
      <form className={styles.container} onSubmit={handleSubmit}>
        <div className={styles.profileCard}>
          <div className={styles.profileLeft}>
            <img className={styles.avatar} src={avatarOf(state.username, form.avatarUrl)} alt={state.username} />
            <div>
              <div className={styles.username}>{state.username}</div>
              <div className={styles.fullName}>{form.fullName || 'Chưa đặt tên hiển thị'}</div>
            </div>
          </div>
          <button className={styles.changePhotoBtn} type="button" onClick={() => fileInputRef.current?.click()}>
            Đổi ảnh
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
          <p className={styles.help}>Bạn chỉ có thể chỉnh sửa liên kết trên thiết bị di động. Ở bản demo này, liên kết sẽ lưu trực tiếp vào hồ sơ của bạn.</p>
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Tiểu sử</label>
          <div className={styles.textareaWrap}>
            <textarea
              className={styles.textarea}
              placeholder="Tiểu sử"
              maxLength={150}
              value={form.bio}
              onChange={(e) => setForm((current) => ({ ...current, bio: e.target.value }))}
            />
            <div className={styles.counter}>{form.bio.length} / 150</div>
          </div>
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Hiển thị huy hiệu Threads</label>
          <div className={styles.switchCard}>
            <div>
              <div className={styles.switchTitle}>Hiển thị huy hiệu Threads</div>
            </div>
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
          <label className={styles.label}>Giới tính</label>
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
          <p className={styles.help}>Thông tin này sẽ không xuất hiện trên trang cá nhân công khai của bạn.</p>
        </section>

        <section className={styles.fieldBlock}>
          <label className={styles.label}>Hiển thị gợi ý tài khoản trên trang cá nhân</label>
          <div className={styles.switchCard}>
            <div>
              <div className={styles.switchTitle}>Hiển thị gợi ý tài khoản trên trang cá nhân</div>
              <div className={styles.switchDesc}>Cho phép mọi người thấy các gợi ý tài khoản tương tự trên trang cá nhân của bạn và có cho hệ thống gợi ý tài khoản của bạn trên các trang cá nhân khác hay không.</div>
            </div>
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
          <label className={styles.label}>Tên hiển thị</label>
          <input
            className={styles.input}
            placeholder="Tên hiển thị"
            value={form.fullName}
            onChange={(e) => setForm((current) => ({ ...current, fullName: e.target.value }))}
          />
        </section>

        <p className={styles.footerNote}>Một số thông tin trên trang cá nhân của bạn như tên hiển thị, tiểu sử và liên kết sẽ được hiển thị với mọi người.</p>

        <div className={styles.actions}>
          <button className={styles.submitBtn} type="submit" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Gửi'}
          </button>
        </div>
      </form>
    </div>
  )
}
