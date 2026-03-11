import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDashboardDataContext } from '../context/DashboardDataContext'
import { formatRelativeTime } from '../utils/formatTime'

const PAGE_SIZE = 50

export function Timeline() {
  const { changeSummaries, loadErrors, loading } = useDashboardDataContext()
  const [page, setPage] = useState(0)
  const sorted = [...changeSummaries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  const total = sorted.length
  const start = page * PAGE_SIZE
  const pageItems = sorted.slice(start, start + PAGE_SIZE)
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl text-[var(--color-text)]">Timeline</h1>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-[72px]" aria-hidden />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-4">
        <h1 className="font-display text-3xl text-[var(--color-text)]">Timeline</h1>
        {total > 0 && (
          <span className="text-xs text-[var(--color-text-subtle)]">{total} event{total !== 1 ? 's' : ''}</span>
        )}
      </div>

      {loadErrors.length > 0 && <AlertBanner messages={loadErrors} />}

      {sorted.length === 0 && (
        <div className="dotted-grid rounded-xl border border-[var(--color-border)] p-12 text-center">
          <h2 className="font-display text-2xl text-[var(--color-text)]">No activity yet</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-[var(--color-text-subtle)]">
            Run the agent to see change summaries here.
          </p>
          <Link to="/" className="btn-accent mt-6 inline-flex items-center rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors">
            Back to Dashboard
          </Link>
        </div>
      )}

      {pageItems.length > 0 && (
        <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          {pageItems.map((s) => (
            <Link
              key={s.id}
              to={`/timeline/commit/${s.commitHash}`}
              className="block px-5 py-4 hover:bg-[var(--color-border)]/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <div className="flex items-start gap-3">
                <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {s.commitMessage?.trim() || `Commit ${s.commitHash?.slice(0, 7)}`}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-[var(--color-text-subtle)]">{s.author}</span>
                    <span className="text-xs text-[var(--color-text-subtle)]">{formatRelativeTime(s.timestamp)}</span>
                    {s.branch && <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">{s.branch}</span>}
                    {s.prNumber && <span className="text-xs text-[var(--color-text-subtle)]">PR #{s.prNumber}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--color-text-subtle)]">
                    <span>+{s.filesAdded ?? 0} ~{s.filesModified ?? 0} -{s.filesDeleted ?? 0}</span>
                    <span className="text-[var(--color-accent)]">{s.docsUpdated} doc{s.docsUpdated !== 1 ? 's' : ''} updated</span>
                  </div>
                  {s.docsAffected?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.docsAffected.map((d, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-subtle)]">
                          {d.docRef?.path ?? 'doc'}
                          <StatusDot status={d.status} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-subtle)]">{s.commitHash?.slice(0, 7)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Timeline pagination" className="flex items-center gap-3">
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
  const color =
    status === 'updated' || status === 'delivered' ? 'bg-[var(--color-success)]'
    : status === 'skipped' ? 'bg-[var(--color-text-subtle)]'
    : 'bg-[var(--color-warning)]'
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} title={status} />
}

function AlertBanner({ messages }: { messages: string[] }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-4 py-3" role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden>
        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-sm text-[var(--color-text-muted)]">{messages.slice(0, 2).join(' ')}</p>
    </div>
  )
}
