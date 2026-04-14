import { useEffect, useMemo, useState } from 'react'
import { resolveMediaUrl } from '../../lib/api'
import { useAppStore } from '../../state/store'
import {
  type AccountStatsResponse,
  type AdminAccountRow,
  type AdminPostDetail,
  type AdminViolationsResponse,
  type PaginatedAdminAccounts,
  type PaginatedAdminPosts,
  useAdminApi,
} from '../../features/admin/admin.api'
import styles from './AdminPage.module.css'

type AdminTab = 'accounts' | 'posts' | 'reports' | 'violations'
type ReportDecision = 'no_violation' | 'delete_post' | 'strike_account' | 'lock_account'

const REPORT_PUNISHMENT_OPTIONS: Array<{ value: Exclude<ReportDecision, 'no_violation'>; label: string }> = [
  { value: 'delete_post', label: 'Vi pham - Xoa bai' },
  { value: 'strike_account', label: 'Vi pham - Gay tai khoan' },
  { value: 'lock_account', label: 'Vi pham - Khoa tai khoan' },
]

type AccountDraft = {
  commentBlocked: boolean
  messagingBlocked: boolean
  likeBlocked: boolean
  verified: boolean
  dailyPostLimit: number
  accountLocked: boolean
  lockReason: string
}

const DEFAULT_POST_FILTERS = {
  startDate: '',
  endDate: '',
  sort: 'engagement_desc' as 'engagement_desc' | 'engagement_asc',
}

const DEFAULT_REPORT_FILTERS = {
  startDate: '',
  endDate: '',
  status: 'all' as 'all' | 'pending' | 'reviewed' | 'accepted' | 'rejected',
  source: 'all' as 'all' | 'user_report' | 'auto_nsfw',
}

const DEFAULT_ACCOUNT_FILTERS = {
  keyword: '',
  status: 'all' as 'all' | 'active' | 'locked',
}

function formatDate(date?: string | null) {
  if (!date) return '--'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleString('vi-VN')
}

function EmptyState({ text }: { text: string }) {
  return <div className={styles.empty}>{text}</div>
}

function isVideoPreview(mediaType?: string, url?: string) {
  const byType = String(mediaType || '').toLowerCase() === 'video'
  if (byType) return true
  const raw = String(url || '').toLowerCase()
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/.test(raw)
}

function toAccountDraft(row: AdminAccountRow): AccountDraft {
  return {
    commentBlocked: Boolean(row.restrictions?.commentBlocked),
    messagingBlocked: Boolean(row.restrictions?.messagingBlocked),
    likeBlocked: Boolean(row.restrictions?.likeBlocked),
    verified: Boolean(row.isVerified),
    dailyPostLimit: Math.max(Number(row.restrictions?.dailyPostLimit || 0), 0),
    accountLocked: Boolean(row.accountLocked),
    lockReason: row.accountLockedReason || '',
  }
}

