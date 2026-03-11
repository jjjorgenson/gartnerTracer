import { useDashboardDataContext } from '../context/DashboardDataContext'

export function Settings() {
  const { docStatus } = useDashboardDataContext()
  const repo = (docStatus.repo as string) || ''

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Settings</h1>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 text-[var(--color-text-muted)]">
        <p>
          Configured via manifest and CI. Editing from the UI is planned for a later release.
        </p>
        {repo && (
          <p className="mt-2">
            Current repo: <span className="font-mono text-[var(--color-text)]">{repo}</span>
            {' · '}
            <a
              href={`https://github.com/${repo}/settings`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline"
            >
              Repo settings
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
