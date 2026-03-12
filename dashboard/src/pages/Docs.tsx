import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDashboardDataContext } from '../context/DashboardDataContext'
import { formatRelativeTime } from '../utils/formatTime'
import type { DocStatusEntry } from '../data/types'

function getDocEntries(docStatus: Record<string, unknown>): [string, DocStatusEntry][] {
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

type SortKey = 'path' | 'lastUpdated' | 'state'

export function Docs() {
  const { docStatus, loadErrors, loading } = useDashboardDataContext()
  const [sort, setSort] = useState<SortKey>('path')
  const repo = (docStatus.repo as string) || ''
  const branch = (docStatus.branch as string) || 'main'

  const entries = useMemo(() => {
    const list = getDocEntries(docStatus)
    if (sort === 'path') return list.sort((a, b) => a[0].localeCompare(b[0]))
    if (sort === 'lastUpdated') {
      return list.sort((a, b) => {
        const ta = a[1].lastUpdated || ''
        const tb = b[1].lastUpdated || ''
        return tb.localeCompare(ta)
      })
    }
    const order = { current: 0, pending: 1, stale: 2, unknown: 3 }
    return list.sort((a, b) => (order[a[1].state as keyof typeof order] ?? 4) - (order[b[1].state as keyof typeof order] ?? 4))
  }, [docStatus, sort])

  const openUrl = (docPath: string) => {
    if (!repo) return null
    if (docPath.startsWith('wiki:')) {
      const slug = docPath.replace(/^wiki:/, '')
      return `https://github.com/${repo}/wiki/${slug}`
    }
    return `https://github.com/${repo}/blob/${branch}/${docPath}`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl text-[var(--color-text)]">Docs</h1>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-12" aria-hidden />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-4">
        <h1 className="font-display text-3xl text-[var(--color-text)]">Docs</h1>
        {entries.length > 0 && (
          <span className="text-xs text-[var(--color-text-subtle)]">{entries.length} tracked</span>
        )}
      </div>

      {loadErrors.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-4 py-3" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden>
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-[var(--color-text-muted)]">{loadErrors.slice(0, 2).join(' ')}</p>
        </div>
      )}

      {entries.length === 0 && (
        <div className="dotted-grid rounded-xl border border-[var(--color-border)] p-12 text-center">
          <h2 className="font-display text-2xl text-[var(--color-text)]">No docs tracked</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-[var(--color-text-subtle)]">
            Configure the manifest and run the agent to see doc status here.
          </p>
          <Link to="/settings" className="btn-accent mt-6 inline-flex items-center rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors">
            Open Settings
          </Link>
        </div>
      )}

      {entries.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="text-xs text-[var(--color-text-subtle)]">Sort</label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:border-[var(--color-border-subtle)] transition-colors"
            >
              <option value="path">Path</option>
              <option value="lastUpdated">Last updated</option>
              <option value="state">State</option>
            </select>
          </div>

          <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
            {entries.map(([path, entry]) => (
              <div
                key={path}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5 first:rounded-t-lg last:rounded-b-lg"
              >
                <StateBadge state={entry.state} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-text)]">
                  {path.startsWith('wiki:') ? `wiki/${path.replace(/^wiki:/, '')}` : path}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-subtle)]">
                  {entry.lastVerifiedCommit ? entry.lastVerifiedCommit.slice(0, 7) : '—'}
                </span>
                <span className="shrink-0 text-xs text-[var(--color-text-subtle)]">
                  {entry.lastUpdated ? formatRelativeTime(entry.lastUpdated) : '—'}
                </span>
                {entry.state === 'stale' && entry.staleReason && (
                  <span className="text-[11px] text-[var(--color-warning)]" title={entry.staleReason}>
                    {entry.staleReason.slice(0, 50)}…
                  </span>
                )}
                {openUrl(path) && (
                  <a
                    href={openUrl(path)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    Open ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    current: 'bg-[var(--color-success)]/15 text-[var(--color-success)]',
    pending: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]',
    stale: 'bg-[var(--color-border)] text-[var(--color-text-subtle)]',
    unknown: 'bg-[var(--color-border)] text-[var(--color-text-subtle)]',
  }
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${styles[state] ?? 'bg-[var(--color-border)] text-[var(--color-text-subtle)]'}`}
      role="status"
      aria-label={`Status: ${state}`}
    >
      {state}
    </span>
  )
}
