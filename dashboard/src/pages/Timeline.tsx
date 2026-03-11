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
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Timeline</h1>
        <div className="mt-4 h-64 animate-pulse rounded-lg bg-[var(--color-border)]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Timeline</h1>
      {loadErrors.length > 0 && (
        <div className="rounded-lg border border-amber-600/50 bg-amber-900/20 px-4 py-2 text-amber-100">
          {loadErrors.join(', ')}
        </div>
      )}
      {sorted.length === 0 && (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 text-[var(--color-text-muted)]">
          No activity yet.
        </p>
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1 text-[var(--color-text)] disabled:opacity-50"
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
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1 text-[var(--color-text)] disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
