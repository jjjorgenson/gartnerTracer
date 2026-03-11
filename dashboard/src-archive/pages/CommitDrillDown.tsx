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
        <p className="text-[var(--color-text-muted)]">Missing commit hash.</p>
        <Link to="/timeline" className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]">
          Back to Timeline
        </Link>
      </div>
    )
  }

  if (!summary && updates.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-[var(--color-text-muted)]">No data for commit {commitHash.slice(0, 7)}.</p>
        <Link to="/timeline" className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]">
          Back to Timeline
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link to="/timeline" className="text-[var(--color-accent)] hover:underline">
          Timeline
        </Link>
        <span className="text-[var(--color-text-subtle)]">/</span>
        <span className="font-mono text-[var(--color-text)]">{commitHash.slice(0, 7)}</span>
      </nav>

      {summary && (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <h2 className="text-lg font-medium text-[var(--color-text)]">Change summary</h2>
          <p className="mt-1 text-[var(--color-text)]">
            {summary.commitMessage?.trim() || '(no message)'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-[var(--color-text-muted)]">
            <span>{summary.author}</span>
            <span>{formatRelativeTime(summary.timestamp)}</span>
            {summary.branch && <span>{summary.branch}</span>}
            {summary.prNumber && <span>PR #{summary.prNumber}</span>}
          </div>
          <div className="mt-2 text-sm text-[var(--color-text-subtle)]">
            Files: +{summary.filesAdded ?? 0} ~{summary.filesModified ?? 0} -{summary.filesDeleted ?? 0}
            · Docs updated: {summary.docsUpdated}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-medium text-[var(--color-text)]">Doc updates</h2>
        {updates.length === 0 && (
          <p className="text-[var(--color-text-muted)]">No doc updates for this commit.</p>
        )}
        <ul className="space-y-4">
          {updates.map((u) => (
            <li
              key={u.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--color-text)]">{u.docRef?.path ?? u.id}</span>
                <StatusBadge status={u.deliveryStatus} />
                {u.deliveryRef && (u.deliveryRef.startsWith('http') ? (
                  <a
                    href={u.deliveryRef}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--color-accent)] hover:underline"
                  >
                    View comment
                  </a>
                ) : (
                  <span className="text-sm text-[var(--color-text-subtle)]">{u.deliveryRef}</span>
                ))}
              </div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">
                {u.provenance?.model} · {formatRelativeTime(u.timestamp)}
                {(u.provenance?.inputTokens ?? 0) + (u.provenance?.outputTokens ?? 0) > 0 && (
                  <span> · {(u.provenance!.inputTokens + u.provenance!.outputTokens).toLocaleString()} tokens</span>
                )}
              </div>
              {u.diffFromCurrent && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                    View diff
                  </summary>
                  <div className="mt-2 overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
                    <DiffView diff={u.diffFromCurrent} />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
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
