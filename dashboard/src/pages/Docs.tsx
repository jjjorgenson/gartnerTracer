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
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Docs</h1>
        <div className="mt-4 h-64 animate-pulse rounded-lg bg-[var(--color-border)]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Docs</h1>
      {loadErrors.length > 0 && (
        <div className="rounded-lg border border-amber-600/50 bg-amber-900/20 px-4 py-2 text-amber-100">
          {loadErrors.join(', ')}
        </div>
      )}
      {entries.length === 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 text-[var(--color-text-muted)]">
          No docs tracked. Configure the manifest and run the agent.
          <Link to="/settings" className="ml-2 text-[var(--color-accent)] hover:underline">
            Settings
          </Link>
        </div>
      )}
      {entries.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="text-sm text-[var(--color-text-muted)]">Sort by</label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)]"
            >
              <option value="path">Path</option>
              <option value="lastUpdated">Last updated</option>
              <option value="state">State</option>
            </select>
          </div>
          <ul className="space-y-2">
            {entries.map(([path, entry]) => (
              <li
                key={path}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3"
              >
                <span className="font-medium text-[var(--color-text)]">
                  {path.startsWith('wiki:') ? `Wiki: ${path.replace(/^wiki:/, '')}` : path}
                </span>
                <StateBadge state={entry.state} />
                <span className="text-sm text-[var(--color-text-subtle)]">
                  {entry.lastVerifiedCommit ? entry.lastVerifiedCommit.slice(0, 7) : '—'}
                </span>
                <span className="text-sm text-[var(--color-text-subtle)]">
                  {entry.lastUpdated ? formatRelativeTime(entry.lastUpdated) : '—'}
                </span>
                {entry.state === 'stale' && entry.staleReason && (
                  <span className="text-xs text-[var(--color-text-subtle)]" title={entry.staleReason}>
                    {entry.staleReason.slice(0, 60)}…
                  </span>
                )}
                {openUrl(path) && (
                  <a
                    href={openUrl(path)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--color-accent)] hover:underline"
                  >
                    Open in repo
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function StateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    current: 'bg-emerald-900/50 text-emerald-300',
    pending: 'bg-amber-900/50 text-amber-300',
    stale: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
    unknown: 'bg-[var(--color-border)] text-[var(--color-text-subtle)]',
  }
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${styles[state] ?? 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}
      role="status"
    >
      {state}
    </span>
  )
}
