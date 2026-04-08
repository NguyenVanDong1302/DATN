import { useEffect, useMemo, useState } from 'react'
import { resolveMediaUrl } from '../../lib/api'
import { useAppStore } from '../../state/store'
import { type AccountStatsResponse, type AdminViolationsResponse, type PaginatedAdminPosts, useAdminApi } from '../../features/admin/admin.api'
import styles from './AdminPage.module.css'

type AdminTab = 'accounts' | 'posts' | 'reports' | 'violations'

const DEFAULT_POST_FILTERS = {
  startDate: '',
  endDate: '',
  sort: 'engagement_desc' as 'engagement_desc' | 'engagement_asc',
}

const DEFAULT_REPORT_FILTERS = {
  startDate: '',
  endDate: '',
  status: 'all' as 'all' | 'pending' | 'reviewed' | 'accepted' | 'rejected',
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

export default function AdminPage() {
  const adminApi = useAdminApi()
  const { state } = useAppStore()
  const isAdmin = state.role === 'admin'

  const [activeTab, setActiveTab] = useState<AdminTab>('accounts')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [months, setMonths] = useState(12)
  const [accountStats, setAccountStats] = useState<AccountStatsResponse | null>(null)

  const [postDraftFilters, setPostDraftFilters] = useState(DEFAULT_POST_FILTERS)
  const [postFilters, setPostFilters] = useState(DEFAULT_POST_FILTERS)
  const [postsPage, setPostsPage] = useState(1)
  const [postsData, setPostsData] = useState<PaginatedAdminPosts | null>(null)

  const [reportDraftFilters, setReportDraftFilters] = useState(DEFAULT_REPORT_FILTERS)
  const [reportFilters, setReportFilters] = useState(DEFAULT_REPORT_FILTERS)
  const [reportsPage, setReportsPage] = useState(1)
  const [reportsData, setReportsData] = useState<PaginatedAdminPosts | null>(null)

  const [violationsData, setViolationsData] = useState<AdminViolationsResponse | null>(null)

  const tabs = useMemo(
    () => [
      { key: 'accounts' as const, label: 'Tài khoản & đăng nhập' },
      { key: 'posts' as const, label: 'Danh sách bài viết' },
      { key: 'reports' as const, label: 'Bài viết bị báo cáo' },
      { key: 'violations' as const, label: 'Tài khoản/Bài viết vi phạm' },
    ],
    [],
  )

  useEffect(() => {
    if (!isAdmin) return

    let cancelled = false
    const run = async () => {
      try {
        setLoading(true)
        setError('')

        if (activeTab === 'accounts') {
          const data = await adminApi.getAccountStats(months)
          if (!cancelled) setAccountStats(data)
        }

        if (activeTab === 'posts') {
          const data = await adminApi.getPosts({
            page: postsPage,
            limit: 20,
            startDate: postFilters.startDate,
            endDate: postFilters.endDate,
            sort: postFilters.sort,
          })
          if (!cancelled) setPostsData(data)
        }

        if (activeTab === 'reports') {
          const data = await adminApi.getReportedPosts({
            page: reportsPage,
            limit: 20,
            startDate: reportFilters.startDate,
            endDate: reportFilters.endDate,
            status: reportFilters.status,
          })
          if (!cancelled) setReportsData(data)
        }

        if (activeTab === 'violations') {
          const data = await adminApi.getViolations(true)
          if (!cancelled) setViolationsData(data)
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Không tải được dữ liệu admin')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [activeTab, adminApi, isAdmin, months, postFilters, postsPage, reportFilters, reportsPage])

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <div className={styles.unauthorized}>Bạn không có quyền truy cập trang quản trị.</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin Dashboard</h1>
          <p className={styles.subtitle}>Quản lý tổng quan mạng xã hội</p>
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
      {loading ? <div className={styles.loading}>Đang tải dữ liệu...</div> : null}

      {activeTab === 'accounts' ? (
        <section className={styles.panel}>
          <div className={styles.filters}>
            <label className={styles.inlineField}>
              <span>Khoảng tháng</span>
              <select value={months} onChange={(e) => setMonths(Number(e.target.value) || 12)}>
                <option value={6}>6 tháng</option>
                <option value={12}>12 tháng</option>
                <option value={18}>18 tháng</option>
                <option value={24}>24 tháng</option>
              </select>
            </label>
          </div>

          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Tổng tài khoản</div>
              <div className={styles.statValue}>{accountStats?.summary?.totalAccounts ?? 0}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Tổng lượt đăng nhập</div>
              <div className={styles.statValue}>{accountStats?.summary?.totalLogins ?? 0}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Hoạt động 30 ngày</div>
              <div className={styles.statValue}>{accountStats?.summary?.activeLast30Days ?? 0}</div>
            </div>
          </div>

          <div className={styles.tableCard}>
            <h3 className={styles.tableTitle}>Thống kê theo tháng</h3>
            {accountStats?.monthly?.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tháng</th>
                    <th>Tài khoản mới</th>
                    <th>Số lần đăng nhập</th>
                  </tr>
                </thead>
                <tbody>
                  {accountStats.monthly.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{row.newAccounts}</td>
                      <td>{row.loginCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="Chưa có dữ liệu thống kê theo tháng." />
            )}
          </div>

          <div className={styles.tableCard}>
            <h3 className={styles.tableTitle}>Top tài khoản đăng nhập nhiều</h3>
            {accountStats?.topLoginUsers?.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Lượt đăng nhập</th>
                    <th>Lần cuối đăng nhập</th>
                  </tr>
                </thead>
                <tbody>
                  {accountStats.topLoginUsers.map((row) => (
                    <tr key={row.id}>
                      <td>@{row.username}</td>
                      <td>{row.role}</td>
                      <td>{row.loginCount}</td>
                      <td>{formatDate(row.lastLoginAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="Chưa có dữ liệu lượt đăng nhập." />
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'posts' ? (
        <section className={styles.panel}>
          <div className={styles.filters}>
            <label className={styles.inlineField}>
              <span>Từ ngày</span>
              <input
                type="date"
                value={postDraftFilters.startDate}
                onChange={(e) => setPostDraftFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Đến ngày</span>
              <input
                type="date"
                value={postDraftFilters.endDate}
                onChange={(e) => setPostDraftFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Sắp xếp tương tác</span>
              <select
                value={postDraftFilters.sort}
                onChange={(e) =>
                  setPostDraftFilters((prev) => ({
                    ...prev,
                    sort: e.target.value as 'engagement_desc' | 'engagement_asc',
                  }))
                }
              >
                <option value="engagement_desc">Giảm dần</option>
                <option value="engagement_asc">Tăng dần</option>
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
              Lọc
            </button>
          </div>

          {postsData?.items?.length ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tiêu đề</th>
                      <th>Thumbnail</th>
                      <th>User đăng</th>
                      <th>Thời gian</th>
                      <th>Like</th>
                      <th>Comment</th>
                      <th>Tương tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postsData.items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.title}</td>
                        <td>
                          {row.thumbnailUrl ? (
                            <img className={styles.thumbnail} src={resolveMediaUrl(row.thumbnailUrl)} alt={row.title} />
                          ) : (
                            <span className={styles.muted}>Không có</span>
                          )}
                        </td>
                        <td>@{row.authorUsername}</td>
                        <td>{formatDate(row.createdAt)}</td>
                        <td>{row.likesCount}</td>
                        <td>{row.commentsCount}</td>
                        <td>{row.engagementCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.pagination}>
                <button type="button" onClick={() => setPostsPage((prev) => Math.max(prev - 1, 1))} disabled={postsPage <= 1}>
                  Trước
                </button>
                <span>
                  Trang {postsData.page}/{postsData.totalPages}
                </span>
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
            <EmptyState text="Không có bài viết theo bộ lọc hiện tại." />
          )}
        </section>
      ) : null}

      {activeTab === 'reports' ? (
        <section className={styles.panel}>
          <div className={styles.filters}>
            <label className={styles.inlineField}>
              <span>Từ ngày</span>
              <input
                type="date"
                value={reportDraftFilters.startDate}
                onChange={(e) => setReportDraftFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Đến ngày</span>
              <input
                type="date"
                value={reportDraftFilters.endDate}
                onChange={(e) => setReportDraftFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </label>
            <label className={styles.inlineField}>
              <span>Trạng thái report</span>
              <select
                value={reportDraftFilters.status}
                onChange={(e) =>
                  setReportDraftFilters((prev) => ({
                    ...prev,
                    status: e.target.value as 'all' | 'pending' | 'reviewed' | 'accepted' | 'rejected',
                  }))
                }
              >
                <option value="all">Tất cả</option>
                <option value="pending">Đang chờ xử lý</option>
                <option value="reviewed">Đã review</option>
                <option value="accepted">Xác nhận vi phạm</option>
                <option value="rejected">Từ chối</option>
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
              Lọc
            </button>
          </div>

          {reportsData?.items?.length ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Bài viết</th>
                      <th>User đăng</th>
                      <th>Số report</th>
                      <th>Pending</th>
                      <th>Lý do mới nhất</th>
                      <th>Lần báo cáo gần nhất</th>
                      <th>Tương tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportsData.items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.title}</td>
                        <td>@{row.authorUsername}</td>
                        <td>{row.reportCount || 0}</td>
                        <td>{row.pendingCount || 0}</td>
                        <td>{row.latestReason || '--'}</td>
                        <td>{formatDate(row.lastReportedAt)}</td>
                        <td>{row.engagementCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.pagination}>
                <button type="button" onClick={() => setReportsPage((prev) => Math.max(prev - 1, 1))} disabled={reportsPage <= 1}>
                  Trước
                </button>
                <span>
                  Trang {reportsData.page}/{reportsData.totalPages}
                </span>
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
            <EmptyState text="Chưa có bài viết bị báo cáo." />
          )}
        </section>
      ) : null}

      {activeTab === 'violations' ? (
        <section className={styles.panel}>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Tài khoản vi phạm</div>
              <div className={styles.statValue}>{violationsData?.summary?.violatingAccounts ?? 0}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Bài viết vi phạm</div>
              <div className={styles.statValue}>{violationsData?.summary?.violatingPosts ?? 0}</div>
            </div>
          </div>

          <div className={styles.tableCard}>
            <h3 className={styles.tableTitle}>Danh sách tài khoản vi phạm</h3>
            {violationsData?.accounts?.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Trạng thái</th>
                    <th>Lý do</th>
                    <th>Lượt đăng nhập</th>
                    <th>Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {violationsData.accounts.map((row) => (
                    <tr key={row.id}>
                      <td>@{row.username}</td>
                      <td>{row.email}</td>
                      <td>{row.moderationStatus}</td>
                      <td>{row.moderationReason || '--'}</td>
                      <td>{row.loginCount}</td>
                      <td>{formatDate(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="Chưa có tài khoản vi phạm." />
            )}
          </div>

          <div className={styles.tableCard}>
            <h3 className={styles.tableTitle}>Danh sách bài viết vi phạm</h3>
            {violationsData?.posts?.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tiêu đề</th>
                    <th>User đăng</th>
                    <th>Trạng thái</th>
                    <th>Lý do</th>
                    <th>Report</th>
                    <th>Tương tác</th>
                    <th>Thời gian</th>
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
              <EmptyState text="Chưa có bài viết vi phạm." />
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