export default function AdminPage() {
  const adminApi = useAdminApi()
  const { state } = useAppStore()
  const isAdmin = state.role === 'admin'

  const [activeTab, setActiveTab] = useState<AdminTab>('accounts')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [months, setMonths] = useState(12)
  const [accountStats, setAccountStats] = useState<AccountStatsResponse | null>(null)

  const [accountDraftFilters, setAccountDraftFilters] = useState(DEFAULT_ACCOUNT_FILTERS)
  const [accountFilters, setAccountFilters] = useState(DEFAULT_ACCOUNT_FILTERS)
  const [accountsPage, setAccountsPage] = useState(1)
  const [accountsData, setAccountsData] = useState<PaginatedAdminAccounts | null>(null)
  const [accountDraftMap, setAccountDraftMap] = useState<Record<string, AccountDraft>>({})
  const [accountSavingMap, setAccountSavingMap] = useState<Record<string, boolean>>({})

  const [postDraftFilters, setPostDraftFilters] = useState(DEFAULT_POST_FILTERS)
  const [postFilters, setPostFilters] = useState(DEFAULT_POST_FILTERS)
  const [postsPage, setPostsPage] = useState(1)
  const [postsData, setPostsData] = useState<PaginatedAdminPosts | null>(null)
  const [postDetailOpen, setPostDetailOpen] = useState(false)
  const [postDetailLoading, setPostDetailLoading] = useState(false)
  const [postDetailData, setPostDetailData] = useState<AdminPostDetail | null>(null)
  const [postDetailSource, setPostDetailSource] = useState<'posts' | 'reports'>('posts')
  const [penaltyModalOpen, setPenaltyModalOpen] = useState(false)
  const [penaltyActions, setPenaltyActions] = useState<Exclude<ReportDecision, 'no_violation'>[]>(['delete_post'])
  const [penaltyReason, setPenaltyReason] = useState('')
  const [penaltySaving, setPenaltySaving] = useState(false)

  const [reportDraftFilters, setReportDraftFilters] = useState(DEFAULT_REPORT_FILTERS)
  const [reportFilters, setReportFilters] = useState(DEFAULT_REPORT_FILTERS)
  const [reportsPage, setReportsPage] = useState(1)
  const [reportsData, setReportsData] = useState<PaginatedAdminPosts | null>(null)

  const [violationsData, setViolationsData] = useState<AdminViolationsResponse | null>(null)

  const tabs = useMemo(
    () => [
      { key: 'accounts' as const, label: 'Tai khoan & dang nhap' },
      { key: 'posts' as const, label: 'Danh sach bai viet' },
      { key: 'reports' as const, label: 'Bai viet bi bao cao' },
      { key: 'violations' as const, label: 'Tai khoan/Bai viet vi pham' },
    ],
    [],
  )

  const refreshCurrentTab = async () => {
    if (activeTab === 'accounts') {
      const [stats, accounts] = await Promise.all([
        adminApi.getAccountStats(months),
        adminApi.getAccounts({
          page: accountsPage,
          limit: 20,
          keyword: accountFilters.keyword,
          status: accountFilters.status,
        }),
      ])
      setAccountStats(stats)
      setAccountsData(accounts)
      setAccountDraftMap((prev) => {
        const next = { ...prev }
        for (const item of accounts.items || []) {
          next[item.id] = toAccountDraft(item)
        }
        return next
      })
      return
    }

    if (activeTab === 'posts') {
      const data = await adminApi.getPosts({
        page: postsPage,
        limit: 20,
        startDate: postFilters.startDate,
        endDate: postFilters.endDate,
        sort: postFilters.sort,
      })
      setPostsData(data)
      return
    }

    if (activeTab === 'reports') {
      const data = await adminApi.getReportedPosts({
        page: reportsPage,
        limit: 20,
        startDate: reportFilters.startDate,
        endDate: reportFilters.endDate,
        status: reportFilters.status,
        source: reportFilters.source,
      })
      setReportsData(data)
      return
    }

    if (activeTab === 'violations') {
      const data = await adminApi.getViolations(true)
      setViolationsData(data)
    }
  }

  useEffect(() => {
    if (!isAdmin) return

    let cancelled = false
    const run = async () => {
      try {
        setLoading(true)
        setError('')
        setSuccess('')
        await refreshCurrentTab()
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Khong tai duoc du lieu admin')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    isAdmin,
    months,
    postsPage,
    postFilters,
    reportsPage,
    reportFilters,
    accountsPage,
    accountFilters,
  ])

  const updateAccountDraft = (id: string, patch: Partial<AccountDraft>) => {
    setAccountDraftMap((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {
          commentBlocked: false,
          messagingBlocked: false,
          likeBlocked: false,
          verified: false,
          dailyPostLimit: 0,
          accountLocked: false,
          lockReason: '',
        }),
        ...patch,
      },
    }))
  }

  const saveAccountRestrictions = async (row: AdminAccountRow) => {
    const draft = accountDraftMap[row.id] || toAccountDraft(row)
    setAccountSavingMap((prev) => ({ ...prev, [row.id]: true }))
    setError('')
    setSuccess('')
    try {
      await adminApi.updateUserRestrictions(row.id, {
        commentBlocked: draft.commentBlocked,
        messagingBlocked: draft.messagingBlocked,
        likeBlocked: draft.likeBlocked,
        verified: draft.verified,
        dailyPostLimit: draft.dailyPostLimit,
        accountLocked: draft.accountLocked,
        lockReason: draft.lockReason,
      })
      setSuccess(`Da cap nhat cai dat cho @${row.username}`)
      await refreshCurrentTab()
    } catch (err: any) {
      setError(err?.message || 'Khong cap nhat duoc cai dat tai khoan')
    } finally {
      setAccountSavingMap((prev) => ({ ...prev, [row.id]: false }))
    }
  }

  const sanitizePenaltyActions = (actions?: Exclude<ReportDecision, 'no_violation'>[]) => {
    const unique = Array.from(new Set((actions || []).filter(Boolean))) as Exclude<ReportDecision, 'no_violation'>[]
    return unique
  }

  const togglePenaltyAction = (action: Exclude<ReportDecision, 'no_violation'>) => {
    setPenaltyActions((prev) => {
      const current = sanitizePenaltyActions(prev)
      const hasAction = current.includes(action)
      const next = hasAction ? current.filter((item) => item !== action) : [...current, action]
      return sanitizePenaltyActions(next)
    })
  }

  const openPostDetail = async (postId: string, source: 'posts' | 'reports') => {
    setPostDetailSource(source)
    setPostDetailOpen(true)
    setPenaltyModalOpen(false)
    setPostDetailLoading(true)
    setPostDetailData(null)
    setError('')
    try {
      const data = await adminApi.getPostDetail(postId)
      setPostDetailData(data)
    } catch (err: any) {
      setPostDetailOpen(false)
      setError(err?.message || 'Khong tai duoc chi tiet bai viet')
    } finally {
      setPostDetailLoading(false)
    }
  }

  const closePostDetail = () => {
    setPenaltyModalOpen(false)
    setPostDetailOpen(false)
    setPostDetailLoading(false)
    setPostDetailData(null)
  }

  const openPenaltyModal = () => {
    setPenaltyActions(['delete_post'])
    setPenaltyReason('')
    setPenaltyModalOpen(true)
  }

  const closePenaltyModal = () => {
    if (penaltySaving) return
    setPenaltyModalOpen(false)
  }

  const savePenaltyDecision = async () => {
    if (!postDetailData?.post?.id) return

    const actions = sanitizePenaltyActions(penaltyActions)
    if (!actions.length) {
      setError('Vui long chon it nhat 1 hinh thuc xu phat.')
      return
    }

    setPenaltySaving(true)
    setError('')
    setSuccess('')
    try {
      const reason = penaltyReason.trim()
      await adminApi.resolveReportedPost(postDetailData.post.id, {
        actions,
        decision: actions[0],
        reason,
      })
      setSuccess('Da xu phat bai viet thanh cong.')
      setPenaltyModalOpen(false)
      closePostDetail()
      await refreshCurrentTab()
    } catch (err: any) {
      setError(err?.message || 'Khong luu duoc quyet dinh xu phat')
    } finally {
      setPenaltySaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <div className={styles.unauthorized}>Ban khong co quyen truy cap trang quan tri.</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin Dashboard</h1>
          <p className={styles.subtitle}>Quan ly tong quan mang xa hoi</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}
      {loading ? <div className={styles.loading}>Dang tai du lieu...</div> : null}

      {activeTab === 'accounts' ? (
        <section className={styles.panel}>
          <div className={styles.filters}>
            <label className={styles.inlineField}>
              <span>Khoang thang</span>
              <select value={months} onChange={(e) => setMonths(Number(e.target.value) || 12)}>
                <option value={6}>6 thang</option>
                <option value={12}>12 thang</option>
                <option value={18}>18 thang</option>
                <option value={24}>24 thang</option>
              </select>
            </label>
            <label className={styles.inlineField}>
              <span>Tim tai khoan</span>
              <input
                value={accountDraftFilters.keyword}
                onChange={(e) => setAccountDraftFilters((prev) => ({ ...prev, keyword: e.target.value }))}
                placeholder="username/email"
              />
            </label>
            <label className={styles.inlineField}>
              <span>Trang thai</span>
              <select
                value={accountDraftFilters.status}
                onChange={(e) => setAccountDraftFilters((prev) => ({ ...prev, status: e.target.value as 'all' | 'active' | 'locked' }))}
              >
                <option value="all">Tat ca</option>
                <option value="active">Dang hoat dong</option>
                <option value="locked">Da khoa</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.applyButton}
              onClick={() => {
                setAccountsPage(1)
                setAccountFilters({ ...accountDraftFilters })
              }}
            >
              Loc
            </button>
          </div>

          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Tong tai khoan</div>
              <div className={styles.statValue}>{accountStats?.summary?.totalAccounts ?? 0}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Tong luot dang nhap</div>
              <div className={styles.statValue}>{accountStats?.summary?.totalLogins ?? 0}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Hoat dong 30 ngay</div>
              <div className={styles.statValue}>{accountStats?.summary?.activeLast30Days ?? 0}</div>
            </div>
          </div>

          <div className={styles.tableCard}>
            <h3 className={styles.tableTitle}>Quan ly chi tiet tai khoan</h3>
            {accountsData?.items?.length ? (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Tick xanh</th>
                        <th>Gay</th>
                        <th>Khoa TK</th>
                        <th>Chan comment</th>
                        <th>Chan message</th>
                        <th>Chan like</th>
                        <th>Gioi han bai/ngay</th>
                        <th>Ly do khoa</th>
                        <th>Hanh dong</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsData.items.map((row) => {
                        const draft = accountDraftMap[row.id] || toAccountDraft(row)
                        return (
                          <tr key={row.id}>
                            <td>@{row.username}</td>
                            <td>{row.email}</td>
                            <td>
                              <input
                                type="checkbox"
                                checked={draft.verified}
                                onChange={(e) => updateAccountDraft(row.id, { verified: e.target.checked })}
                              />
                            </td>
                            <td>{row.strikesCount}</td>
                            <td>
                              <label className={styles.toggleCell}>
                                <input
                                  type="checkbox"
                                  checked={draft.accountLocked}
                                  onChange={(e) => updateAccountDraft(row.id, { accountLocked: e.target.checked })}
                                />
                                <span>{draft.accountLocked ? 'Khoa' : 'Mo'}</span>
                              </label>
                            </td>
                            <td>
                              <input type="checkbox" checked={draft.commentBlocked} onChange={(e) => updateAccountDraft(row.id, { commentBlocked: e.target.checked })} />
                            </td>
                            <td>
                              <input type="checkbox" checked={draft.messagingBlocked} onChange={(e) => updateAccountDraft(row.id, { messagingBlocked: e.target.checked })} />
                            </td>
                            <td>
                              <input type="checkbox" checked={draft.likeBlocked} onChange={(e) => updateAccountDraft(row.id, { likeBlocked: e.target.checked })} />
                            </td>
                            <td>
                              <input
                                className={styles.smallInput}
                                type="number"
                                min={0}
                                value={draft.dailyPostLimit}
                                onChange={(e) => updateAccountDraft(row.id, { dailyPostLimit: Math.max(Number(e.target.value) || 0, 0) })}
                              />
                            </td>
                            <td>
                              <input
                                className={styles.smallInput}
                                value={draft.lockReason}
                                onChange={(e) => updateAccountDraft(row.id, { lockReason: e.target.value })}
                                placeholder="Ly do"
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.rowActionBtn}
                                disabled={!!accountSavingMap[row.id]}
                                onClick={() => saveAccountRestrictions(row)}
                              >
                                {accountSavingMap[row.id] ? 'Dang luu...' : 'Luu'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className={styles.pagination}>
                  <button type="button" onClick={() => setAccountsPage((prev) => Math.max(prev - 1, 1))} disabled={accountsPage <= 1}>
                    Truoc
                  </button>
                  <span>Trang {accountsData.page}/{accountsData.totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setAccountsPage((prev) => Math.min(prev + 1, accountsData.totalPages || 1))}
                    disabled={accountsPage >= (accountsData.totalPages || 1)}
                  >
                    Sau
                  </button>
                </div>
              </>
            ) : (
              <EmptyState text="Khong co tai khoan theo bo loc hien tai." />
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'posts' ? (
        <section className={styles.panel}>
          <div className={styles.filters}>
            <label className={styles.inlineField}>
              <span>Tu ngay</span>
              <input
                type="date"
                value={postDraftFilters.startDate}
                onChange={(e) => setPostDraftFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Den ngay</span>
              <input
                type="date"
                value={postDraftFilters.endDate}
                onChange={(e) => setPostDraftFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Sap xep tuong tac</span>
              <select
                value={postDraftFilters.sort}
                onChange={(e) =>
                  setPostDraftFilters((prev) => ({
                    ...prev,
                    sort: e.target.value as 'engagement_desc' | 'engagement_asc',
                  }))
                }
              >
                <option value="engagement_desc">Giam dan</option>
                <option value="engagement_asc">Tang dan</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.applyButton}
              onClick={() => {
                setPostsPage(1)
                setPostFilters({ ...postDraftFilters })
              }}
            >
              Loc
            </button>
          </div>

          {postsData?.items?.length ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tieu de</th>
                      <th>Thumbnail</th>
                      <th>User dang</th>
                      <th>Thoi gian</th>
                      <th>Like</th>
                      <th>Comment</th>
                      <th>Report</th>
                      <th>Tuong tac</th>
                      <th>Trang thai comment</th>
                      <th>Thao tac</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postsData.items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.title}</td>
                        <td>
                          {row.thumbnailUrl ? (
                            isVideoPreview(row.mediaType, row.thumbnailUrl) ? (
                              <video
                                className={styles.thumbnailVideo}
                                src={resolveMediaUrl(row.thumbnailUrl)}
                                playsInline
                                muted
                                preload="metadata"
                              />
                            ) : (
                              <img className={styles.thumbnail} src={resolveMediaUrl(row.thumbnailUrl)} alt={row.title} />
                            )
                          ) : (
                            <span className={styles.muted}>Khong co</span>
                          )}
                        </td>
                        <td>@{row.authorUsername}</td>
                        <td>{formatDate(row.createdAt)}</td>
                        <td>{row.likesCount}</td>
                        <td>{row.commentsCount}</td>
                        <td>{row.reportCount || 0}</td>
                        <td>{row.engagementCount}</td>
                        <td>{row.allowComments === false ? 'Da khoa' : 'Dang mo'}</td>
                        <td>
                          <div className={styles.inlineActions}>
                            <button
                              type="button"
                              className={styles.rowActionBtn}
                              onClick={() => openPostDetail(row.id, 'posts')}
                            >
                              Xem chi tiet
                            </button>
                            <a className={styles.linkBtn} href={`/post/${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">
                              Mo bai viet
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.pagination}>
                <button type="button" onClick={() => setPostsPage((prev) => Math.max(prev - 1, 1))} disabled={postsPage <= 1}>Truoc</button>
                <span>Trang {postsData.page}/{postsData.totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPostsPage((prev) => Math.min(prev + 1, postsData.totalPages || 1))}
                  disabled={postsPage >= (postsData.totalPages || 1)}
                >
                  Sau
                </button>
              </div>
            </>
          ) : (
            <EmptyState text="Khong co bai viet theo bo loc hien tai." />
          )}
        </section>
      ) : null}

      {activeTab === 'reports' ? (
        <section className={styles.panel}>
          <div className={styles.filters}>
            <label className={styles.inlineField}>
              <span>Tu ngay</span>
              <input
                type="date"
                value={reportDraftFilters.startDate}
                onChange={(e) => setReportDraftFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Den ngay</span>
              <input
                type="date"
                value={reportDraftFilters.endDate}
                onChange={(e) => setReportDraftFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Trang thai report</span>
              <select
                value={reportDraftFilters.status}
                onChange={(e) =>
                  setReportDraftFilters((prev) => ({
                    ...prev,
                    status: e.target.value as 'all' | 'pending' | 'reviewed' | 'accepted' | 'rejected',
                  }))
                }
              >
                <option value="all">Tat ca</option>
                <option value="pending">Dang cho xu ly</option>
                <option value="reviewed">Da review</option>
                <option value="accepted">Xac nhan vi pham</option>
                <option value="rejected">Tu choi</option>
              </select>
            </label>
            <label className={styles.inlineField}>
              <span>Nguon report</span>
              <select
                value={reportDraftFilters.source}
                onChange={(e) =>
                  setReportDraftFilters((prev) => ({
                    ...prev,
                    source: e.target.value as 'all' | 'user_report' | 'auto_nsfw',
                  }))
                }
              >
                <option value="all">Tat ca</option>
                <option value="user_report">Nguoi dung report</option>
                <option value="auto_nsfw">He thong tu dong</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.applyButton}
              onClick={() => {
                setReportsPage(1)
                setReportFilters({ ...reportDraftFilters })
              }}
            >
              Loc
            </button>
          </div>

          {reportsData?.items?.length ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Bai viet</th>
                      <th>User dang</th>
                      <th>So report</th>
                      <th>Pending</th>
                      <th>Ly do moi nhat</th>
                      <th>Lan report gan nhat</th>
                      <th>Xu ly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportsData.items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.title}</td>
                        <td>@{row.authorUsername}</td>
                        <td>{row.reportCount || 0}</td>
                        <td>{row.pendingCount || 0}</td>
                        <td>
                          <div>{row.latestReason || '--'}</div>
                          {row.reportSource === 'auto_nsfw' ? <div className={styles.muted}>Auto 18+ (demo)</div> : null}
                        </td>
                        <td>{formatDate(row.lastReportedAt)}</td>
                        <td>
                          <div className={styles.inlineActions}>
                            <button
                              type="button"
                              className={styles.rowActionBtn}
                              onClick={() => openPostDetail(row.id, 'reports')}
                            >
                              Xem chi tiet
                            </button>
                            <a className={styles.linkBtn} href={`/post/${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">
                              Mo bai viet
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.pagination}>
                <button type="button" onClick={() => setReportsPage((prev) => Math.max(prev - 1, 1))} disabled={reportsPage <= 1}>Truoc</button>
                <span>Trang {reportsData.page}/{reportsData.totalPages}</span>
                <button
                  type="button"
                  onClick={() => setReportsPage((prev) => Math.min(prev + 1, reportsData.totalPages || 1))}
                  disabled={reportsPage >= (reportsData.totalPages || 1)}
                >
                  Sau
                </button>
              </div>
            </>
          ) : (
            <EmptyState text="Chua co bai viet bi bao cao." />
          )}
        </section>
      ) : null}

      {activeTab === 'violations' ? (
        <section className={styles.panel}>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Tai khoan vi pham</div>
              <div className={styles.statValue}>{violationsData?.summary?.violatingAccounts ?? 0}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Bai viet vi pham</div>
              <div className={styles.statValue}>{violationsData?.summary?.violatingPosts ?? 0}</div>
            </div>
          </div>

          <div className={styles.tableCard}>
            <h3 className={styles.tableTitle}>Danh sach tai khoan vi pham</h3>
            {violationsData?.accounts?.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Trang thai</th>
                    <th>Gay</th>
                    <th>Ly do</th>
                    <th>Luot dang nhap</th>
                    <th>Cap nhat</th>
                  </tr>
                </thead>
                <tbody>
                  {violationsData.accounts.map((row) => (
                    <tr key={row.id}>
                      <td>@{row.username}</td>
                      <td>{row.email}</td>
                      <td>{row.accountLocked ? 'locked' : row.moderationStatus}</td>
                      <td>{row.strikesCount}</td>
                      <td>{row.accountLocked ? (row.accountLockedReason || '--') : (row.moderationReason || '--')}</td>
                      <td>{row.loginCount}</td>
                      <td>{formatDate(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="Chua co tai khoan vi pham." />
            )}
          </div>

          <div className={styles.tableCard}>
            <h3 className={styles.tableTitle}>Danh sach bai viet vi pham</h3>
            {violationsData?.posts?.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tieu de</th>
                    <th>User dang</th>
                    <th>Trang thai</th>
                    <th>Ly do</th>
                    <th>Report</th>
                    <th>Tuong tac</th>
                    <th>Thoi gian</th>
                  </tr>
                </thead>
                <tbody>
                  {violationsData.posts.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>@{row.authorUsername}</td>
                      <td>{row.moderationStatus}</td>
                      <td>{row.moderationReason || '--'}</td>
                      <td>{row.reportCount}</td>
                      <td>{row.engagementCount}</td>
                      <td>{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="Chua co bai viet vi pham." />
            )}
          </div>
        </section>
      ) : null}

      {postDetailOpen ? (
        <div className={styles.modalOverlay} onMouseDown={closePostDetail}>
          <div className={styles.modalCard} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Chi tiet bai viet</h3>
                <div className={styles.modalSubtitle}>
                  Nguon: {postDetailSource === 'reports' ? 'Bai viet bi bao cao' : 'Danh sach bai viet'}
                </div>
              </div>
              <button type="button" className={styles.closeModalBtn} onClick={closePostDetail}>
                Dong
              </button>
            </div>

            {postDetailLoading ? <div className={styles.loading}>Dang tai chi tiet...</div> : null}

            {!postDetailLoading && postDetailData?.post ? (
              <div className={styles.modalContent}>
                <div className={styles.modalMain}>
                  <div className={styles.modalPostHeader}>
                    <div><b>@{postDetailData.post.authorUsername}</b></div>
                    <div className={styles.muted}>{formatDate(postDetailData.post.createdAt)}</div>
                  </div>
                  {(() => {
                    const previewUrl = resolveMediaUrl(
                      postDetailData.post.thumbnailUrl || postDetailData.post.media?.[0]?.url || postDetailData.post.imageUrl || '',
                    )
                    if (!previewUrl) return null
                    if (isVideoPreview(postDetailData.post.mediaType, previewUrl)) {
                      return (
                        <video
                          className={styles.modalPreview}
                          src={previewUrl}
                          controls
                          playsInline
                          preload="metadata"
                        />
                      )
                    }
                    return (
                      <img
                        className={styles.modalPreview}
                        src={previewUrl}
                        alt={postDetailData.post.title || 'post'}
                      />
                    )
                  })()}
                  {postDetailData.post.content ? <div className={styles.modalCaption}>{postDetailData.post.content}</div> : null}
                  <div className={styles.modalStats}>
                    <span>Like: {postDetailData.post.likesCount}</span>
                    <span>Comment: {postDetailData.post.commentsCount}</span>
                    <span>Report: {postDetailData.post.reportCount}</span>
                    <span>Comment: {postDetailData.post.allowComments ? 'Dang mo' : 'Da khoa'}</span>
                  </div>
                  {postDetailData.post.postExists === false ? (
                    <div className={styles.muted}>Bai viet da bi go khoi he thong cong khai.</div>
                  ) : (
                    <a className={styles.linkBtn} href={postDetailData.post.postPath || `/post/${postDetailData.post.id}`} target="_blank" rel="noreferrer">
                      Link truc tiep toi bai viet
                    </a>
                  )}
                </div>

                <div className={styles.modalSide}>
                  <div className={styles.modalInfoGrid}>
                    <div><b>ID:</b> {postDetailData.post.id}</div>
                    <div><b>Trang thai:</b> {postDetailData.post.moderationStatus || 'normal'}</div>
                    <div><b>Nguon report:</b> {postDetailData.post.reportSource || 'user_report'}</div>
                    <div><b>Bao cao gan nhat:</b> {formatDate(postDetailData.post.lastReportedAt)}</div>
                    <div><b>Ly do moderation:</b> {postDetailData.post.moderationReason || '--'}</div>
                  </div>

                  <div className={styles.inlineActions}>
                    <button
                      type="button"
                      className={`${styles.rowActionBtn} ${styles.dangerBtn}`}
                      onClick={openPenaltyModal}
                    >
                      Xu phat
                    </button>
                    <a className={styles.linkBtn} href={postDetailData.post.postPath || `/post/${postDetailData.post.id}`} target="_blank" rel="noreferrer">
                      Mo bai viet
                    </a>
                  </div>

                  {postDetailData.reports?.length ? (
                    <div className={styles.reportList}>
                      <div className={styles.reportListTitle}>Lich su report</div>
                      {postDetailData.reports.map((item) => (
                        <div key={item.id} className={styles.reportItem}>
                          <div><b>@{item.reporterUsername || 'unknown'}</b> - {item.status}</div>
                          {item.source === 'auto_nsfw' ? <div className={styles.muted}>Nguon: He thong auto 18+ (demo)</div> : null}
                          {item.detectionSignals?.length ? <div className={styles.muted}>Tu khoa: {item.detectionSignals.join(', ')}</div> : null}
                          <div className={styles.muted}>{item.reason || '--'}</div>
                          <div className={styles.muted}>{formatDate(item.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.empty}>Bai viet nay chua co lich su report.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {penaltyModalOpen ? (
        <div className={styles.modalOverlay} onMouseDown={closePenaltyModal}>
          <div className={styles.penaltyModalCard} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Xu phat bai viet</h3>
                <div className={styles.modalSubtitle}>Chon hinh thuc xu phat va ly do</div>
              </div>
              <button type="button" className={styles.closeModalBtn} onClick={closePenaltyModal} disabled={penaltySaving}>
                Dong
              </button>
            </div>

            <div className={styles.penaltyBody}>
              <div className={styles.reportActionChecks}>
                {REPORT_PUNISHMENT_OPTIONS.map((option) => (
                  <label key={option.value} className={styles.reportActionOption}>
                    <input
                      type="checkbox"
                      checked={penaltyActions.includes(option.value)}
                      onChange={() => togglePenaltyAction(option.value)}
                      disabled={penaltySaving}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>

              <textarea
                className={styles.penaltyReasonInput}
                value={penaltyReason}
                onChange={(e) => setPenaltyReason(e.target.value)}
                placeholder="Ly do xu phat"
                rows={4}
                disabled={penaltySaving}
              />

              <div className={styles.inlineActions}>
                <button type="button" className={styles.linkBtn} onClick={closePenaltyModal} disabled={penaltySaving}>
                  Huy
                </button>
                <button
                  type="button"
                  className={styles.rowActionBtn}
                  onClick={savePenaltyDecision}
                  disabled={penaltySaving || !penaltyActions.length}
                >
                  {penaltySaving ? 'Dang luu...' : 'Luu xu phat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
