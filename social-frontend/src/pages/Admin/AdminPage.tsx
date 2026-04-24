import { startTransition, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { resolveMediaUrl } from '../../lib/api'
import { useAppStore } from '../../state/store'
import {
  type AccountStatsResponse,
  type AdminAccountRow,
  type AdminPostDetail,
  type AdminPostRow,
  type AdminViolationsResponse,
  type PaginatedAdminAccounts,
  type PaginatedAdminPosts,
  useAdminApi,
} from '../../features/admin/admin.api'
import { combineResponsiveStyles } from '../../lib/combineResponsiveStyles'
import styles from './AdminPage.module.css'
import desktopStyles from './AdminPage.desktop.module.css'
import tabletStyles from './AdminPage.tablet.module.css'
import mobileStyles from './AdminPage.mobile.module.css'

type AdminTab = 'overview' | 'accounts' | 'posts' | 'reports' | 'violations'
type ReportDecision = 'no_violation' | 'delete_post' | 'strike_account' | 'lock_account'
type AccountModerationStatus = 'normal' | 'warning' | 'violating'
type PostModerationStatus = 'normal' | 'reported' | 'pending_review' | 'violating'
type PostAction = 'delete_post' | 'lock_comments' | 'unlock_comments'
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

type AccountDraft = {
  commentBlocked: boolean
  messagingBlocked: boolean
  likeBlocked: boolean
  verified: boolean
  dailyPostLimit: number
  accountLocked: boolean
  lockReason: string
  moderationStatus: AccountModerationStatus
  moderationReason: string
}

type ReportDecisionTarget = {
  ids: string[]
  label: string
  source: 'reports' | 'detail'
}

const STORAGE_KEYS = {
  activeTab: 'admin_active_tab_v2',
  autoRefresh: 'admin_auto_refresh_v2',
}

const AUTO_REFRESH_INTERVAL = 60_000

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

const DEFAULT_POST_MODERATION_DRAFT: { status: PostModerationStatus; reason: string } = {
  status: 'normal',
  reason: '',
}

const REPORT_DECISION_OPTIONS: Array<{
  value: ReportDecision
  label: string
  help: string
  tone: BadgeTone
}> = [
  { value: 'no_violation', label: 'Khong vi pham', help: 'Dong queue va bo report pending.', tone: 'neutral' },
  { value: 'delete_post', label: 'Xoa bai viet', help: 'Go bai viet khoi he thong cong khai.', tone: 'danger' },
  { value: 'strike_account', label: 'Cong 1 gay', help: 'Tang diem vi pham cho chu bai viet.', tone: 'warning' },
  { value: 'lock_account', label: 'Khoa tai khoan', help: 'Khoa tai khoan ngay lap tuc.', tone: 'danger' },
]

const ACCOUNT_MODERATION_OPTIONS: Array<{ value: AccountModerationStatus; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'warning', label: 'Warning' },
  { value: 'violating', label: 'Violating' },
]

const POST_MODERATION_OPTIONS: Array<{ value: PostModerationStatus; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'reported', label: 'Reported' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'violating', label: 'Violating' },
]

const responsiveStyles = combineResponsiveStyles(desktopStyles, tabletStyles, mobileStyles)

function formatDate(date?: string | null) {
  if (!date) return '--'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleString('vi-VN')
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0)
}

function formatMonthLabel(month: string) {
  const [year, rawMonth] = String(month || '').split('-')
  if (!year || !rawMonth) return month
  return `${rawMonth}/${year.slice(-2)}`
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function normalizeAccountModerationStatus(value?: string | null): AccountModerationStatus {
  if (value === 'warning' || value === 'violating') return value
  return 'normal'
}

function normalizePostModerationStatus(value?: string | null): PostModerationStatus {
  if (value === 'reported' || value === 'pending_review' || value === 'violating') return value
  return 'normal'
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
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
    moderationStatus: normalizeAccountModerationStatus(row.moderationStatus),
    moderationReason: row.moderationReason || '',
  }
}

function hasAccountDraftChanged(row: AdminAccountRow, draft: AccountDraft) {
  const current = toAccountDraft(row)
  return (
    current.commentBlocked !== draft.commentBlocked
    || current.messagingBlocked !== draft.messagingBlocked
    || current.likeBlocked !== draft.likeBlocked
    || current.verified !== draft.verified
    || current.dailyPostLimit !== draft.dailyPostLimit
    || current.accountLocked !== draft.accountLocked
    || current.lockReason !== draft.lockReason
    || current.moderationStatus !== draft.moderationStatus
    || current.moderationReason !== draft.moderationReason
  )
}

function loadStoredTab(): AdminTab {
  if (typeof window === 'undefined') return 'overview'
  const raw = window.localStorage.getItem(STORAGE_KEYS.activeTab)
  if (raw === 'accounts' || raw === 'posts' || raw === 'reports' || raw === 'violations' || raw === 'overview') {
    return raw
  }
  return 'overview'
}

function loadStoredBoolean(key: string, fallback = false) {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(key) === '1'
}

function matchesSearch(values: Array<string | number | boolean | null | undefined>, query: string) {
  if (!query) return true
  const haystack = values
    .map((value) => String(value ?? '').trim().toLowerCase())
    .join(' ')
  return haystack.includes(query)
}

function sanitizeReportActions(actions?: ReportDecision[]) {
  const unique = Array.from(new Set((actions || []).filter(Boolean))) as ReportDecision[]
  if (!unique.length) return ['no_violation'] as ReportDecision[]
  if (unique.includes('no_violation') && unique.length > 1) {
    return unique.filter((item) => item !== 'no_violation') as ReportDecision[]
  }
  return unique
}

function resolveReportActionToggle(previous: ReportDecision[], action: ReportDecision) {
  if (action === 'no_violation') return ['no_violation'] as ReportDecision[]

  const withoutNeutral = sanitizeReportActions(previous).filter((item) => item !== 'no_violation')
  if (withoutNeutral.includes(action)) {
    const next = withoutNeutral.filter((item) => item !== action)
    return next.length ? next : (['no_violation'] as ReportDecision[])
  }

  return [...withoutNeutral, action] as ReportDecision[]
}

function escapeCsvCell(value: unknown) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const csv = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

function badgeToneForAccount(status?: string, locked?: boolean): BadgeTone {
  if (locked) return 'danger'
  if (status === 'violating') return 'danger'
  if (status === 'warning') return 'warning'
  return 'neutral'
}

function badgeToneForPost(status?: string): BadgeTone {
  if (status === 'violating') return 'danger'
  if (status === 'pending_review' || status === 'reported') return 'warning'
  return 'neutral'
}

function badgeToneForReport(status?: string): BadgeTone {
  if (status === 'accepted') return 'danger'
  if (status === 'rejected') return 'success'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone
  children: ReactNode
}) {
  const toneClassName = {
    neutral: styles.badgeNeutral,
    success: styles.badgeSuccess,
    warning: styles.badgeWarning,
    danger: styles.badgeDanger,
    info: styles.badgeInfo,
  }[tone]

  return <span className={`${styles.badge} ${toneClassName}`}>{children}</span>
}

function MetricCard({
  label,
  value,
  help,
  tone = 'neutral',
}: {
  label: string
  value: string
  help?: string
  tone?: BadgeTone
}) {
  return (
    <div className={`${styles.metricCard} ${styles[`metricCard${tone[0].toUpperCase()}${tone.slice(1)}`] || ''}`}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
      {help ? <div className={styles.metricHelp}>{help}</div> : null}
    </div>
  )
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <label className={styles.switch}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className={styles.switchTrack}>
        <span className={styles.switchThumb} />
      </span>
      <span>{label}</span>
    </label>
  )
}

