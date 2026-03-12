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
      <div className="space-y-8">
        <h1 className="font-display text-3xl text-[var(--color-text)]">Dashboard</h1>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-[88px]" aria-hidden />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-12" aria-hidden />
          ))}
        </div>
      </div>
    )
  }

  const hasData = entries.length > 0 || changeSummaries.length > 0 || docUpdates.length > 0

  return (
    <div className="space-y-8">
      <div className="flex items-baseline gap-4">
        <h1 className="font-display text-3xl text-[var(--color-text)]">Dashboard</h1>
        {latestTimestamp && (
          <p className="text-xs text-[var(--color-text-subtle)]">
            Updated {formatRelativeTime(latestTimestamp)}
            {latestCommit && (
              <span className="font-mono"> · {latestCommit}</span>
            )}
          </p>
        )}
      </div>

      {loadErrors.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-4 py-3"
          role="alert"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden>
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-[var(--color-text-muted)]">{loadErrors.slice(0, 2).join(' ')}</p>
        </div>
      )}

      {!hasData && (
        <div className="dotted-grid rounded-xl border border-[var(--color-border)] p-12 text-center">
          <h2 className="font-display text-2xl text-[var(--color-text)]">No activity yet</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-[var(--color-text-subtle)]">
            Run the AutoDocs agent in CI or locally to start tracking documentation changes.
          </p>
          <a
            href="https://github.com/jjjorgenson/gartnerTracer#install-and-run"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-accent mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            View setup guide
          </a>
        </div>
      )}

      {hasData && (
        <>
          <section aria-label="Metrics">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <MetricCard label="Current" value={currentCount} accent={currentCount > 0} />
              <MetricCard label="Pending" value={pendingCount} warn={pendingCount > 0} />
              <MetricCard
                label="Needs Review"
                value={staleCount}
                title="Code changed since last update"
              />
              <MetricCard label="Tracked" value={entries.length} />
              <MetricCard label="Agent Runs" value={changeSummaries.length} />
              <MetricCard
                label="AI Cost"
                value={totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—'}
              />
            </div>
          </section>

          <section aria-label="Recent Activity">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="micro-label">Recent Activity</h2>
              <Link to="/timeline" className="text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] transition-colors">
                View all
              </Link>
            </div>
            <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
              {recentItems.map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={item.link}
                  className="flex items-center gap-3 px-4 py-3 text-[var(--color-text)] hover:bg-[var(--color-border)]/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
                >
                  <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.type === 'summary' ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-text-subtle)]'}`} />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-subtle)]">
                    {item.sub}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--color-text-subtle)]">
                    {formatRelativeTime(item.timestamp)}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section aria-label="Quick Actions">
            <h2 className="micro-label mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-2">
              {pendingCount > 0 && (
                <Link
                  to="/docs"
                  className="btn-accent inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  View {pendingCount} pending doc{pendingCount !== 1 ? 's' : ''}
                </Link>
              )}
              {latestTimestamp && (
                <ActionLink
                  to={changeSummaries[0] ? `/timeline/commit/${changeSummaries[0].commitHash}` : '/timeline'}
                  label="Latest commit"
                />
              )}
              <ActionLink to="/timeline" label="Timeline" />
              <ActionLink to="/agent-log" label="Agent log" />
              <ActionLink to="/docs" label="Browse docs" />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-border-subtle)] hover:text-[var(--color-text)] transition-colors"
    >
      {label}
    </Link>
  )
}

function MetricCard({
  label,
  value,
  title,
  accent,
  warn,
}: {
  label: string
  value: number | string
  title?: string
  accent?: boolean
  warn?: boolean
}) {
  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
      title={title}
      role="region"
      aria-label={label}
    >
      <div
        className={`font-mono text-2xl font-medium tracking-tight ${
          accent ? 'text-[var(--color-success)]' : warn ? 'text-[var(--color-warning)]' : 'text-[var(--color-text)]'
        }`}
      >
        {value}
      </div>
      <div className="micro-label mt-1">{label}</div>
    </div>
  )
}
