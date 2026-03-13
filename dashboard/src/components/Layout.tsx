import { useState, useEffect, useRef } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useDashboardDataContext } from '../context/DashboardDataContext'
import { hasApi, getLoginUrl, getRepoAccessUrl, getLogoutUrl, disconnectRepo, getAvailableRepos, connectRepo } from '../data/api'
import type { ApiAvailableRepo } from '../data/api'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const connectedStatus = searchParams.get('connected')
  const authStatus = searchParams.get('auth')
  const installStatus = searchParams.get('install')
  const installErrorCode = searchParams.get('error')
  const repoParam = searchParams.get('repo')
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
  const [connectReposOpen, setConnectReposOpen] = useState(false)
  const [availableRepos, setAvailableRepos] = useState<ApiAvailableRepo[]>([])
  const [loadingAvailableRepos, setLoadingAvailableRepos] = useState(false)
  const [availableReposError, setAvailableReposError] = useState<string | null>(null)
  const [connectingRepo, setConnectingRepo] = useState<string | null>(null)
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

  useEffect(() => {
    if (!connectedStatus && !authStatus && !installStatus) return

    let cancelled = false
    const clearTransientParams = () => setSearchParams(repoParam ? { repo: repoParam } : {})

    ;(async () => {
      if (connectedStatus === '1') {
        await refetchRepos()
        if (cancelled) return
        setBanner('Repository connected successfully.')
      } else if (authStatus === 'ok') {
        await refetchRepos()
        if (cancelled) return
        setBanner('Signed in.')
      }

      if (installStatus === 'ok' || installStatus === 'error') {
        setConnectReposOpen(true)
        setLoadingAvailableRepos(true)
        setAvailableReposError(installStatus === 'error' ? formatInstallError(installErrorCode) : null)
        try {
          const list = await getAvailableRepos()
          if (cancelled) return
          setAvailableRepos(list)
          if (list.length > 0) {
            setAvailableReposError(null)
            setBanner('GitHub access updated. Choose a repo below and click Connect to add it to your dashboard.')
          } else if (installStatus === 'error') {
            setBanner('GitHub repo access changed, but AutoDocs could not refresh the repo list yet.')
          } else {
            setAvailableReposError('GitHub returned successfully, but AutoDocs still has no app-accessible repositories to connect.')
            setBanner('GitHub access updated. Refresh the repo list or reopen repo access and save again.')
          }
        } catch {
          if (cancelled) return
          setAvailableRepos([])
          setAvailableReposError(formatInstallError(installErrorCode))
        } finally {
          if (!cancelled) setLoadingAvailableRepos(false)
        }
      }

      if (!cancelled) clearTransientParams()
    })()

    return () => {
      cancelled = true
    }
  }, [authStatus, connectedStatus, installErrorCode, installStatus, refetchRepos, repoParam, setSearchParams])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 4000)
    return () => clearTimeout(t)
  }, [banner])

  const loadAvailableRepos = async () => {
    setLoadingAvailableRepos(true)
    setAvailableReposError(null)
    try {
      const list = await getAvailableRepos()
      setAvailableRepos(list)
    } catch {
      setAvailableRepos([])
      setAvailableReposError('Failed to load app-accessible repositories.')
    } finally {
      setLoadingAvailableRepos(false)
    }
  }

  const openConnectModal = async () => {
    setConnectReposOpen(true)
    await loadAvailableRepos()
  }

  const handleConnectRepo = async (repo: string) => {
    setConnectingRepo(repo)
    setAvailableReposError(null)
    try {
      const ok = await connectRepo(repo)
      if (!ok) {
        setAvailableReposError('Failed to connect repository.')
        return
      }
      await refetchRepos()
      await loadAvailableRepos()
      setSelectedRepo(repo)
      setConnectReposOpen(false)
      setBanner('Repository connected successfully.')
    } finally {
      setConnectingRepo(null)
    }
  }

  const knownInstallationIds = Array.from(
    new Set(
      [...availableRepos.map((repo) => repo.installationId), ...repos.map((repo) => repo.installationId)]
        .filter((installationId): installationId is string => Boolean(installationId))
    )
  )
  const knownInstallationId = knownInstallationIds.length === 1 ? knownInstallationIds[0] : undefined
  const repoAccessUrl = user ? getRepoAccessUrl(String(user.id), knownInstallationId, 'manage') : '#'
  const installAppUrl = user && !knownInstallationId ? getRepoAccessUrl(String(user.id), undefined, 'install') : undefined
  const repoAccessLabel = knownInstallationId ? 'Manage repo access' : 'Manage existing access'
  const repoAccessHelpText = knownInstallationId
    ? 'Open the GitHub installation settings to add or remove repositories, then return here, refresh, and click Connect on the repo you want in AutoDocs.'
    : 'If the app is already installed, use Manage existing access. If this is your first time, use Install app instead.'

  return (
    <div className="min-h-screen text-[var(--color-text)]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-60">
        {banner && (
          <div
            className="flex items-center justify-center gap-2 border-b border-[var(--color-success)]/30 bg-[var(--color-success)]/8 px-4 py-2.5 text-sm"
            role="alert"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span>{banner}</span>
          </div>
        )}

        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)] lg:hidden"
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

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!hasApi() && (
              <span className="text-xs text-[var(--color-text-subtle)]">
                Static mode ·{' '}
                <a href="https://github.com/jjjorgenson/gartnerTracer#install-and-run" target="_blank" rel="noopener noreferrer">
                  Connect backend
                </a>
              </span>
            )}

            {hasApi() && apiError === 'unauthorized' && (
              <a
                href={getLoginUrl()}
                className="btn-accent inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Sign in with GitHub
              </a>
            )}

            {hasApi() && user && (
              <>
                {repos.length > 0 && (
                  <div className="relative" ref={repoDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        if (repos.length > 1) {
                          setRepoDropdownOpen((o) => !o)
                        }
                      }}
                      className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors ${
                        repos.length > 1
                          ? 'hover:border-[var(--color-border-subtle)]'
                          : 'cursor-default'
                      }`}
                      aria-expanded={repos.length > 1 ? repoDropdownOpen : undefined}
                      aria-haspopup={repos.length > 1 ? 'listbox' : undefined}
                      title={selectedRepo ?? undefined}
                    >
                      <span className="max-w-[140px] truncate font-mono text-xs">{selectedRepo || 'Select repo'}</span>
                      {repos.length > 1 ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--color-text-subtle)]" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
                      ) : (
                        <span className="rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-success)]">
                          Connected
                        </span>
                      )}
                    </button>
                    {repos.length > 1 && repoDropdownOpen && (
                      <div
                        className="absolute right-0 top-full z-50 mt-1.5 min-w-[200px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-2xl"
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
                            className={`flex w-full items-center px-3 py-2 text-left font-mono text-xs transition-colors ${
                              r.repo === selectedRepo
                                ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]'
                            }`}
                          >
                            {r.repo}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    void openConnectModal()
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-border-subtle)] hover:text-[var(--color-text)] transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 4v16m8-8H4" /></svg>
                  Connect
                </button>

                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((o) => !o)}
                    className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] hover:border-[var(--color-border-subtle)] transition-colors"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    aria-label={`${user?.login ?? 'User'} menu`}
                    title={user?.login}
                  >
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-full w-full object-cover" width={36} height={36} />
                    ) : (
                      <span className="text-xs font-medium text-[var(--color-text-muted)]">{user?.login?.slice(0, 2).toUpperCase()}</span>
                    )}
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[180px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-2xl" role="menu">
                      <div className="border-b border-[var(--color-border)] px-3 py-2">
                        <p className="text-sm font-medium text-[var(--color-text)]">{user?.login}</p>
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setManageReposOpen(true)
                          setUserMenuOpen(false)
                        }}
                        className="flex w-full min-h-[44px] items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)] transition-colors"
                      >
                        Manage repos
                      </button>
                      <a
                        href={getLogoutUrl()}
                        role="menuitem"
                        className="flex min-h-[44px] items-center gap-2 border-t border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-border)] transition-colors"
                      >
                        Sign out
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}

            <SyncButton />
          </div>
        </header>

        <main className="animate-in p-5 lg:p-8" role="main">
          <Outlet />
        </main>
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

      {connectReposOpen && user && (
        <ConnectRepoModal
          repos={availableRepos}
          loading={loadingAvailableRepos}
          error={availableReposError}
          connectingRepo={connectingRepo}
          repoAccessUrl={repoAccessUrl}
          repoAccessLabel={repoAccessLabel}
          repoAccessHelpText={repoAccessHelpText}
          installAppUrl={installAppUrl}
          onClose={() => setConnectReposOpen(false)}
          onRefresh={() => {
            void loadAvailableRepos()
          }}
          onConnect={(repo) => {
            void handleConnectRepo(repo)
          }}
        />
      )}
    </div>
  )
}

function formatInstallError(code: string | null): string {
  switch (code) {
    case 'list_failed':
      return 'GitHub saved the repo-access change, but AutoDocs could not refresh the accessible repo list. If the backend GitHub App key changed, restart the backend and refresh this list.'
    case 'app_not_configured':
      return 'GitHub App repo access is not fully configured on the backend yet.'
    case 'no_accessible_repos':
      return 'GitHub did not return any app-accessible repositories for this account. Check the selected repositories in the installation settings, then refresh.'
    default:
      return 'Failed to load app-accessible repositories.'
  }
}

function SyncButton() {
  const handleSync = () => {
    window.dispatchEvent(new CustomEvent('autodocs-refresh'))
  }
  return (
    <button
      type="button"
      onClick={handleSync}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-subtle)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-muted)] transition-colors"
      aria-label="Refresh dashboard data"
      title="Refresh"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  )
}

function ConnectRepoModal({
  repos,
  loading,
  error,
  connectingRepo,
  repoAccessUrl,
  repoAccessLabel,
  repoAccessHelpText,
  installAppUrl,
  onClose,
  onRefresh,
  onConnect,
}: {
  repos: ApiAvailableRepo[]
  loading: boolean
  error: string | null
  connectingRepo: string | null
  repoAccessUrl: string
  repoAccessLabel: string
  repoAccessHelpText: string
  installAppUrl?: string
  onClose: () => void
  onRefresh: () => void
  onConnect: (repo: string) => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="connect-repos-title">
      <div className="animate-in max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 id="connect-repos-title" className="font-display text-xl text-[var(--color-text)]">Connect Repository</h2>
            <p className="mt-1 text-sm text-[var(--color-text-subtle)]">
              GitHub granting repo access only makes a repository available here. Click Connect below to add it to your dashboard.
            </p>
          </div>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-subtle)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-muted)] transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3">
            <div className="text-sm text-[var(--color-text-muted)]">
              {repoAccessHelpText}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-border-subtle)] hover:text-[var(--color-text)] transition-colors"
              >
                Refresh
              </button>
              <a
                href={repoAccessUrl}
                className="btn-accent inline-flex min-h-[44px] items-center rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                {repoAccessLabel}
              </a>
              {installAppUrl && (
                <a
                  href={installAppUrl}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-border-subtle)] hover:text-[var(--color-text)] transition-colors"
                >
                  Install app
                </a>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]">
              {error}
            </div>
          )}

          <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-[var(--color-border)]">
            {loading ? (
              <div className="px-5 py-12 text-center text-sm text-[var(--color-text-subtle)]">Loading repositories...</div>
            ) : repos.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-[var(--color-text)]">No app-accessible repositories yet</p>
                <p className="mt-1 text-sm text-[var(--color-text-subtle)]">
                  Use <span className="font-medium text-[var(--color-text)]">{repoAccessLabel}</span> if the app is already installed. Otherwise install the app first, then come back here, refresh the list, and click Connect on the repo you want in AutoDocs.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {repos.map((repo) => (
                  <li key={repo.repo} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <a
                        href={repo.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-mono text-sm text-[var(--color-text)] hover:text-[var(--color-accent)]"
                      >
                        {repo.repo}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[var(--color-text-subtle)]">
                          {repo.hasData ? 'Data ready' : 'Waiting for ingest'}
                        </span>
                        {repo.connected && (
                          <span className="rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-2 py-1 text-[var(--color-success)]">
                            Connected
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onConnect(repo.repo)}
                      disabled={repo.connected || connectingRepo === repo.repo}
                      className={`inline-flex min-h-[44px] min-w-[108px] items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        repo.connected
                          ? 'cursor-default border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-subtle)]'
                          : 'bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]'
                      } disabled:opacity-60`}
                    >
                      {connectingRepo === repo.repo ? 'Connecting...' : repo.connected ? 'Connected' : 'Connect'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="manage-repos-title">
      <div
        ref={panelRef}
        className="animate-in max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 id="manage-repos-title" className="font-display text-xl text-[var(--color-text)]">Manage Repos</h2>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-subtle)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-muted)] transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {repos.length === 0 ? (
            <div className="dotted-grid rounded-lg py-10 text-center">
              <p className="text-sm font-medium text-[var(--color-text)]">No repositories connected</p>
              <p className="mt-1 text-xs text-[var(--color-text-subtle)]">Use the Connect button in the header to add one.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {repos.map((r) => (
                <li key={r.repo} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 hover:bg-[var(--color-border)]/50 transition-colors">
                  <a href={r.repoUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-mono text-xs text-[var(--color-text)] hover:text-[var(--color-accent)]">{r.repo}</a>
                  {confirmRepo === r.repo ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-[var(--color-text-subtle)]">Remove?</span>
                      <button type="button" onClick={() => handleDisconnect(r.repo)} disabled={disconnecting === r.repo} className="min-h-[44px] min-w-[44px] text-xs font-medium text-[var(--color-danger)] hover:underline disabled:opacity-50">Yes</button>
                      <button type="button" onClick={() => setConfirmRepo(null)} className="min-h-[44px] min-w-[44px] text-xs font-medium text-[var(--color-text-subtle)] hover:underline">No</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmRepo(r.repo)} className="shrink-0 text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors">Disconnect</button>
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
