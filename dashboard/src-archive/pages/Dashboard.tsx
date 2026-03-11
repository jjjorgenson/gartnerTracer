import { Link } from 'react-router-dom'
import { useDashboardDataContext } from '../context/DashboardDataContext'
import { formatRelativeTime } from '../utils/formatTime'
import type { DocStatusEntry } from '../data/types'

function getDocStatusEntries(docStatus: Record<string, unknown>): [string, DocStatusEntry][] {
  const entries: [string, DocStatusEntry][] = []
  for (const [key, val] of Object.entries(docStatus)) {
    if (key === 'repo' || key === 'branch') continue
    const entry = val as DocStatusEntry
    if (entry && typeof entry === 'object' && 'state' in entry) {
      entries.push([key, entry])
    }
  }
  return entries
}

export function Dashboard() {
  const { docStatus, changeSummaries, docUpdates, loadErrors, loading } = useDashboardDataContext()
  const entries = getDocStatusEntries(docStatus)
  const currentCount = entries.filter(([, e]) => e.state === 'current').length
  const pendingCount = entries.filter(([, e]) => e.state === 'pending').length
  const staleCount = entries.filter(([, e]) => e.state === 'stale').length
  const totalCost = [...changeSummaries, ...docUpdates].reduce(
    (sum, x) => sum + (x.provenance?.estimatedCost ?? 0),
    0
  )
  const latestTimestamp =
    changeSummaries[0]?.timestamp || docUpdates[0]?.timestamp || null
  const latestCommit = changeSummaries[0]?.commitHash?.slice(0, 7) || null

  const recentItems = [
    ...changeSummaries.slice(0, 5).map((s) => ({
      type: 'summary' as const,
      id: s.id,
      timestamp: s.timestamp,
      label: s.commitMessage?.trim() || `Commit ${s.commitHash?.slice(0, 7)}`,
      sub: `${s.docsUpdated} doc(s) updated`,
      link: `/timeline/commit/${s.commitHash}`,
    })),
    ...docUpdates.slice(0, 5).map((u) => ({
      type: 'update' as const,
      id: u.id,
      timestamp: u.timestamp,
      label: u.docRef?.path || u.id,
      sub: u.deliveryStatus,
      link: `/agent-log?id=${u.id}`,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8)

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Dashboard</h1>
        <section aria-label="Loading metrics" className="grid grid-cols-2 gap-4 md:grid-cols-5 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-24" aria-hidden />
          ))}
        </section>
        <div className="space-y-2">
          <div className="skeleton h-10 w-48" aria-hidden />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-14 w-full" aria-hidden />
          ))}
        </div>
      </div>
    )
  }

  const hasData = entries.length > 0 || changeSummaries.length > 0 || docUpdates.length > 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
        Dashboard
      </h1>

      {loadErrors.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 px-4 py-3 text-[var(--color-text)]"
          role="alert"
        >
          <span className="shrink-0 text-[var(--color-warning)]" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </span>
          <p className="text-sm">Some data could not be loaded. {loadErrors.slice(0, 2).join(' ')}</p>
        </div>
      )}

      {!hasData && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-10 text-center">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">No activity yet</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Run the Tracer agent in CI or locally to populate this dashboard.
          </p>
          <a
            href="https://tracer.dev/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]"
          >
            View setup guide
          </a>
        </div>
      )}

      {hasData && (
        <>
          <section aria-label="Metrics" className="grid grid-cols-2 gap-4 md:grid-cols-5 lg:grid-cols-6">
            <MetricCard label="Current" value={currentCount} />
            <MetricCard label="Pending" value={pendingCount} />
            <MetricCard
              label="May need review"
              value={staleCount}
              title="Code changed since last update. Some docs are intentionally stable."
            />
            <MetricCard label="Docs tracked" value={entries.length} />
            <MetricCard
              label="Agent runs"
              value={changeSummaries.length}
            />
            <MetricCard
              label="AI cost"
              value={totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—'}
              title="Cost tracking coming soon"
            />
          </section>

          {latestTimestamp && (
            <p className="text-sm text-[var(--color-text-subtle)]">
              Last updated: {formatRelativeTime(latestTimestamp)}
              {latestCommit && ` (commit ${latestCommit})`}
            </p>
          )}

          <section aria-label="Recent Activity">
            <h2 className="mb-3 text-base font-medium text-[var(--color-text)]">Recent Activity</h2>
            <ul className="space-y-2">
              {recentItems.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <Link
                    to={item.link}
                    className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3 text-[var(--color-text)] hover:bg-[var(--color-border)]"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="ml-2 text-sm text-[var(--color-text-muted)]">{item.sub}</span>
                    <span className="ml-2 text-xs text-[var(--color-text-subtle)]">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Quick Actions">
            <h2 className="mb-3 text-base font-medium text-[var(--color-text)]">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              {pendingCount > 0 && (
                <Link
                  to="/docs"
                  className="link-on-accent inline-flex min-h-[44px] items-center rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-accent-hover)]"
                >
                  View {pendingCount} pending doc{pendingCount !== 1 ? 's' : ''}
                </Link>
              )}
              {latestTimestamp && (
                <Link
                  to={changeSummaries[0] ? `/timeline/commit/${changeSummaries[0].commitHash}` : '/timeline'}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
                >
                  Open latest commit
                </Link>
              )}
              <Link
                to="/timeline"
                className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
              >
                Timeline
              </Link>
              <Link
                to="/agent-log"
                className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
              >
                Agent Log
              </Link>
              <Link
                to="/docs"
                className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
              >
                Browse Docs
              </Link>
              <Link
                to="/settings"
                className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
              >
                Settings
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  title,
}: {
  label: string
  value: number | string
  title?: string
}) {
  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
      title={title}
      role="region"
      aria-label={label}
    >
      <div className="text-2xl font-semibold tracking-tight text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
      <div className="text-sm text-[var(--color-text-muted)]">{label}</div>
    </div>
  )
}
