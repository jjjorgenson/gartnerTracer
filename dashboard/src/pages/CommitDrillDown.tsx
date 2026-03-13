import { Link, useParams } from 'react-router-dom'
import { useDashboardDataContext } from '../context/DashboardDataContext'
import { formatRelativeTime } from '../utils/formatTime'
import { DiffView } from '../components/DiffView'

export function CommitDrillDown() {
  const { commitHash } = useParams<{ commitHash: string }>()
  const { changeSummaries, docUpdates } = useDashboardDataContext()
  const summary = changeSummaries.find((s) => s.commitHash === commitHash)
  const updates = docUpdates.filter((u) => u.commitHash === commitHash)

  if (!commitHash) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-subtle)]">Missing commit hash.</p>
        <Link to="/timeline" className="inline-flex items-center rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-border-subtle)] hover:text-[var(--color-text)] transition-colors">
          Back to Timeline
        </Link>
      </div>
    )
  }

  if (!summary && updates.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-subtle)]">
          No data for commit <code className="font-mono text-[var(--color-text-muted)]">{commitHash.slice(0, 7)}</code>.
        </p>
        <Link to="/timeline" className="inline-flex items-center rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-border-subtle)] hover:text-[var(--color-text)] transition-colors">
          Back to Timeline
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs">
        <Link to="/timeline" className="text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] transition-colors">
          Timeline
        </Link>
        <span className="text-[var(--color-border-subtle)]">/</span>
        <span className="font-mono text-[var(--color-text-muted)]">{commitHash.slice(0, 7)}</span>
      </nav>

      {summary && (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
          <div className="micro-label mb-3">Change Summary</div>
          <p className="text-base font-medium text-[var(--color-text)]">
            {summary.commitMessage?.trim() || '(no message)'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-subtle)]">
            <span>{summary.author}</span>
            <span>{formatRelativeTime(summary.timestamp)}</span>
            {summary.branch && <span className="font-mono">{summary.branch}</span>}
            {summary.prNumber && <span>PR #{summary.prNumber}</span>}
          </div>
          <div className="mt-2 flex items-center gap-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-subtle)]">
            <span>+{summary.filesAdded ?? 0} ~{summary.filesModified ?? 0} -{summary.filesDeleted ?? 0}</span>
            <span className="text-[var(--color-accent)]">{summary.docsUpdated} doc{summary.docsUpdated !== 1 ? 's' : ''} updated</span>
          </div>
        </section>
      )}

      <section>
        <div className="micro-label mb-4">Doc Updates</div>
        {updates.length === 0 && (
          <p className="text-sm text-[var(--color-text-subtle)]">No doc updates for this commit.</p>
        )}
        <div className="space-y-3">
          {updates.map((u) => (
            <div
              key={u.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]"
            >
              <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <StatusDot status={u.deliveryStatus} />
                <span className="font-medium text-sm text-[var(--color-text)]">{u.docRef?.path ?? u.id}</span>
                <StatusBadge status={u.deliveryStatus} />
                {u.deliveryRef && (u.deliveryRef.startsWith('http') ? (
                  <a
                    href={u.deliveryRef}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    View comment
                  </a>
                ) : (
                  <span className="text-xs text-[var(--color-text-subtle)]">{u.deliveryRef}</span>
                ))}
              </div>
              <div className="border-t border-[var(--color-border)] px-5 py-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-subtle)]">
                  <span>Model: <span className="font-mono text-[var(--color-text-muted)]">{u.provenance?.model}</span></span>
                  <span>{formatRelativeTime(u.timestamp)}</span>
                  {(u.provenance?.inputTokens ?? 0) + (u.provenance?.outputTokens ?? 0) > 0 && (
                    <span>Tokens: <span className="font-mono text-[var(--color-text-muted)]">{(u.provenance!.inputTokens + u.provenance!.outputTokens).toLocaleString()}</span></span>
                  )}
                </div>
              </div>
              {u.diffFromCurrent && (
                <details className="border-t border-[var(--color-border)]">
                  <summary className="cursor-pointer px-5 py-3 text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors">
                    View diff
                  </summary>
                  <div className="overflow-x-auto border-t border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                    <DiffView diff={u.diffFromCurrent} />
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const ok = ['delivered', 'accepted'].includes(status)
  const fail = ['failed', 'rejected'].includes(status)
  return (
    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-[var(--color-success)]' : fail ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-text-subtle)]'}`} aria-hidden="true" />
  )
}

function StatusBadge({ status }: { status: string }) {
  const ok = ['delivered', 'accepted'].includes(status)
  const fail = ['failed', 'rejected'].includes(status)
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
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
