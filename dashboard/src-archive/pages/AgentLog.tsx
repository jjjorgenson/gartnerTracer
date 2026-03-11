import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDashboardDataContext } from '../context/DashboardDataContext'
import { formatRelativeTime } from '../utils/formatTime'
import { DiffView } from '../components/DiffView'

const PAGE_SIZE = 50

export function AgentLog() {
  const [searchParams] = useSearchParams()
  const filterId = searchParams.get('id')
  const filterCommit = searchParams.get('commit')
  const { docUpdates, loadErrors, loading } = useDashboardDataContext()
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(filterId)

  const sorted = useMemo(
    () =>
      [...docUpdates].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [docUpdates]
  )
  const filtered = useMemo(() => {
    if (filterId) return sorted.filter((u) => u.id === filterId)
    if (filterCommit) return sorted.filter((u) => u.commitHash === filterCommit)
    return sorted
  }, [sorted, filterId, filterCommit])
  const total = filtered.length
  const start = page * PAGE_SIZE
  const pageItems = filtered.slice(start, start + PAGE_SIZE)
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Agent Log</h1>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-16 w-full" aria-hidden />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Agent Log</h1>
      {(filterId || filterCommit) && (
        <p className="text-sm text-[var(--color-text-muted)]">
          Filtered by: {filterId ? `id=${filterId}` : `commit=${filterCommit}`}
          <Link to="/agent-log" className="ml-2 text-[var(--color-accent)] hover:underline">
            Clear
          </Link>
        </p>
      )}
      {loadErrors.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--color-text)]" role="alert">
          <span className="shrink-0 text-[var(--color-warning)]" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </span>
          <p>{loadErrors.slice(0, 2).join(' ')}</p>
        </div>
      )}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-10 text-center">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">No agent runs yet</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Doc updates will appear here after the agent runs.</p>
          <Link to="/" className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]">
            Back to Dashboard
          </Link>
        </div>
      )}
      <ul className="space-y-3">
        {pageItems.map((u) => (
          <li
            key={u.id}
            className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]"
          >
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
              className="flex min-h-[44px] w-full flex-wrap items-center gap-2 p-4 text-left text-[var(--color-text)] hover:bg-[var(--color-border)]"
            >
              <span className="font-medium">{u.docRef?.path ?? u.id}</span>
              <StatusBadge status={u.deliveryStatus} />
              <span className="text-sm text-[var(--color-text-subtle)]">{formatRelativeTime(u.timestamp)}</span>
              <Link
                to={`/timeline/commit/${u.commitHash}`}
                onClick={(e) => e.stopPropagation()}
                className="font-mono text-xs text-[var(--color-accent)] hover:underline"
              >
                {u.commitHash?.slice(0, 7)}
              </Link>
              {u.deliveryRef && u.deliveryRef.startsWith('http') && (
                <a
                  href={u.deliveryRef}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-[var(--color-accent)] hover:underline"
                >
                  View comment
                </a>
              )}
              {(u.provenance?.estimatedCost ?? 0) > 0 && (
                <span className="text-xs text-[var(--color-text-subtle)]">
                  ${u.provenance!.estimatedCost.toFixed(2)}
                </span>
              )}
            </button>
            {expandedId === u.id && (
              <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                <div className="text-sm text-[var(--color-text-muted)]">
                  Model: {u.provenance?.model} · Tokens: {(u.provenance?.inputTokens ?? 0) + (u.provenance?.outputTokens ?? 0)}
                </div>
                {u.sectionsModified?.length > 0 && (
                  <p className="mt-1 text-sm text-[var(--color-text-subtle)]">
                    Sections: {u.sectionsModified.join(', ')}
                  </p>
                )}
                {u.diffFromCurrent && (
                  <div className="mt-3 overflow-x-auto rounded border border-[var(--color-border)] p-2">
                    <DiffView diff={u.diffFromCurrent} />
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <nav aria-label="Agent log pagination" className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="min-h-[44px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)] disabled:opacity-50 disabled:hover:bg-[var(--color-bg-card)]"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--color-text-muted)]">
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="min-h-[44px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)] disabled:opacity-50 disabled:hover:bg-[var(--color-bg-card)]"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const ok = ['delivered', 'accepted'].includes(status)
  const fail = ['failed', 'rejected'].includes(status)
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]' : fail ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
      }`}
      role="status"
      aria-label={status}
    >
      {status}
    </span>
  )
}
