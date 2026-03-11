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
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Timeline</h1>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-24 w-full" aria-hidden />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Timeline</h1>
      {loadErrors.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--color-text)]" role="alert">
          <span className="shrink-0 text-[var(--color-warning)]" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </span>
          <p>{loadErrors.slice(0, 2).join(' ')}</p>
        </div>
      )}
      {sorted.length === 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-10 text-center">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">No activity yet</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Run the agent to see change summaries here.</p>
          <Link to="/" className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]">
            Back to Dashboard
          </Link>
        </div>
      )}
      <ul className="space-y-3">
        {pageItems.map((s) => (
          <li key={s.id}>
            <Link
              to={`/timeline/commit/${s.commitHash}`}
              className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 text-[var(--color-text)] hover:bg-[var(--color-border)]"
            >
              <div className="font-medium">
                {s.commitMessage?.trim() || `Commit ${s.commitHash?.slice(0, 7)}`}
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-sm text-[var(--color-text-muted)]">
                <span>{s.author}</span>
                <span>{formatRelativeTime(s.timestamp)}</span>
                {s.branch && <span>branch: {s.branch}</span>}
                {s.prNumber && <span>PR #{s.prNumber}</span>}
              </div>
              <div className="mt-2 text-sm text-[var(--color-text-subtle)]">
                files: +{s.filesAdded ?? 0} ~{s.filesModified ?? 0} -{s.filesDeleted ?? 0} · docs
                updated: {s.docsUpdated}
              </div>
              {s.docsAffected?.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {s.docsAffected.map((d, i) => (
                    <li key={i}>
                      <span className="rounded bg-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                        {d.docRef?.path ?? 'doc'} ({d.status})
                        {d.updateId && (
                          <Link
                            to={`/agent-log?id=${d.updateId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="ml-1 text-[var(--color-accent)] hover:underline"
                          >
                            view
                          </Link>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <nav aria-label="Timeline pagination" className="flex flex-wrap items-center gap-3">
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
