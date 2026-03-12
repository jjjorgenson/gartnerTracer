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
      <div className="space-y-6">
        <h1 className="font-display text-3xl text-[var(--color-text)]">Agent Log</h1>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-14" aria-hidden />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-4">
        <h1 className="font-display text-3xl text-[var(--color-text)]">Agent Log</h1>
        {total > 0 && (
          <span className="text-xs text-[var(--color-text-subtle)]">{total} entr{total !== 1 ? 'ies' : 'y'}</span>
        )}
      </div>

      {(filterId || filterCommit) && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-subtle)]">
          <span>Filtered by {filterId ? `id` : `commit`}:</span>
          <code className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
            {filterId || filterCommit}
          </code>
          <Link to="/agent-log" className="text-[var(--color-accent)] hover:underline">Clear</Link>
        </div>
      )}

      {loadErrors.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-4 py-3" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden>
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-[var(--color-text-muted)]">{loadErrors.slice(0, 2).join(' ')}</p>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="dotted-grid rounded-xl border border-[var(--color-border)] p-12 text-center">
          <h2 className="font-display text-2xl text-[var(--color-text)]">No agent runs yet</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-[var(--color-text-subtle)]">
            Doc updates will appear here after the agent runs.
          </p>
          <Link to="/" className="btn-accent mt-6 inline-flex items-center rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors">
            Back to Dashboard
          </Link>
        </div>
      )}

      {pageItems.length > 0 && (
        <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          {pageItems.map((u) => (
            <div key={u.id} className="first:rounded-t-lg last:rounded-b-lg">
              <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--color-border)]/50 transition-colors">
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                  className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={expandedId === u.id}
                >
                  <StatusDot status={u.deliveryStatus} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">{u.docRef?.path ?? u.id}</span>
                  <StatusBadge status={u.deliveryStatus} />
                  <span className="shrink-0 text-xs text-[var(--color-text-subtle)]">{formatRelativeTime(u.timestamp)}</span>
                  {(u.provenance?.estimatedCost ?? 0) > 0 && (
                    <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-subtle)]">
                      ${u.provenance!.estimatedCost.toFixed(2)}
                    </span>
                  )}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`shrink-0 text-[var(--color-text-subtle)] transition-transform ${expandedId === u.id ? 'rotate-180' : ''}`}
                    aria-hidden
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <Link
                  to={`/timeline/commit/${u.commitHash}`}
                  className="shrink-0 font-mono text-[11px] text-[var(--color-text-subtle)] hover:text-[var(--color-accent)]"
                >
                  {u.commitHash?.slice(0, 7)}
                </Link>
                {u.deliveryRef && u.deliveryRef.startsWith('http') && (
                  <a
                    href={u.deliveryRef}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs text-[var(--color-accent)] hover:underline"
                  >
                    View
                  </a>
                )}
              </div>
              {expandedId === u.id && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-4">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-subtle)]">
                    <span>Model: <span className="font-mono text-[var(--color-text-muted)]">{u.provenance?.model}</span></span>
                    <span>Tokens: <span className="font-mono text-[var(--color-text-muted)]">{(u.provenance?.inputTokens ?? 0) + (u.provenance?.outputTokens ?? 0)}</span></span>
                  </div>
                  {u.sectionsModified?.length > 0 && (
                    <p className="mt-2 text-xs text-[var(--color-text-subtle)]">
                      Sections: {u.sectionsModified.join(', ')}
                    </p>
                  )}
                  {u.diffFromCurrent && (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
                      <DiffView diff={u.diffFromCurrent} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Agent log pagination" className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-border-subtle)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            Previous
          </button>
          <span className="font-mono text-xs text-[var(--color-text-subtle)]">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-border-subtle)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const ok = ['delivered', 'accepted'].includes(status)
  const fail = ['failed', 'rejected'].includes(status)
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        ok ? 'bg-[var(--color-success)]' : fail ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-text-subtle)]'
      }`}
      aria-hidden="true"
    />
  )
}

function StatusBadge({ status }: { status: string }) {
  const ok = ['delivered', 'accepted'].includes(status)
  const fail = ['failed', 'rejected'].includes(status)
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
        ok ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
        : fail ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
        : 'bg-[var(--color-border)] text-[var(--color-text-subtle)]'
      }`}
      role="status"
      aria-label={status}
    >
      {status}
    </span>
  )
}
