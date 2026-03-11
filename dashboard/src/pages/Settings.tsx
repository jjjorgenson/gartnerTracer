import { useDashboardDataContext } from '../context/DashboardDataContext'

export function Settings() {
  const { docStatus } = useDashboardDataContext()
  const repo = (docStatus.repo as string) || ''

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl text-[var(--color-text)]">Settings</h1>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <div className="border-b border-[var(--color-border)] px-5 py-3.5">
          <div className="micro-label">Configuration</div>
        </div>
        <div className="px-5 py-5 text-sm text-[var(--color-text-muted)]">
          <p>
            AutoDocs is configured via the manifest file and CI workflow. UI editing is planned for a future release.
          </p>
          {repo && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
              <span className="text-xs text-[var(--color-text-subtle)]">Repository</span>
              <code className="font-mono text-xs text-[var(--color-text)]">{repo}</code>
              <a
                href={`https://github.com/${repo}/settings`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] transition-colors"
              >
                Repo settings ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
