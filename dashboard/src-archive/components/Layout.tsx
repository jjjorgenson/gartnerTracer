import { useState, useEffect, useRef } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useDashboardDataContext } from '../context/DashboardDataContext'
import { hasApi, getLoginUrl, getInstallUrl, getLogoutUrl, disconnectRepo } from '../data/api'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    user,
    repos,
    selectedRepo,
    setSelectedRepo,
    apiError,
    refetchRepos,
  } = useDashboardDataContext()
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [manageReposOpen, setManageReposOpen] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const repoDropdownRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (repoDropdownRef.current?.contains(t) || userMenuRef.current?.contains(t)) return
      setRepoDropdownOpen(false)
      setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Handle ?connected=1 and ?auth=ok
  useEffect(() => {
    const connected = searchParams.get('connected')
    const auth = searchParams.get('auth')
    if (connected === '1') {
      refetchRepos()
      setBanner('Repo connected.')
      const repo = searchParams.get('repo')
      setSearchParams(repo ? { repo } : {})
    } else if (auth === 'ok') {
      refetchRepos()
      setBanner('Logged in.')
      const repo = searchParams.get('repo')
      setSearchParams(repo ? { repo } : {})
    }
  }, [searchParams.get('connected'), searchParams.get('auth'), refetchRepos, setSearchParams])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 4000)
    return () => clearTimeout(t)
  }, [banner])

  return (
    <div className="min-h-screen text-[var(--color-text)]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-56">
        {banner && (
          <div
            className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-[var(--color-success)]/40 bg-[var(--color-success)]/15 px-4 py-3 text-sm text-[var(--color-text)]"
            role="alert"
          >
            <span aria-hidden className="shrink-0 text-[var(--color-success)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
            </span>
            <span>{banner}</span>
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)] lg:hidden"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={sidebarOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {sidebarOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M3 12h18M3 6h18M3 18h18" />
              )}
            </svg>
          </button>
          <span className="min-w-0 truncate text-sm text-[var(--color-text-subtle)]" aria-hidden>
            Search
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!hasApi() && (
              <span className="text-sm text-[var(--color-text-subtle)]" title="Set VITE_API_BASE in .env to your backend URL (e.g. http://localhost:3002) and restart the dev server to enable login.">
                Using static data · <a href="https://github.com/jjjorgenson/gartnerTracer#install-and-run" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">Connect to backend</a>
              </span>
            )}
            {hasApi() && apiError === 'unauthorized' && (
              <a
                href={getLoginUrl()}
                className="link-on-accent min-h-[44px] inline-flex items-center justify-center rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-accent-hover)] focus-visible:outline-offset-2"
              >
                Log in with GitHub
              </a>
            )}
            {hasApi() && user && (
              <>
                {repos.length > 1 && (
                  <div className="relative" ref={repoDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setRepoDropdownOpen((o) => !o)}
                      className="min-h-[44px] flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
                      aria-expanded={repoDropdownOpen}
                      aria-haspopup="listbox"
                    >
                      <span className="max-w-[120px] truncate">{selectedRepo || 'Select repo'}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {repoDropdownOpen && (
                      <div
                        className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-lg"
                        role="listbox"
                      >
                        {repos.map((r) => (
                          <button
                            key={r.repo}
                            type="button"
                            role="option"
                            aria-selected={r.repo === selectedRepo}
                            onClick={() => {
                              setSelectedRepo(r.repo)
                              setRepoDropdownOpen(false)
                            }}
                            className="block w-full truncate px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-border)]"
                          >
                            {r.repo}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <a
                  href={user ? getInstallUrl(String(user.id)) : '#'}
                  className="min-h-[44px] inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
                >
                  Connect Repo
                </a>
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((o) => !o)}
                    className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] hover:bg-[var(--color-border)]"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    title={user?.login}
                  >
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-full w-full object-cover" width={36} height={36} />
                    ) : (
                      <span className="text-sm font-medium">{user?.login?.slice(0, 2).toUpperCase()}</span>
                    )}
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-lg">
                      <div className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)]">
                        {user?.login}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setManageReposOpen(true)
                          setUserMenuOpen(false)
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-border)]"
                      >
                        Manage Repos
                      </button>
                      <a
                        href={getLogoutUrl()}
                        className="block border-t border-[var(--color-border)] px-3 py-2.5 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-border)]"
                      >
                        Log out
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}
            <SyncButton />
          </div>
        </header>
        <main className="p-4 lg:p-6" role="main">
          <Outlet />
        </main>
        <footer className="border-t border-[var(--color-border)] px-4 py-3 text-center text-sm text-[var(--color-text-subtle)]">
          <a href="https://tracer.dev/docs" target="_blank" rel="noopener noreferrer">
            tracer.dev/docs
          </a>
        </footer>
      </div>
      {manageReposOpen && (
        <ManageReposModal
          repos={repos}
          onClose={() => setManageReposOpen(false)}
          onDisconnect={async (owner, repo) => {
            const ok = await disconnectRepo(owner, repo)
            if (ok) refetchRepos()
          }}
        />
      )}
    </div>
  )
}

function SyncButton() {
  const handleSync = () => {
    window.dispatchEvent(new CustomEvent('autodocs-refresh'))
  }
  return (
    <button
      type="button"
      onClick={handleSync}
      className="min-h-[44px] inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-border)]"
      aria-label="Refresh dashboard data"
    >
      Refresh data
    </button>
  )
}

function ManageReposModal({
  repos,
  onClose,
  onDisconnect,
}: {
  repos: { repo: string; repoUrl: string }[]
  onClose: () => void
  onDisconnect: (owner: string, repo: string) => Promise<void>
}) {
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [confirmRepo, setConfirmRepo] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const handleDisconnect = async (fullRepo: string) => {
    const [owner, repo] = fullRepo.split('/')
    if (!owner || !repo) return
    setDisconnecting(fullRepo)
    try {
      await onDisconnect(owner, repo)
      setConfirmRepo(null)
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="manage-repos-title">
      <div
        ref={panelRef}
        className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 id="manage-repos-title" className="text-lg font-semibold text-[var(--color-text)]">Manage Repos</h2>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {repos.length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-medium text-[var(--color-text)]">No repos connected</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Connect a repo from the header to see it here.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]"
              >
                Close
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {repos.map((r) => (
                <li key={r.repo} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
                  <a href={r.repoUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-medium text-[var(--color-text)] hover:underline">{r.repo}</a>
                  {confirmRepo === r.repo ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="text-xs text-[var(--color-text-muted)]">Remove?</span>
                      <button type="button" onClick={() => handleDisconnect(r.repo)} disabled={disconnecting === r.repo} className="text-xs font-medium text-[var(--color-danger)] hover:underline">Yes</button>
                      <button type="button" onClick={() => setConfirmRepo(null)} className="text-xs font-medium text-[var(--color-text-muted)] hover:underline">No</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmRepo(r.repo)} className="shrink-0 text-sm font-medium text-[var(--color-danger)] hover:underline">Disconnect</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
