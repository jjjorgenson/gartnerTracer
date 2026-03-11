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
        <h1 className="text-2xl font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Dashboard</h1>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-[var(--color-border)]" aria-hidden />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-lg bg-[var(--color-border)]" aria-hidden />
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
          className="rounded-lg border border-amber-600/50 bg-amber-900/20 px-4 py-2 text-amber-100"
          role="alert"
        >
          Some data could not be loaded: {loadErrors.join(', ')}
        </div>
      )}

      {!hasData && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 text-center">
          <p className="text-[var(--color-text-muted)]">
            No data yet. Run the Tracer agent in CI or locally to populate this dashboard.
          </p>
          <a
            href="https://tracer.dev/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[var(--color-accent)] hover:underline"
          >
            Setup guide
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

          <section>
            <h2 className="mb-3 font-medium text-[var(--color-text)]">Recent Activity</h2>
            <ul className="space-y-2">
              {recentItems.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <Link
                    to={item.link}
                    className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-[var(--color-text)] hover:bg-[var(--color-border)]"
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

          <section>
            <h2 className="mb-3 font-medium text-[var(--color-text)]" style={{ fontFamily: 'var(--font-body)' }}>
              Quick Actions
            </h2>
            <div className="flex flex-wrap gap-2">
              {pendingCount > 0 && (
                <Link
                  to="/docs"
                  className="link-on-accent rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-accent-hover)]"
                >
                  View {pendingCount} pending doc{pendingCount !== 1 ? 's' : ''}
                </Link>
              )}
              {latestTimestamp && (
                <Link
                  to={changeSummaries[0] ? `/timeline/commit/${changeSummaries[0].commitHash}` : '/timeline'}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
                >
                  Latest commit
                </Link>
              )}
              <Link
                to="/timeline"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
              >
                Timeline
              </Link>
              <Link
                to="/agent-log"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
              >
                Agent Log
              </Link>
              <Link
                to="/docs"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
              >
                Browse Docs
              </Link>
              <Link
                to="/settings"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
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