export default function AdminPage() {
  const adminApi = useAdminApi()
  const { state } = useAppStore()
  const isAdmin = state.role === 'admin'

  const [activeTab, setActiveTab] = useState<AdminTab>(() => loadStoredTab())
  const [pageSearch, setPageSearch] = useState('')
  const deferredSearch = useDeferredValue(pageSearch.trim().toLowerCase())

  const [loading, setLoading] = useState(false)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(() => loadStoredBoolean(STORAGE_KEYS.autoRefresh))

  const [months, setMonths] = useState(12)
  const [accountStats, setAccountStats] = useState<AccountStatsResponse | null>(null)
  const [overviewTopPosts, setOverviewTopPosts] = useState<PaginatedAdminPosts | null>(null)
  const [overviewQueue, setOverviewQueue] = useState<PaginatedAdminPosts | null>(null)

  const [accountDraftFilters, setAccountDraftFilters] = useState(DEFAULT_ACCOUNT_FILTERS)
  const [accountFilters, setAccountFilters] = useState(DEFAULT_ACCOUNT_FILTERS)
  const [accountsPage, setAccountsPage] = useState(1)
  const [accountsData, setAccountsData] = useState<PaginatedAdminAccounts | null>(null)
  const [accountDraftMap, setAccountDraftMap] = useState<Record<string, AccountDraft>>({})
  const [accountSavingMap, setAccountSavingMap] = useState<Record<string, boolean>>({})
  const [savingVisibleAccounts, setSavingVisibleAccounts] = useState(false)

  const [postDraftFilters, setPostDraftFilters] = useState(DEFAULT_POST_FILTERS)
  const [postFilters, setPostFilters] = useState(DEFAULT_POST_FILTERS)
  const [postsPage, setPostsPage] = useState(1)
  const [postsData, setPostsData] = useState<PaginatedAdminPosts | null>(null)
  const [postActionSavingMap, setPostActionSavingMap] = useState<Record<string, boolean>>({})

  const [reportDraftFilters, setReportDraftFilters] = useState(DEFAULT_REPORT_FILTERS)
  const [reportFilters, setReportFilters] = useState(DEFAULT_REPORT_FILTERS)
  const [reportsPage, setReportsPage] = useState(1)
  const [reportsData, setReportsData] = useState<PaginatedAdminPosts | null>(null)
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([])
  const [reportDecisionTarget, setReportDecisionTarget] = useState<ReportDecisionTarget | null>(null)
  const [reportDecisionActions, setReportDecisionActions] = useState<ReportDecision[]>(['no_violation'])
  const [reportDecisionReason, setReportDecisionReason] = useState('')
  const [reportDecisionSaving, setReportDecisionSaving] = useState(false)

  const [violationsData, setViolationsData] = useState<AdminViolationsResponse | null>(null)

  const [postDetailOpen, setPostDetailOpen] = useState(false)
  const [postDetailLoading, setPostDetailLoading] = useState(false)
  const [postDetailData, setPostDetailData] = useState<AdminPostDetail | null>(null)
  const [postDetailSource, setPostDetailSource] = useState<'posts' | 'reports'>('posts')
  const [postModerationDraft, setPostModerationDraft] = useState(DEFAULT_POST_MODERATION_DRAFT)
  const [postDetailSaving, setPostDetailSaving] = useState(false)

  const tabs = useMemo(
    () => [
      { key: 'overview' as const, label: 'Overview', help: 'Tong quan, trend va queue uu tien' },
      { key: 'accounts' as const, label: 'Tai khoan', help: 'Moderation, gioi han va login' },
      { key: 'posts' as const, label: 'Bai viet', help: 'Danh sach bai viet va moderation tools' },
      { key: 'reports' as const, label: 'Reports', help: 'Review queue va xu ly vi pham' },
      { key: 'violations' as const, label: 'Vi pham', help: 'Tong hop account/post dang bi canh bao' },
    ],
    [],
  )

  const loadOverviewData = async (silent = false) => {
    try {
      if (!silent) setOverviewLoading(true)
      const [stats, queue, topPosts, violations] = await Promise.all([
        adminApi.getAccountStats(months),
        adminApi.getReportedPosts({
          page: 1,
          limit: 6,
          status: 'pending',
          source: 'all',
        }),
        adminApi.getPosts({
          page: 1,
          limit: 6,
          sort: 'engagement_desc',
        }),
        adminApi.getViolations(true),
      ])
      setAccountStats(stats)
      setOverviewQueue(queue)
      setOverviewTopPosts(topPosts)
      setViolationsData(violations)
      setLastSyncedAt(new Date().toISOString())
    } catch (err) {
      setError(getErrorMessage(err, 'Khong tai duoc tong quan admin'))
    } finally {
      if (!silent) setOverviewLoading(false)
    }
  }

  const loadAccountsData = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const accounts = await adminApi.getAccounts({
        page: accountsPage,
        limit: 20,
        keyword: accountFilters.keyword,
        status: accountFilters.status,
      })
      setAccountsData(accounts)
      setAccountDraftMap((previous) => {
        const next = { ...previous }
        for (const item of accounts.items || []) {
          const previousDraft = previous[item.id]
          next[item.id] = previousDraft && hasAccountDraftChanged(item, previousDraft)
            ? { ...previousDraft }
            : toAccountDraft(item)
        }
        return next
      })
      setLastSyncedAt(new Date().toISOString())
    } catch (err) {
      setError(getErrorMessage(err, 'Khong tai duoc danh sach tai khoan'))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const loadPostsData = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const posts = await adminApi.getPosts({
        page: postsPage,
        limit: 20,
        startDate: postFilters.startDate,
        endDate: postFilters.endDate,
        sort: postFilters.sort,
      })
      setPostsData(posts)
      setLastSyncedAt(new Date().toISOString())
    } catch (err) {
      setError(getErrorMessage(err, 'Khong tai duoc danh sach bai viet'))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const loadReportsData = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const reports = await adminApi.getReportedPosts({
        page: reportsPage,
        limit: 20,
        startDate: reportFilters.startDate,
        endDate: reportFilters.endDate,
        status: reportFilters.status,
        source: reportFilters.source,
      })
      setReportsData(reports)
      setLastSyncedAt(new Date().toISOString())
    } catch (err) {
      setError(getErrorMessage(err, 'Khong tai duoc queue report'))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const loadViolationsData = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const violations = await adminApi.getViolations(true)
      setViolationsData(violations)
      setLastSyncedAt(new Date().toISOString())
    } catch (err) {
      setError(getErrorMessage(err, 'Khong tai duoc danh sach vi pham'))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const loadCurrentTab = async (silent = false) => {
    if (activeTab === 'overview') return loadOverviewData(silent)
    if (activeTab === 'accounts') return loadAccountsData(silent)
    if (activeTab === 'posts') return loadPostsData(silent)
    if (activeTab === 'reports') return loadReportsData(silent)
    return loadViolationsData(silent)
  }

  const refreshDashboard = async (silent = false) => {
    setError('')
    const tasks: Promise<unknown>[] = [loadOverviewData(silent)]
    if (activeTab !== 'overview') {
      tasks.push(loadCurrentTab(silent))
    }
    await Promise.allSettled(tasks)
  }

  useEffect(() => {
    if (!isAdmin) return
    void loadOverviewData(false)
  }, [isAdmin, months])

  useEffect(() => {
    if (!isAdmin) return
    if (activeTab === 'overview') return
    void loadCurrentTab(false)
  }, [
    activeTab,
    isAdmin,
    accountsPage,
    accountFilters,
    postsPage,
    postFilters,
    reportsPage,
    reportFilters,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.activeTab, activeTab)
  }, [activeTab])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.autoRefresh, autoRefresh ? '1' : '0')
  }, [autoRefresh])

  useEffect(() => {
    setPageSearch('')
  }, [activeTab])

  useEffect(() => {
    setSelectedReportIds((previous) => {
      const currentIds = new Set((reportsData?.items || []).map((item) => item.id))
      return previous.filter((id) => currentIds.has(id))
    })
  }, [reportsData])

  useEffect(() => {
    if (!autoRefresh || !isAdmin) return
    const timer = window.setInterval(() => {
      void refreshDashboard(true)
    }, AUTO_REFRESH_INTERVAL)
    return () => window.clearInterval(timer)
  }, [
    autoRefresh,
    isAdmin,
    activeTab,
    months,
    accountsPage,
    accountFilters,
    postsPage,
    postFilters,
    reportsPage,
    reportFilters,
  ])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (reportDecisionTarget && !reportDecisionSaving) {
        setReportDecisionTarget(null)
        return
      }
      if (postDetailOpen && !postDetailSaving) {
        setPostDetailOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [postDetailOpen, postDetailSaving, reportDecisionTarget, reportDecisionSaving])

  const updateAccountDraft = (id: string, patch: Partial<AccountDraft>) => {
    setAccountDraftMap((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] || {
          commentBlocked: false,
          messagingBlocked: false,
          likeBlocked: false,
          verified: false,
          dailyPostLimit: 0,
          accountLocked: false,
          lockReason: '',
          moderationStatus: 'normal',
          moderationReason: '',
        }),
        ...patch,
      },
    }))
  }

  const persistAccountRow = async (row: AdminAccountRow) => {
    const draft = accountDraftMap[row.id] || toAccountDraft(row)
    await Promise.all([
      adminApi.updateUserRestrictions(row.id, {
        commentBlocked: draft.commentBlocked,
        messagingBlocked: draft.messagingBlocked,
        likeBlocked: draft.likeBlocked,
        verified: draft.verified,
        dailyPostLimit: draft.dailyPostLimit,
        accountLocked: draft.accountLocked,
        lockReason: draft.lockReason,
      }),
      adminApi.updateUserModeration(row.id, {
        status: draft.moderationStatus,
        reason: draft.moderationReason.trim(),
      }),
    ])
  }

  const saveAccountRow = async (row: AdminAccountRow) => {
    setAccountSavingMap((previous) => ({ ...previous, [row.id]: true }))
    setError('')
    setSuccess('')
    try {
      await persistAccountRow(row)
      setSuccess(`Da luu thay doi cho @${row.username}`)
      await Promise.allSettled([loadAccountsData(true), loadOverviewData(true)])
    } catch (err) {
      setError(getErrorMessage(err, 'Khong cap nhat duoc tai khoan'))
    } finally {
      setAccountSavingMap((previous) => ({ ...previous, [row.id]: false }))
    }
  }

  const saveVisibleAccountChanges = async () => {
    const candidates = (accountsData?.items || []).filter((row) => {
      const draft = accountDraftMap[row.id] || toAccountDraft(row)
      return hasAccountDraftChanged(row, draft)
    })
    if (!candidates.length) {
      setSuccess('Khong co thay doi nao can luu trong trang hien tai.')
      return
    }

    const savingIds = Object.fromEntries(candidates.map((row) => [row.id, true]))
    setSavingVisibleAccounts(true)
    setAccountSavingMap((previous) => ({ ...previous, ...savingIds }))
    setError('')
    setSuccess('')

    try {
      const results = await Promise.allSettled(candidates.map((row) => persistAccountRow(row)))
      const successCount = results.filter((item) => item.status === 'fulfilled').length
      const firstFailure = results.find((item) => item.status === 'rejected') as PromiseRejectedResult | undefined

      if (firstFailure) {
        setError(getErrorMessage(firstFailure.reason, 'Co tai khoan luu that bai'))
      }
      setSuccess(`Da luu ${successCount}/${candidates.length} tai khoan trong trang hien tai.`)
      await Promise.allSettled([loadAccountsData(true), loadOverviewData(true)])
    } finally {
      setSavingVisibleAccounts(false)
      setAccountSavingMap((previous) => {
        const next = { ...previous }
        for (const row of candidates) {
          next[row.id] = false
        }
        return next
      })
    }
  }

  const resetAccountRow = (row: AdminAccountRow) => {
    updateAccountDraft(row.id, toAccountDraft(row))
  }

  const openPostDetail = async (postId: string, source: 'posts' | 'reports') => {
    setPostDetailSource(source)
    setPostDetailOpen(true)
    setPostDetailLoading(true)
    setPostDetailData(null)
    setPostModerationDraft(DEFAULT_POST_MODERATION_DRAFT)
    setError('')
    try {
      const detail = await adminApi.getPostDetail(postId)
      setPostDetailData(detail)
      setPostModerationDraft({
        status: normalizePostModerationStatus(detail.post.moderationStatus),
        reason: detail.post.moderationReason || '',
      })
    } catch (err) {
      setPostDetailOpen(false)
      setError(getErrorMessage(err, 'Khong tai duoc chi tiet bai viet'))
    } finally {
      setPostDetailLoading(false)
    }
  }

  const closePostDetail = (force = false) => {
    if (postDetailSaving && !force) return
    setPostDetailOpen(false)
    setPostDetailLoading(false)
    setPostDetailData(null)
    setPostModerationDraft(DEFAULT_POST_MODERATION_DRAFT)
  }

  const savePostModeration = async () => {
    const postId = postDetailData?.post?.id
    if (!postId) return

    setPostDetailSaving(true)
    setError('')
    setSuccess('')
    try {
      await adminApi.updatePostModeration(postId, {
        status: postModerationDraft.status,
        reason: postModerationDraft.reason.trim(),
      })
      const detail = await adminApi.getPostDetail(postId)
      setPostDetailData(detail)
      setPostModerationDraft({
        status: normalizePostModerationStatus(detail.post.moderationStatus),
        reason: detail.post.moderationReason || postModerationDraft.reason,
      })
      setSuccess('Da cap nhat moderation cho bai viet.')
      await Promise.allSettled([loadOverviewData(true), loadCurrentTab(true)])
    } catch (err) {
      setError(getErrorMessage(err, 'Khong cap nhat duoc moderation bai viet'))
    } finally {
      setPostDetailSaving(false)
    }
  }

  const runPostActionFromDetail = async (action: PostAction) => {
    const postId = postDetailData?.post?.id
    if (!postId) return
    if (action === 'delete_post' && !window.confirm('Xoa bai viet nay khoi he thong?')) return

    setPostDetailSaving(true)
    setError('')
    setSuccess('')

    try {
      await adminApi.applyPostAction(postId, {
        action,
        reason: postModerationDraft.reason.trim(),
      })
      const actionLabel =
        action === 'delete_post'
          ? 'xoa bai viet'
          : action === 'lock_comments'
            ? 'khoa comment'
            : 'mo lai comment'
      setSuccess(`Da ${actionLabel} thanh cong.`)
      if (action === 'delete_post') {
        closePostDetail(true)
      } else {
        const detail = await adminApi.getPostDetail(postId)
        setPostDetailData(detail)
      }
      await Promise.allSettled([loadOverviewData(true), loadCurrentTab(true)])
    } catch (err) {
      setError(getErrorMessage(err, 'Khong ap dung duoc thao tac bai viet'))
    } finally {
      setPostDetailSaving(false)
    }
  }

  const runQuickPostAction = async (row: AdminPostRow, action: PostAction) => {
    if (action === 'delete_post' && !window.confirm('Xoa bai viet nay khoi he thong?')) return

    setPostActionSavingMap((previous) => ({ ...previous, [row.id]: true }))
    setError('')
    setSuccess('')
    try {
      await adminApi.applyPostAction(row.id, { action })
      setSuccess(
        action === 'lock_comments'
          ? 'Da khoa comment cho bai viet.'
          : action === 'unlock_comments'
            ? 'Da mo lai comment cho bai viet.'
            : 'Da xoa bai viet thanh cong.',
      )
      await Promise.allSettled([loadOverviewData(true), loadCurrentTab(true)])
    } catch (err) {
      setError(getErrorMessage(err, 'Khong ap dung duoc thao tac bai viet'))
    } finally {
      setPostActionSavingMap((previous) => ({ ...previous, [row.id]: false }))
    }
  }

  const openReportDecisionModal = (
    ids: string[],
    label: string,
    defaultActions: ReportDecision[] = ['no_violation'],
    source: 'reports' | 'detail' = 'reports',
  ) => {
    setReportDecisionTarget({ ids, label, source })
    setReportDecisionActions(defaultActions)
    setReportDecisionReason('')
  }

  const saveReportDecision = async () => {
    if (!reportDecisionTarget?.ids.length) return
    const actions = sanitizeReportActions(reportDecisionActions)

    setReportDecisionSaving(true)
    setError('')
    setSuccess('')
    try {
      const results = await Promise.allSettled(
        reportDecisionTarget.ids.map((postId) =>
          adminApi.resolveReportedPost(postId, {
            actions,
            decision: actions[0],
            reason: reportDecisionReason.trim(),
          }),
        ),
      )
      const successCount = results.filter((item) => item.status === 'fulfilled').length
      const firstFailure = results.find((item) => item.status === 'rejected') as PromiseRejectedResult | undefined
      if (firstFailure) {
        setError(getErrorMessage(firstFailure.reason, 'Co report xu ly that bai'))
      }
      setSuccess(`Da xu ly ${successCount}/${reportDecisionTarget.ids.length} item trong queue.`)
      setSelectedReportIds((previous) => previous.filter((id) => !reportDecisionTarget.ids.includes(id)))
      setReportDecisionTarget(null)
      if (reportDecisionTarget.source === 'detail') {
        closePostDetail()
      }
      await Promise.allSettled([loadOverviewData(true), loadReportsData(true), loadViolationsData(true)])
    } finally {
      setReportDecisionSaving(false)
    }
  }

  const selectedReportRows = useMemo(() => {
    const reportMap = new Map((reportsData?.items || []).map((item) => [item.id, item]))
    return selectedReportIds.map((id) => reportMap.get(id)).filter(Boolean) as AdminPostRow[]
  }, [reportsData, selectedReportIds])

  const overviewPendingTotal = overviewQueue?.total || 0
  const violationSummary = violationsData?.summary || { violatingAccounts: 0, violatingPosts: 0 }
  const riskAccounts = useMemo(() => {
    return [...(violationsData?.accounts || [])]
      .sort((left, right) => {
        const leftScore = (left.accountLocked ? 100 : 0) + (left.strikesCount || 0) * 10
        const rightScore = (right.accountLocked ? 100 : 0) + (right.strikesCount || 0) * 10
        return rightScore - leftScore
      })
      .slice(0, 6)
  }, [violationsData])

  const visibleAccounts = useMemo(() => {
    return (accountsData?.items || []).filter((row) =>
      matchesSearch(
        [
          row.username,
          row.email,
          row.role,
          row.moderationStatus,
          row.moderationReason,
          row.accountLockedReason,
          row.strikesCount,
        ],
        deferredSearch,
      ),
    )
  }, [accountsData, deferredSearch])

  const visiblePosts = useMemo(() => {
    return (postsData?.items || []).filter((row) =>
      matchesSearch(
        [
          row.title,
          row.fullTitle,
          row.authorUsername,
          row.moderationStatus,
          row.moderationReason,
          row.reportCount,
        ],
        deferredSearch,
      ),
    )
  }, [postsData, deferredSearch])

  const visibleReports = useMemo(() => {
    return (reportsData?.items || []).filter((row) =>
      matchesSearch(
        [
          row.title,
          row.authorUsername,
          row.latestReason,
          row.reportSource,
          row.moderationStatus,
          row.pendingCount,
        ],
        deferredSearch,
      ),
    )
  }, [reportsData, deferredSearch])

  const visibleViolationAccounts = useMemo(() => {
    return (violationsData?.accounts || []).filter((row) =>
      matchesSearch(
        [
          row.username,
          row.email,
          row.moderationStatus,
          row.moderationReason,
          row.accountLockedReason,
          row.strikesCount,
        ],
        deferredSearch,
      ),
    )
  }, [violationsData, deferredSearch])

  const visibleViolationPosts = useMemo(() => {
    return (violationsData?.posts || []).filter((row) =>
      matchesSearch(
        [
          row.title,
          row.authorUsername,
          row.moderationStatus,
          row.moderationReason,
          row.reportCount,
        ],
        deferredSearch,
      ),
    )
  }, [violationsData, deferredSearch])

  const accountSummary = useMemo(() => {
    return {
      locked: visibleAccounts.filter((row) => row.accountLocked).length,
      warning: visibleAccounts.filter((row) => row.moderationStatus === 'warning').length,
      violating: visibleAccounts.filter((row) => row.moderationStatus === 'violating').length,
      changed: visibleAccounts.filter((row) => hasAccountDraftChanged(row, accountDraftMap[row.id] || toAccountDraft(row))).length,
    }
  }, [accountDraftMap, visibleAccounts])

  const postSummary = useMemo(() => {
    const totalEngagement = visiblePosts.reduce((sum, row) => sum + (row.engagementCount || 0), 0)
    const totalReports = visiblePosts.reduce((sum, row) => sum + (row.reportCount || 0), 0)
    const lockedComments = visiblePosts.filter((row) => row.allowComments === false).length
    return {
      totalEngagement,
      totalReports,
      lockedComments,
      averageEngagement: visiblePosts.length ? Math.round(totalEngagement / visiblePosts.length) : 0,
    }
  }, [visiblePosts])

  const reportSummary = useMemo(() => {
    return {
      pending: visibleReports.reduce((sum, row) => sum + (row.pendingCount || 0), 0),
      autoFlagged: visibleReports.filter((row) => row.reportSource === 'auto_nsfw').length,
      deletedSnapshots: visibleReports.filter((row) => row.postExists === false).length,
      selected: selectedReportRows.length,
    }
  }, [selectedReportRows.length, visibleReports])

  const allVisibleReportsSelected = useMemo(() => {
    if (!visibleReports.length) return false
    return visibleReports.every((row) => selectedReportIds.includes(row.id))
  }, [selectedReportIds, visibleReports])

  const overviewGrowth = useMemo(() => {
    const monthly = accountStats?.monthly || []
    const last = monthly[monthly.length - 1]
    const prev = monthly[monthly.length - 2]
    const accountDelta = (last?.newAccounts || 0) - (prev?.newAccounts || 0)
    const loginDelta = (last?.loginCount || 0) - (prev?.loginCount || 0)
    return { accountDelta, loginDelta }
  }, [accountStats])

  const quickSearchPlaceholder = {
    overview: 'Tim nhanh card, post, report trong dashboard',
    accounts: 'Loc nhanh trong tai khoan dang hien thi',
    posts: 'Loc nhanh trong bai viet dang hien thi',
    reports: 'Loc nhanh trong queue report dang hien thi',
    violations: 'Loc nhanh trong danh sach vi pham',
  }[activeTab]

  const headerBusy = loading || overviewLoading || savingVisibleAccounts || reportDecisionSaving || postDetailSaving

  const exportCurrentView = () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    if (activeTab === 'accounts') {
      const rows: Array<Array<unknown>> = [
        ['Username', 'Email', 'Role', 'Moderation', 'Locked', 'Strikes', 'LoginCount', 'LastLogin', 'DailyPostLimit'],
        ...visibleAccounts.map((row) => {
          const draft = accountDraftMap[row.id] || toAccountDraft(row)
          return [
            row.username,
            row.email,
            row.role,
            draft.moderationStatus,
            draft.accountLocked ? 'Yes' : 'No',
            row.strikesCount,
            row.loginCount,
            row.lastLoginAt || '',
            draft.dailyPostLimit,
          ]
        }),
      ]
      downloadCsv(`admin-accounts-${timestamp}.csv`, rows)
      setSuccess(`Da xuat ${visibleAccounts.length} tai khoan ra CSV.`)
      return
    }

    if (activeTab === 'posts') {
      const rows: Array<Array<unknown>> = [
        ['Title', 'Author', 'CreatedAt', 'Likes', 'Comments', 'Reports', 'Engagement', 'Moderation', 'CommentsOpen'],
        ...visiblePosts.map((row) => [
          row.fullTitle || row.title,
          row.authorUsername,
          row.createdAt || '',
          row.likesCount,
          row.commentsCount,
          row.reportCount || 0,
          row.engagementCount,
          row.moderationStatus || 'normal',
          row.allowComments === false ? 'Locked' : 'Open',
        ]),
      ]
      downloadCsv(`admin-posts-${timestamp}.csv`, rows)
      setSuccess(`Da xuat ${visiblePosts.length} bai viet ra CSV.`)
      return
    }

    if (activeTab === 'reports') {
      const rows: Array<Array<unknown>> = [
        ['Title', 'Author', 'ReportCount', 'PendingCount', 'LatestReason', 'LatestReportedAt', 'Source', 'Moderation'],
        ...visibleReports.map((row) => [
          row.fullTitle || row.title,
          row.authorUsername,
          row.reportCount || 0,
          row.pendingCount || 0,
          row.latestReason || '',
          row.lastReportedAt || '',
          row.reportSource || '',
          row.moderationStatus || 'normal',
        ]),
      ]
      downloadCsv(`admin-reports-${timestamp}.csv`, rows)
      setSuccess(`Da xuat ${visibleReports.length} report queue item ra CSV.`)
      return
    }

    if (activeTab === 'violations') {
      const rows: Array<Array<unknown>> = [
        ['Section', 'Primary', 'Secondary', 'Status', 'Reason', 'Metric1', 'Metric2'],
        ...visibleViolationAccounts.map((row) => [
          'Account',
          row.username,
          row.email,
          row.accountLocked ? 'locked' : row.moderationStatus,
          row.accountLocked ? row.accountLockedReason : row.moderationReason,
          row.strikesCount,
          row.loginCount,
        ]),
        ...visibleViolationPosts.map((row) => [
          'Post',
          row.title,
          row.authorUsername,
          row.moderationStatus,
          row.moderationReason,
          row.reportCount,
          row.engagementCount,
        ]),
      ]
      downloadCsv(`admin-violations-${timestamp}.csv`, rows)
      setSuccess('Da xuat danh sach vi pham ra CSV.')
      return
    }

    const rows: Array<Array<unknown>> = [
      ['Metric', 'Value'],
      ['Tong tai khoan', accountStats?.summary?.totalAccounts || 0],
      ['Tong luot dang nhap', accountStats?.summary?.totalLogins || 0],
      ['Hoat dong 30 ngay', accountStats?.summary?.activeLast30Days || 0],
      ['Queue pending', overviewPendingTotal],
      ['Tai khoan vi pham', violationSummary.violatingAccounts],
      ['Bai viet vi pham', violationSummary.violatingPosts],
    ]
    downloadCsv(`admin-overview-${timestamp}.csv`, rows)
    setSuccess('Da xuat tong quan admin ra CSV.')
  }

  if (!isAdmin) {
    return (
      <div className={`${styles.page} ${responsiveStyles.page}`}>
        <div className={styles.unauthorized}>
          <h2>Khong co quyen truy cap</h2>
          <p>Tai khoan hien tai khong co role admin nen khong the mo dashboard quan tri.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.page} ${responsiveStyles.page}`}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>Admin Control Center</div>
          <h1 className={styles.title}>Nang cap dashboard quan tri de review nhanh hon va an toan hon.</h1>
          <p className={styles.subtitle}>
            Giao dien moi uu tien queue report, moderation tools, trend theo thang va thao tac nhanh tren tung bai viet/tai khoan.
          </p>
          <div className={styles.heroMeta}>
            <Badge tone={headerBusy ? 'warning' : 'success'}>{headerBusy ? 'Dang dong bo du lieu' : 'San sang thao tac'}</Badge>
            <span>Lan dong bo cuoi: {formatDate(lastSyncedAt)}</span>
            <span>Auto refresh: {autoRefresh ? 'Bat (60s)' : 'Tat'}</span>
          </div>
          <div className={styles.heroActions}>
            <button type="button" className={styles.primaryButton} onClick={() => void refreshDashboard(false)} disabled={headerBusy}>
              Lam moi dashboard
            </button>
            <button type="button" className={styles.secondaryButton} onClick={exportCurrentView}>
              Export CSV
            </button>
            <label className={styles.toggleInline}>
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
              <span>Auto refresh</span>
            </label>
          </div>
        </div>

        <div className={styles.heroAside}>
          <div className={styles.heroPanel}>
            <div className={styles.heroPanelHeader}>
              <div>
                <div className={styles.sectionEyebrow}>Trend {months} thang</div>
                <h2 className={styles.sectionTitle}>Tai khoan moi va dang nhap</h2>
              </div>
              <label className={styles.inlineField}>
                <span>Khoang thang</span>
                <select value={months} onChange={(event) => setMonths(Number(event.target.value) || 12)}>
                  <option value={6}>6 thang</option>
                  <option value={12}>12 thang</option>
                  <option value={18}>18 thang</option>
                  <option value={24}>24 thang</option>
                </select>
              </label>
            </div>
            <div className={styles.chartLegend}>
              <Badge tone="info">Tai khoan moi {overviewGrowth.accountDelta >= 0 ? `+${overviewGrowth.accountDelta}` : overviewGrowth.accountDelta}</Badge>
              <Badge tone="neutral">Dang nhap {overviewGrowth.loginDelta >= 0 ? `+${overviewGrowth.loginDelta}` : overviewGrowth.loginDelta}</Badge>
            </div>
            <div className={styles.trendChart}>
              {(accountStats?.monthly || []).length ? (
                (() => {
                  const maxValue = Math.max(
                    1,
                    ...(accountStats?.monthly || []).flatMap((item) => [item.newAccounts || 0, item.loginCount || 0]),
                  )
                  return (accountStats?.monthly || []).map((item) => (
                    <div key={item.month} className={styles.trendColumn}>
                      <div className={styles.trendBars}>
                        <span
                          className={`${styles.trendBar} ${styles.trendBarInfo}`}
                          style={{ height: `${((item.newAccounts || 0) / maxValue) * 100}%` }}
                          title={`Tai khoan moi: ${item.newAccounts}`}
                        />
                        <span
                          className={`${styles.trendBar} ${styles.trendBarNeutral}`}
                          style={{ height: `${((item.loginCount || 0) / maxValue) * 100}%` }}
                          title={`Dang nhap: ${item.loginCount}`}
                        />
                      </div>
                      <div className={styles.trendLabel}>{formatMonthLabel(item.month)}</div>
                    </div>
                  ))
                })()
              ) : (
                <div className={styles.chartEmpty}>Chua co du lieu trend.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className={styles.metricGrid}>
        <MetricCard label="Tong tai khoan" value={formatNumber(accountStats?.summary?.totalAccounts)} help="Tong so user tren he thong" tone="info" />
        <MetricCard label="Tong dang nhap" value={formatNumber(accountStats?.summary?.totalLogins)} help="Tong login ghi nhan duoc" tone="neutral" />
        <MetricCard label="Hoat dong 30 ngay" value={formatNumber(accountStats?.summary?.activeLast30Days)} help="Tai khoan co login 30 ngay gan nhat" tone="success" />
        <MetricCard label="Queue dang cho" value={formatNumber(overviewPendingTotal)} help="Bai viet dang co report pending" tone="warning" />
        <MetricCard label="Tai khoan can xu ly" value={formatNumber(violationSummary.violatingAccounts)} help="Warning/violating/locked/strike" tone="danger" />
        <MetricCard label="Bai viet vi pham" value={formatNumber(violationSummary.violatingPosts)} help="Bai viet moderationStatus = violating" tone="danger" />
      </div>

      <section className={styles.toolbar}>
        <div className={`${styles.tabs} ${responsiveStyles.tabs}`}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ''}`}
              onClick={() => startTransition(() => setActiveTab(tab.key))}
            >
              <span>{tab.label}</span>
              <small>{tab.help}</small>
            </button>
          ))}
        </div>

        <div className={styles.toolbarControls}>
          <label className={styles.searchBox}>
            <span>Tim nhanh</span>
            <input value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder={quickSearchPlaceholder} />
          </label>
          <button type="button" className={styles.secondaryButton} onClick={() => void loadCurrentTab(false)} disabled={headerBusy}>
            Lam moi tab
          </button>
        </div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}
      {(loading || overviewLoading) && !error ? <div className={styles.loading}>Dang tai du lieu...</div> : null}

      {activeTab === 'overview' ? (
        <section className={`${styles.panel} ${responsiveStyles.panel}`}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionEyebrow}>Tong quan he thong</div>
              <h2 className={styles.sectionTitle}>Cac queue va diem nong can admin uu tien</h2>
            </div>
          </div>

          <div className={styles.overviewGrid}>
            <div className={styles.surfaceCard}>
              <div className={styles.surfaceHeader}>
                <div>
                  <div className={styles.cardTitle}>Top login users</div>
                  <div className={styles.cardSubtitle}>User dang hoat dong nhieu nhat gan day</div>
                </div>
                <button type="button" className={styles.inlineLink} onClick={() => startTransition(() => setActiveTab('accounts'))}>
                  Mo tab tai khoan
                </button>
              </div>
              {(accountStats?.topLoginUsers || []).length ? (
                <div className={styles.miniList}>
                  {(accountStats?.topLoginUsers || []).map((user) => (
                    <div key={user.id} className={styles.miniListItem}>
                      <div>
                        <div className={styles.miniListTitle}>@{user.username}</div>
                        <div className={styles.miniListMeta}>
                          <Badge tone={user.role === 'admin' ? 'info' : 'neutral'}>{user.role}</Badge>
                          <span>{formatDate(user.lastLoginAt)}</span>
                        </div>
                      </div>
                      <strong>{formatNumber(user.loginCount)} login</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Chua co du lieu login" text="Khi co login activity, khu vuc nay se hien top user." />
              )}
            </div>

            <div className={styles.surfaceCard}>
              <div className={styles.surfaceHeader}>
                <div>
                  <div className={styles.cardTitle}>Risky accounts</div>
                  <div className={styles.cardSubtitle}>Tai khoan khoa, co strike, hoac dang warning</div>
                </div>
                <button type="button" className={styles.inlineLink} onClick={() => startTransition(() => setActiveTab('violations'))}>
                  Mo tab vi pham
                </button>
              </div>
              {riskAccounts.length ? (
                <div className={styles.miniList}>
                  {riskAccounts.map((row) => (
                    <div key={row.id} className={styles.miniListItem}>
                      <div>
                        <div className={styles.miniListTitle}>@{row.username}</div>
                        <div className={styles.miniListMeta}>
                          <Badge tone={badgeToneForAccount(row.moderationStatus, row.accountLocked)}>
                            {row.accountLocked ? 'locked' : row.moderationStatus}
                          </Badge>
                          <span>{row.accountLocked ? row.accountLockedReason || 'Khoa boi admin' : row.moderationReason || '--'}</span>
                        </div>
                      </div>
                      <strong>{row.strikesCount} gay</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Chua co risk account" text="He thong dang o trang thai on dinh." />
              )}
            </div>

            <div className={styles.surfaceCard}>
              <div className={styles.surfaceHeader}>
                <div>
                  <div className={styles.cardTitle}>Pending report queue</div>
                  <div className={styles.cardSubtitle}>Uu tien review bai viet dang cho xu ly</div>
                </div>
                <button type="button" className={styles.inlineLink} onClick={() => startTransition(() => setActiveTab('reports'))}>
                  Mo queue
                </button>
              </div>
              {(overviewQueue?.items || []).length ? (
                <div className={styles.miniList}>
                  {(overviewQueue?.items || []).map((row) => (
                    <div key={row.id} className={styles.miniListItem}>
                      <div>
                        <div className={styles.miniListTitle}>{row.title}</div>
                        <div className={styles.miniListMeta}>
                          <Badge tone="warning">{row.pendingCount || 0} pending</Badge>
                          <span>@{row.authorUsername}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => {
                          startTransition(() => setActiveTab('reports'))
                          void openPostDetail(row.id, 'reports')
                        }}
                      >
                        Review
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Queue rong" text="Khong co bai viet nao dang pending report." />
              )}
            </div>

            <div className={`${styles.surfaceCard} ${styles.surfaceCardWide}`}>
              <div className={styles.surfaceHeader}>
                <div>
                  <div className={styles.cardTitle}>Popular posts snapshot</div>
                  <div className={styles.cardSubtitle}>Nhanh tay vao post co tuong tac cao va de phat sinh moderation</div>
                </div>
                <button type="button" className={styles.inlineLink} onClick={() => startTransition(() => setActiveTab('posts'))}>
                  Mo danh sach bai viet
                </button>
              </div>
              {(overviewTopPosts?.items || []).length ? (
                <div className={styles.snapshotGrid}>
                  {(overviewTopPosts?.items || []).map((row) => {
                    const previewUrl = resolveMediaUrl(row.thumbnailUrl || '')
                    return (
                      <article key={row.id} className={styles.snapshotCard}>
                        {previewUrl ? (
                          isVideoPreview(row.mediaType, previewUrl) ? (
                            <video className={styles.snapshotMedia} src={previewUrl} muted playsInline preload="metadata" />
                          ) : (
                            <img className={styles.snapshotMedia} src={previewUrl} alt={row.title} />
                          )
                        ) : (
                          <div className={styles.snapshotFallback}>No media</div>
                        )}
                        <div className={styles.snapshotBody}>
                          <h3>{row.title}</h3>
                          <p>@{row.authorUsername}</p>
                          <div className={styles.snapshotStats}>
                            <Badge tone="info">{formatNumber(row.engagementCount)} engagement</Badge>
                            <Badge tone={row.reportCount ? 'warning' : 'neutral'}>{formatNumber(row.reportCount || 0)} report</Badge>
                          </div>
                          <div className={styles.inlineActions}>
                            <button type="button" className={styles.ghostButton} onClick={() => void openPostDetail(row.id, 'posts')}>
                              Xem chi tiet
                            </button>
                            <a className={styles.inlineLink} href={`/post/${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">
                              Mo bai viet
                            </a>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <EmptyState title="Chua co snapshot" text="Khi co bai viet, khu vuc nay se hien danh sach engagement cao." />
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'accounts' ? (
        <section className={`${styles.panel} ${responsiveStyles.panel}`}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionEyebrow}>User moderation</div>
              <h2 className={styles.sectionTitle}>Quan ly tai khoan, login va gioi han tu dashboard moi</h2>
            </div>
            <div className={styles.inlineActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => {
                setAccountsPage(1)
                setAccountDraftFilters(DEFAULT_ACCOUNT_FILTERS)
                startTransition(() => setAccountFilters(DEFAULT_ACCOUNT_FILTERS))
              }}>
                Reset bo loc
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void saveVisibleAccountChanges()}
                disabled={savingVisibleAccounts || accountSummary.changed === 0}
              >
                {savingVisibleAccounts ? 'Dang luu...' : `Luu ${accountSummary.changed} thay doi`}
              </button>
            </div>
          </div>

          <div className={`${styles.filters} ${responsiveStyles.filters}`}>
            <label className={styles.inlineField}>
              <span>Tim tai khoan</span>
              <input
                value={accountDraftFilters.keyword}
                onChange={(event) => setAccountDraftFilters((previous) => ({ ...previous, keyword: event.target.value }))}
                placeholder="username/email"
              />
            </label>
            <label className={styles.inlineField}>
              <span>Trang thai</span>
              <select
                value={accountDraftFilters.status}
                onChange={(event) =>
                  setAccountDraftFilters((previous) => ({
                    ...previous,
                    status: event.target.value as 'all' | 'active' | 'locked',
                  }))
                }
              >
                <option value="all">Tat ca</option>
                <option value="active">Dang hoat dong</option>
                <option value="locked">Da khoa</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                setAccountsPage(1)
                startTransition(() => setAccountFilters({ ...accountDraftFilters }))
              }}
            >
              Loc
            </button>
          </div>

          <div className={styles.metricGridCompact}>
            <MetricCard label="Dang hien thi" value={formatNumber(visibleAccounts.length)} help="So row sau quick search" tone="info" />
            <MetricCard label="Da khoa" value={formatNumber(accountSummary.locked)} help="Tai khoan dang bi khoa" tone="danger" />
            <MetricCard label="Warning" value={formatNumber(accountSummary.warning)} help="Can admin theo doi" tone="warning" />
            <MetricCard label="Violating" value={formatNumber(accountSummary.violating)} help="Dang o muc vi pham" tone="danger" />
          </div>

          <div className={styles.surfaceCard}>
            <div className={styles.surfaceHeader}>
              <div>
                <div className={styles.cardTitle}>Top login trong giai doan da chon</div>
                <div className={styles.cardSubtitle}>Huu ich khi can so sanh activity voi restriction/moderation</div>
              </div>
            </div>
            {(accountStats?.topLoginUsers || []).length ? (
              <div className={styles.loginStrip}>
                {(accountStats?.topLoginUsers || []).slice(0, 6).map((user) => (
                  <div key={user.id} className={styles.loginStripCard}>
                    <strong>@{user.username}</strong>
                    <span>{formatNumber(user.loginCount)} login</span>
                    <small>{formatDate(user.lastLoginAt)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Chua co du lieu" text="Top login se hien o day khi backend tra ve activity." />
            )}
          </div>

          <div className={styles.tableCard}>
            {visibleAccounts.length ? (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Tai khoan</th>
                        <th>Hoat dong</th>
                        <th>Moderation</th>
                        <th>Restrictions</th>
                        <th>Khoa / ghi chu</th>
                        <th>Hanh dong</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAccounts.map((row) => {
                        const draft = accountDraftMap[row.id] || toAccountDraft(row)
                        const changed = hasAccountDraftChanged(row, draft)
                        return (
                          <tr key={row.id} className={changed ? styles.rowDirty : ''}>
                            <td>
                              <div className={styles.cellStack}>
                                <strong>@{row.username}</strong>
                                <span>{row.email}</span>
                                <div className={styles.badgeGroup}>
                                  <Badge tone={row.role === 'admin' ? 'info' : 'neutral'}>{row.role}</Badge>
                                  {draft.verified ? <Badge tone="success">verified</Badge> : null}
                                  <Badge tone={badgeToneForAccount(draft.moderationStatus, draft.accountLocked)}>
                                    {draft.accountLocked ? 'locked' : draft.moderationStatus}
                                  </Badge>
                                  {row.strikesCount > 0 ? <Badge tone="warning">{row.strikesCount} gay</Badge> : null}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className={styles.cellStack}>
                                <strong>{formatNumber(row.loginCount)} login</strong>
                                <span>Lan cuoi: {formatDate(row.lastLoginAt)}</span>
                                <span>Tao luc: {formatDate(row.createdAt)}</span>
                              </div>
                            </td>
                            <td>
                              <div className={styles.cellStack}>
                                <select
                                  className={styles.fullInput}
                                  value={draft.moderationStatus}
                                  onChange={(event) =>
                                    updateAccountDraft(row.id, {
                                      moderationStatus: event.target.value as AccountModerationStatus,
                                    })
                                  }
                                >
                                  {ACCOUNT_MODERATION_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <textarea
                                  className={styles.textArea}
                                  rows={3}
                                  value={draft.moderationReason}
                                  onChange={(event) => updateAccountDraft(row.id, { moderationReason: event.target.value })}
                                  placeholder="Ly do moderation / ghi chu noi bo"
                                />
                              </div>
                            </td>
                            <td>
                              <div className={styles.controlGroup}>
                                <Toggle checked={draft.verified} label="Tick xanh" onChange={(next) => updateAccountDraft(row.id, { verified: next })} />
                                <Toggle checked={draft.commentBlocked} label="Chan comment" onChange={(next) => updateAccountDraft(row.id, { commentBlocked: next })} />
                                <Toggle checked={draft.messagingBlocked} label="Chan message" onChange={(next) => updateAccountDraft(row.id, { messagingBlocked: next })} />
                                <Toggle checked={draft.likeBlocked} label="Chan like" onChange={(next) => updateAccountDraft(row.id, { likeBlocked: next })} />
                                <label className={styles.inlineFieldCompact}>
                                  <span>Gioi han bai/ngay</span>
                                  <input
                                    className={styles.fullInput}
                                    type="number"
                                    min={0}
                                    value={draft.dailyPostLimit}
                                    onChange={(event) =>
                                      updateAccountDraft(row.id, {
                                        dailyPostLimit: Math.max(Number(event.target.value) || 0, 0),
                                      })
                                    }
                                  />
                                </label>
                              </div>
                            </td>
                            <td>
                              <div className={styles.cellStack}>
                                <Toggle checked={draft.accountLocked} label={draft.accountLocked ? 'Dang khoa' : 'Dang mo'} onChange={(next) => updateAccountDraft(row.id, { accountLocked: next })} />
                                <textarea
                                  className={styles.textArea}
                                  rows={3}
                                  value={draft.lockReason}
                                  onChange={(event) => updateAccountDraft(row.id, { lockReason: event.target.value })}
                                  placeholder="Ly do khoa tai khoan"
                                />
                              </div>
                            </td>
                            <td>
                              <div className={styles.actionColumn}>
                                <button
                                  type="button"
                                  className={styles.primaryButton}
                                  disabled={!!accountSavingMap[row.id]}
                                  onClick={() => void saveAccountRow(row)}
                                >
                                  {accountSavingMap[row.id] ? 'Dang luu...' : 'Luu'}
                                </button>
                                <button type="button" className={styles.secondaryButton} onClick={() => resetAccountRow(row)}>
                                  Reset row
                                </button>
                                <a className={styles.inlineLink} href={`/profile/${encodeURIComponent(row.username)}`} target="_blank" rel="noreferrer">
                                  Mo profile
                                </a>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className={styles.pagination}>
                  <button type="button" onClick={() => setAccountsPage((previous) => Math.max(previous - 1, 1))} disabled={accountsPage <= 1}>
                    Truoc
                  </button>
                  <span>Trang {accountsData?.page}/{accountsData?.totalPages} • {formatNumber(accountsData?.total)} tai khoan</span>
                  <button
                    type="button"
                    onClick={() => setAccountsPage((previous) => Math.min(previous + 1, accountsData?.totalPages || 1))}
                    disabled={accountsPage >= (accountsData?.totalPages || 1)}
                  >
                    Sau
                  </button>
                </div>
              </>
            ) : (
              <EmptyState title="Khong co tai khoan phu hop" text="Thu doi bo loc server hoac bo quick search." />
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'posts' ? (
        <section className={`${styles.panel} ${responsiveStyles.panel}`}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionEyebrow}>Content moderation</div>
              <h2 className={styles.sectionTitle}>Giam bot so cot, tang quick action cho bai viet</h2>
            </div>
          </div>

          <div className={`${styles.filters} ${responsiveStyles.filters}`}>
            <label className={styles.inlineField}>
              <span>Tu ngay</span>
              <input
                type="date"
                value={postDraftFilters.startDate}
                onChange={(event) => setPostDraftFilters((previous) => ({ ...previous, startDate: event.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Den ngay</span>
              <input
                type="date"
                value={postDraftFilters.endDate}
                onChange={(event) => setPostDraftFilters((previous) => ({ ...previous, endDate: event.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Sap xep engagement</span>
              <select
                value={postDraftFilters.sort}
                onChange={(event) =>
                  setPostDraftFilters((previous) => ({
                    ...previous,
                    sort: event.target.value as 'engagement_desc' | 'engagement_asc',
                  }))
                }
              >
                <option value="engagement_desc">Giam dan</option>
                <option value="engagement_asc">Tang dan</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                setPostsPage(1)
                startTransition(() => setPostFilters({ ...postDraftFilters }))
              }}
            >
              Loc
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setPostsPage(1)
                setPostDraftFilters(DEFAULT_POST_FILTERS)
                startTransition(() => setPostFilters(DEFAULT_POST_FILTERS))
              }}
            >
              Reset
            </button>
          </div>

          <div className={styles.metricGridCompact}>
            <MetricCard label="Dang hien thi" value={formatNumber(visiblePosts.length)} help="So bai viet sau quick search" tone="info" />
            <MetricCard label="Tong engagement" value={formatNumber(postSummary.totalEngagement)} help="Like + comment tren rows dang hien thi" tone="success" />
            <MetricCard label="Tong report" value={formatNumber(postSummary.totalReports)} help="Dau hieu can moderation" tone="warning" />
            <MetricCard label="Comment dang khoa" value={formatNumber(postSummary.lockedComments)} help="Co the mo lai ngay trong bang" tone="neutral" />
          </div>

          <div className={styles.tableCard}>
            {visiblePosts.length ? (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Bai viet</th>
                        <th>Metrics</th>
                        <th>Trang thai</th>
                        <th>Thoi gian</th>
                        <th>Hanh dong</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePosts.map((row) => {
                        const previewUrl = resolveMediaUrl(row.thumbnailUrl || '')
                        const saving = !!postActionSavingMap[row.id]
                        return (
                          <tr key={row.id}>
                            <td>
                              <div className={styles.postCell}>
                                {previewUrl ? (
                                  isVideoPreview(row.mediaType, previewUrl) ? (
                                    <video className={styles.tableThumb} src={previewUrl} muted playsInline preload="metadata" />
                                  ) : (
                                    <img className={styles.tableThumb} src={previewUrl} alt={row.title} />
                                  )
                                ) : (
                                  <div className={styles.tableThumbFallback}>No media</div>
                                )}
                                <div className={styles.cellStack}>
                                  <strong>{row.title}</strong>
                                  <span>@{row.authorUsername}</span>
                                  <div className={styles.badgeGroup}>
                                    <Badge tone={badgeToneForPost(row.moderationStatus)}>{row.moderationStatus || 'normal'}</Badge>
                                    <Badge tone={row.allowComments === false ? 'warning' : 'success'}>
                                      {row.allowComments === false ? 'comments locked' : 'comments open'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className={styles.metricList}>
                                <span>Like: <strong>{formatNumber(row.likesCount)}</strong></span>
                                <span>Comment: <strong>{formatNumber(row.commentsCount)}</strong></span>
                                <span>Report: <strong>{formatNumber(row.reportCount || 0)}</strong></span>
                                <span>Engagement: <strong>{formatNumber(row.engagementCount)}</strong></span>
                              </div>
                            </td>
                            <td>
                              <div className={styles.cellStack}>
                                {row.moderationReason ? <span>{row.moderationReason}</span> : <span>Chua co ly do moderation</span>}
                                {row.reportCount ? <Badge tone="warning">Can review report</Badge> : null}
                              </div>
                            </td>
                            <td>
                              <div className={styles.cellStack}>
                                <strong>{formatDate(row.createdAt)}</strong>
                                <span>TB engagement: {formatNumber(postSummary.averageEngagement)}</span>
                              </div>
                            </td>
                            <td>
                              <div className={styles.actionColumn}>
                                <button type="button" className={styles.primaryButton} onClick={() => void openPostDetail(row.id, 'posts')}>
                                  Xem chi tiet
                                </button>
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  disabled={saving}
                                  onClick={() => void runQuickPostAction(row, row.allowComments === false ? 'unlock_comments' : 'lock_comments')}
                                >
                                  {saving ? 'Dang xu ly...' : row.allowComments === false ? 'Mo comment' : 'Khoa comment'}
                                </button>
                                <a className={styles.inlineLink} href={`/post/${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">
                                  Mo bai viet
                                </a>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className={styles.pagination}>
                  <button type="button" onClick={() => setPostsPage((previous) => Math.max(previous - 1, 1))} disabled={postsPage <= 1}>
                    Truoc
                  </button>
                  <span>Trang {postsData?.page}/{postsData?.totalPages} • {formatNumber(postsData?.total)} bai viet</span>
                  <button
                    type="button"
                    onClick={() => setPostsPage((previous) => Math.min(previous + 1, postsData?.totalPages || 1))}
                    disabled={postsPage >= (postsData?.totalPages || 1)}
                  >
                    Sau
                  </button>
                </div>
              </>
            ) : (
              <EmptyState title="Khong co bai viet phu hop" text="Thu doi bo loc thoi gian hoac xoa quick search." />
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'reports' ? (
        <section className={`${styles.panel} ${responsiveStyles.panel}`}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionEyebrow}>Report queue</div>
              <h2 className={styles.sectionTitle}>Them review flow day du: bo qua, xoa bai, cong gay, khoa tai khoan</h2>
            </div>
            {selectedReportRows.length ? (
              <div className={styles.bulkBanner}>
                <span>Dang chon {selectedReportRows.length} item</span>
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => openReportDecisionModal(selectedReportIds, `${selectedReportRows.length} report item`, ['no_violation'])}
                  >
                    Bo qua queue
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => openReportDecisionModal(selectedReportIds, `${selectedReportRows.length} report item`, ['delete_post'])}
                  >
                    Xu phat hang loat
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className={`${styles.filters} ${responsiveStyles.filters}`}>
            <label className={styles.inlineField}>
              <span>Tu ngay</span>
              <input
                type="date"
                value={reportDraftFilters.startDate}
                onChange={(event) => setReportDraftFilters((previous) => ({ ...previous, startDate: event.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Den ngay</span>
              <input
                type="date"
                value={reportDraftFilters.endDate}
                onChange={(event) => setReportDraftFilters((previous) => ({ ...previous, endDate: event.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Trang thai</span>
              <select
                value={reportDraftFilters.status}
                onChange={(event) =>
                  setReportDraftFilters((previous) => ({
                    ...previous,
                    status: event.target.value as 'all' | 'pending' | 'reviewed' | 'accepted' | 'rejected',
                  }))
                }
              >
                <option value="all">Tat ca</option>
                <option value="pending">Pending</option>
                <option value="reviewed">Reviewed</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className={styles.inlineField}>
              <span>Nguon report</span>
              <select
                value={reportDraftFilters.source}
                onChange={(event) =>
                  setReportDraftFilters((previous) => ({
                    ...previous,
                    source: event.target.value as 'all' | 'user_report' | 'auto_nsfw',
                  }))
                }
              >
                <option value="all">Tat ca</option>
                <option value="user_report">Nguoi dung</option>
                <option value="auto_nsfw">Auto NSFW</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                setReportsPage(1)
                startTransition(() => setReportFilters({ ...reportDraftFilters }))
              }}
            >
              Loc
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setReportsPage(1)
                setReportDraftFilters(DEFAULT_REPORT_FILTERS)
                startTransition(() => setReportFilters(DEFAULT_REPORT_FILTERS))
              }}
            >
              Reset
            </button>
          </div>

          <div className={styles.metricGridCompact}>
            <MetricCard label="Pending" value={formatNumber(reportSummary.pending)} help="Tong pending trong rows dang hien thi" tone="warning" />
            <MetricCard label="Auto flag" value={formatNumber(reportSummary.autoFlagged)} help="Hang doi do he thong goi len" tone="info" />
            <MetricCard label="Post da xoa" value={formatNumber(reportSummary.deletedSnapshots)} help="Van con snapshot de admin review" tone="neutral" />
            <MetricCard label="Dang chon" value={formatNumber(reportSummary.selected)} help="Bulk review nhanh hon" tone="success" />
          </div>

          <div className={styles.tableCard}>
            {visibleReports.length ? (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={allVisibleReportsSelected}
                            onChange={() =>
                              setSelectedReportIds((previous) =>
                                allVisibleReportsSelected
                                  ? previous.filter((id) => !visibleReports.some((row) => row.id === id))
                                  : Array.from(new Set([...previous, ...visibleReports.map((row) => row.id)])),
                              )
                            }
                          />
                        </th>
                        <th>Bai viet</th>
                        <th>Chi tiet report</th>
                        <th>Trang thai</th>
                        <th>Thoi gian</th>
                        <th>Hanh dong</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleReports.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedReportIds.includes(row.id)}
                              onChange={() =>
                                setSelectedReportIds((previous) =>
                                  previous.includes(row.id)
                                    ? previous.filter((id) => id !== row.id)
                                    : [...previous, row.id],
                                )
                              }
                            />
                          </td>
                          <td>
                            <div className={styles.cellStack}>
                              <strong>{row.title}</strong>
                              <span>@{row.authorUsername}</span>
                              <div className={styles.badgeGroup}>
                                <Badge tone={row.reportSource === 'auto_nsfw' ? 'info' : 'neutral'}>
                                  {row.reportSource === 'auto_nsfw' ? 'auto_nsfw' : 'user_report'}
                                </Badge>
                                {row.postExists === false ? <Badge tone="warning">snapshot only</Badge> : null}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className={styles.metricList}>
                              <span>Report: <strong>{formatNumber(row.reportCount || 0)}</strong></span>
                              <span>Pending: <strong>{formatNumber(row.pendingCount || 0)}</strong></span>
                              <span>Ly do moi nhat: <strong>{row.latestReason || '--'}</strong></span>
                            </div>
                          </td>
                          <td>
                            <div className={styles.cellStack}>
                              <div className={styles.badgeGroup}>
                                {(row.statuses || []).length ? (
                                  row.statuses?.map((status) => (
                                    <Badge key={status} tone={badgeToneForReport(status)}>
                                      {status}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge tone="warning">pending</Badge>
                                )}
                                <Badge tone={badgeToneForPost(row.moderationStatus)}>{row.moderationStatus || 'normal'}</Badge>
                              </div>
                              {row.moderationReason ? <span>{row.moderationReason}</span> : null}
                            </div>
                          </td>
                          <td>
                            <div className={styles.cellStack}>
                              <strong>{formatDate(row.lastReportedAt)}</strong>
                              <span>Tao bai: {formatDate(row.createdAt)}</span>
                            </div>
                          </td>
                          <td>
                            <div className={styles.actionColumn}>
                              <button type="button" className={styles.primaryButton} onClick={() => void openPostDetail(row.id, 'reports')}>
                                Review
                              </button>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => openReportDecisionModal([row.id], row.title || row.id, ['no_violation'])}
                              >
                                Bo qua
                              </button>
                              <a className={styles.inlineLink} href={`/post/${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">
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
                  <button type="button" onClick={() => setReportsPage((previous) => Math.max(previous - 1, 1))} disabled={reportsPage <= 1}>
                    Truoc
                  </button>
                  <span>Trang {reportsData?.page}/{reportsData?.totalPages} • {formatNumber(reportsData?.total)} post bi report</span>
                  <button
                    type="button"
                    onClick={() => setReportsPage((previous) => Math.min(previous + 1, reportsData?.totalPages || 1))}
                    disabled={reportsPage >= (reportsData?.totalPages || 1)}
                  >
                    Sau
                  </button>
                </div>
              </>
            ) : (
              <EmptyState title="Khong co report phu hop" text="Queue hien tai rong hoac dang bi bo loc qua hep." />
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'violations' ? (
        <section className={`${styles.panel} ${responsiveStyles.panel}`}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionEyebrow}>Violation center</div>
              <h2 className={styles.sectionTitle}>Tong hop account va post dang o trang thai can admin can thiep</h2>
            </div>
          </div>

          <div className={styles.metricGridCompact}>
            <MetricCard label="Tai khoan vi pham" value={formatNumber(violationSummary.violatingAccounts)} help="Tinh ca warning, strike, locked" tone="danger" />
            <MetricCard label="Post vi pham" value={formatNumber(violationSummary.violatingPosts)} help="Dang co moderationStatus violating" tone="danger" />
            <MetricCard label="Tai khoan dang hien thi" value={formatNumber(visibleViolationAccounts.length)} help="Sau quick search" tone="warning" />
            <MetricCard label="Post dang hien thi" value={formatNumber(visibleViolationPosts.length)} help="Sau quick search" tone="warning" />
          </div>

          <div className={styles.dualPane}>
            <div className={styles.tableCard}>
              <div className={styles.surfaceHeader}>
                <div>
                  <div className={styles.cardTitle}>Tai khoan can xu ly</div>
                  <div className={styles.cardSubtitle}>Lock, warning, strike hoac violating</div>
                </div>
              </div>
              {visibleViolationAccounts.length ? (
                <div className={styles.stackList}>
                  {visibleViolationAccounts.map((row) => (
                    <div key={row.id} className={styles.stackItem}>
                      <div className={styles.stackItemMain}>
                        <div className={styles.stackItemTitle}>@{row.username}</div>
                        <div className={styles.badgeGroup}>
                          <Badge tone={badgeToneForAccount(row.moderationStatus, row.accountLocked)}>
                            {row.accountLocked ? 'locked' : row.moderationStatus}
                          </Badge>
                          {row.strikesCount ? <Badge tone="warning">{row.strikesCount} gay</Badge> : null}
                        </div>
                        <p>{row.accountLocked ? row.accountLockedReason || '--' : row.moderationReason || '--'}</p>
                      </div>
                      <div className={styles.stackItemMeta}>
                        <span>{row.email}</span>
                        <span>{formatNumber(row.loginCount)} login</span>
                        <a className={styles.inlineLink} href={`/profile/${encodeURIComponent(row.username)}`} target="_blank" rel="noreferrer">
                          Mo profile
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Khong co tai khoan phu hop" text="Quick search hien tai khong khop voi danh sach vi pham." />
              )}
            </div>

            <div className={styles.tableCard}>
              <div className={styles.surfaceHeader}>
                <div>
                  <div className={styles.cardTitle}>Bai viet vi pham</div>
                  <div className={styles.cardSubtitle}>Tap trung vao moderation reason va muc do report</div>
                </div>
              </div>
              {visibleViolationPosts.length ? (
                <div className={styles.stackList}>
                  {visibleViolationPosts.map((row) => (
                    <div key={row.id} className={styles.stackItem}>
                      <div className={styles.stackItemMain}>
                        <div className={styles.stackItemTitle}>{row.title}</div>
                        <div className={styles.badgeGroup}>
                          <Badge tone={badgeToneForPost(row.moderationStatus)}>{row.moderationStatus}</Badge>
                          <Badge tone="warning">{formatNumber(row.reportCount)} report</Badge>
                        </div>
                        <p>{row.moderationReason || '--'}</p>
                      </div>
                      <div className={styles.stackItemMeta}>
                        <span>@{row.authorUsername}</span>
                        <span>{formatNumber(row.engagementCount)} engagement</span>
                        <button type="button" className={styles.inlineLinkButton} onClick={() => void openPostDetail(row.id, 'posts')}>
                          Xem chi tiet
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Khong co bai viet phu hop" text="Quick search hien tai khong khop voi danh sach bai viet vi pham." />
              )}
            </div>
          </div>
        </section>
      ) : null}

      {postDetailOpen ? (
        <div className={`${styles.modalOverlay} ${responsiveStyles.modalOverlay}`} onMouseDown={closePostDetail}>
          <div className={`${styles.modalCard} ${responsiveStyles.modalCard}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Chi tiet bai viet</h3>
                <div className={styles.modalSubtitle}>
                  Nguon: {postDetailSource === 'reports' ? 'Report queue' : 'Danh sach bai viet'}
                </div>
              </div>
              <button type="button" className={styles.closeModalBtn} onClick={closePostDetail} disabled={postDetailSaving}>
                Dong
              </button>
            </div>

            {postDetailLoading ? <div className={styles.loading}>Dang tai chi tiet...</div> : null}

            {!postDetailLoading && postDetailData?.post ? (
              <div className={`${styles.modalContent} ${responsiveStyles.modalContent}`}>
                <div className={`${styles.modalMain} ${responsiveStyles.modalMain}`}>
                  <div className={styles.modalPostHeader}>
                    <div>
                      <strong>@{postDetailData.post.authorUsername}</strong>
                      <div className={styles.muted}>{formatDate(postDetailData.post.createdAt)}</div>
                    </div>
                    <div className={styles.badgeGroup}>
                      <Badge tone={badgeToneForPost(postDetailData.post.moderationStatus)}>{postDetailData.post.moderationStatus || 'normal'}</Badge>
                      <Badge tone={postDetailData.post.allowComments ? 'success' : 'warning'}>
                        {postDetailData.post.allowComments ? 'comments open' : 'comments locked'}
                      </Badge>
                    </div>
                  </div>

                  {(() => {
                    const previewUrl = resolveMediaUrl(
                      postDetailData.post.thumbnailUrl || postDetailData.post.media?.[0]?.url || postDetailData.post.imageUrl || '',
                    )
                    if (!previewUrl) return <div className={styles.snapshotFallback}>Khong co media preview</div>
                    if (isVideoPreview(postDetailData.post.mediaType, previewUrl)) {
                      return <video className={styles.modalPreview} src={previewUrl} controls playsInline preload="metadata" />
                    }
                    return <img className={styles.modalPreview} src={previewUrl} alt={postDetailData.post.title || 'post'} />
                  })()}

                  {postDetailData.post.content ? <div className={styles.modalCaption}>{postDetailData.post.content}</div> : null}

                  <div className={styles.modalStats}>
                    <span>Like: {formatNumber(postDetailData.post.likesCount)}</span>
                    <span>Comment: {formatNumber(postDetailData.post.commentsCount)}</span>
                    <span>Report: {formatNumber(postDetailData.post.reportCount)}</span>
                    <span>Created: {formatDate(postDetailData.post.createdAt)}</span>
                  </div>
                </div>

                <div className={styles.modalSide}>
                  <div className={styles.modalInfoGrid}>
                    <div><b>ID:</b> {postDetailData.post.id}</div>
                    <div><b>Author:</b> @{postDetailData.post.authorUsername}</div>
                    <div><b>Nguon report:</b> {postDetailData.post.reportSource || 'user_report'}</div>
                    <div><b>Lan report gan nhat:</b> {formatDate(postDetailData.post.lastReportedAt)}</div>
                    <div><b>Post ton tai:</b> {postDetailData.post.postExists === false ? 'Khong' : 'Co'}</div>
                  </div>

                  <div className={styles.surfaceBlock}>
                    <div className={styles.cardTitle}>Moderation draft</div>
                    <div className={styles.cardSubtitle}>Cap nhat trang thai moderation va dung chung note cho quick actions</div>
                    <div className={styles.controlGroup}>
                      <select
                        className={styles.fullInput}
                        value={postModerationDraft.status}
                        onChange={(event) =>
                          setPostModerationDraft((previous) => ({
                            ...previous,
                            status: event.target.value as PostModerationStatus,
                          }))
                        }
                      >
                        {POST_MODERATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        className={styles.textArea}
                        rows={4}
                        value={postModerationDraft.reason}
                        onChange={(event) =>
                          setPostModerationDraft((previous) => ({
                            ...previous,
                            reason: event.target.value,
                          }))
                        }
                        placeholder="Ly do moderation / ghi chu gui cho user"
                      />
                      <button type="button" className={styles.primaryButton} onClick={() => void savePostModeration()} disabled={postDetailSaving}>
                        {postDetailSaving ? 'Dang luu...' : 'Luu moderation'}
                      </button>
                    </div>
                  </div>

                  <div className={styles.surfaceBlock}>
                    <div className={styles.cardTitle}>Quick actions</div>
                    <div className={styles.inlineActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => void runPostActionFromDetail(postDetailData.post.allowComments ? 'lock_comments' : 'unlock_comments')}
                        disabled={postDetailSaving}
                      >
                        {postDetailData.post.allowComments ? 'Khoa comment' : 'Mo comment'}
                      </button>
                      {postDetailData.reports.length ? (
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => openReportDecisionModal([postDetailData.post.id], postDetailData.post.title || postDetailData.post.id, ['no_violation'], 'detail')}
                          disabled={postDetailSaving}
                        >
                          Xu ly report
                        </button>
                      ) : null}
                      <button type="button" className={styles.dangerButton} onClick={() => void runPostActionFromDetail('delete_post')} disabled={postDetailSaving}>
                        Xoa bai viet
                      </button>
                    </div>
                    <a className={styles.inlineLink} href={postDetailData.post.postPath || `/post/${postDetailData.post.id}`} target="_blank" rel="noreferrer">
                      Mo bai viet tren giao dien nguoi dung
                    </a>
                  </div>

                  <div className={styles.reportList}>
                    <div className={styles.reportListTitle}>Lich su report</div>
                    {postDetailData.reports.length ? (
                      postDetailData.reports.map((item) => (
                        <div key={item.id} className={styles.reportItem}>
                          <div className={styles.badgeGroup}>
                            <Badge tone={badgeToneForReport(item.status)}>{item.status}</Badge>
                            <Badge tone={item.source === 'auto_nsfw' ? 'info' : 'neutral'}>
                              {item.source === 'auto_nsfw' ? 'auto_nsfw' : 'user_report'}
                            </Badge>
                          </div>
                          <div><b>@{item.reporterUsername || 'unknown'}</b></div>
                          {item.reason ? <div>{item.reason}</div> : null}
                          {item.detectionSignals?.length ? <div className={styles.muted}>Signals: {item.detectionSignals.join(', ')}</div> : null}
                          <div className={styles.muted}>{formatDate(item.createdAt)}</div>
                        </div>
                      ))
                    ) : (
                      <div className={styles.reportItem}>Bai viet nay chua co lich su report.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {reportDecisionTarget ? (
        <div className={`${styles.modalOverlay} ${responsiveStyles.modalOverlay}`} onMouseDown={() => !reportDecisionSaving && setReportDecisionTarget(null)}>
          <div className={`${styles.penaltyModalCard} ${responsiveStyles.penaltyModalCard}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Xu ly report queue</h3>
                <div className={styles.modalSubtitle}>Target: {reportDecisionTarget.label}</div>
              </div>
              <button type="button" className={styles.closeModalBtn} onClick={() => setReportDecisionTarget(null)} disabled={reportDecisionSaving}>
                Dong
              </button>
            </div>

            <div className={styles.penaltyBody}>
              <div className={styles.reportActionChecks}>
                {REPORT_DECISION_OPTIONS.map((option) => (
                  <label key={option.value} className={styles.reportActionOption}>
                    <input
                      type="checkbox"
                      checked={reportDecisionActions.includes(option.value)}
                      onChange={() => setReportDecisionActions((previous) => resolveReportActionToggle(previous, option.value))}
                      disabled={reportDecisionSaving}
                    />
                    <div>
                      <div>{option.label}</div>
                      <div className={styles.muted}>{option.help}</div>
                    </div>
                  </label>
                ))}
              </div>

              <textarea
                className={styles.penaltyReasonInput}
                value={reportDecisionReason}
                onChange={(event) => setReportDecisionReason(event.target.value)}
                placeholder="Ly do xu ly / ghi chu moderation"
                rows={4}
                disabled={reportDecisionSaving}
              />

              <div className={styles.inlineActions}>
                <Badge tone="info">Dang chon: {sanitizeReportActions(reportDecisionActions).join(', ')}</Badge>
                <button type="button" className={styles.secondaryButton} onClick={() => setReportDecisionTarget(null)} disabled={reportDecisionSaving}>
                  Huy
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void saveReportDecision()}
                  disabled={reportDecisionSaving || !sanitizeReportActions(reportDecisionActions).length}
                >
                  {reportDecisionSaving ? 'Dang luu...' : 'Luu quyet dinh'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
