/**
 * Backend API client when VITE_API_BASE is set. All requests use credentials for session cookie.
 */

const API_BASE = import.meta.env.VITE_API_BASE as string | undefined

export function hasApi(): boolean {
  return Boolean(API_BASE?.trim())
}

function base(): string {
  const b = (API_BASE || '').trim()
  return b.endsWith('/') ? b.slice(0, -1) : b
}

export async function fetchWithAuth(path: string, opts: RequestInit = {}): Promise<Response> {
  const url = base() + path
  return fetch(url, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
}

export interface ApiUser {
  id: number
  login: string
  avatar_url?: string
}

export async function getMe(): Promise<ApiUser | null> {
  if (!hasApi()) return null
  const r = await fetchWithAuth('/api/auth/me')
  if (r.status === 401) return null
  if (!r.ok) return null
  return (await r.json()) as ApiUser
}

export interface ApiRepo {
  repo: string
  repoUrl: string
  installationId?: string
}

export interface ApiAvailableRepo extends ApiRepo {
  connected: boolean
  hasData: boolean
}

export async function getRepos(): Promise<ApiRepo[]> {
  if (!hasApi()) return []
  const r = await fetchWithAuth('/api/repos')
  if (r.status === 401) return []
  if (!r.ok) return []
  return (await r.json()) as ApiRepo[]
}

export async function getAvailableRepos(): Promise<ApiAvailableRepo[]> {
  if (!hasApi()) return []
  const r = await fetchWithAuth('/api/repos/available')
  if (r.status === 401) return []
  if (!r.ok) return []
  return (await r.json()) as ApiAvailableRepo[]
}

export async function connectRepo(repo: string): Promise<boolean> {
  const r = await fetchWithAuth('/api/repos/connect', {
    method: 'POST',
    body: JSON.stringify({ repo }),
  })
  return r.ok
}

export interface RepoDataResponse {
  manifest: { changeSummaryIds: string[]; docUpdateIds: string[] }
  docStatus: Record<string, unknown>
}

export async function getRepoData(owner: string, repo: string): Promise<RepoDataResponse | null> {
  if (!hasApi()) return null
  const r = await fetchWithAuth(`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/data`)
  if (!r.ok) return null
  return (await r.json()) as RepoDataResponse
}

export async function getChangeSummary(owner: string, repo: string, id: string): Promise<unknown> {
  const r = await fetchWithAuth(
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/change-summaries/${encodeURIComponent(id)}`
  )
  if (!r.ok) return null
  return r.json()
}

export async function getDocUpdate(owner: string, repo: string, id: string): Promise<unknown> {
  const r = await fetchWithAuth(
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/doc-updates/${encodeURIComponent(id)}`
  )
  if (!r.ok) return null
  return r.json()
}

export function getLoginUrl(): string {
  return base() + '/api/auth/login'
}

export function getRepoAccessUrl(
  state: string,
  installationId?: string,
  mode: 'manage' | 'install' = 'manage'
): string {
  const params = new URLSearchParams({ state, mode })
  if (installationId) params.set('installation_id', installationId)
  return base() + '/api/auth/install?' + params.toString()
}

export function getLogoutUrl(): string {
  return base() + '/api/auth/logout'
}

export async function disconnectRepo(owner: string, repo: string): Promise<boolean> {
  const r = await fetchWithAuth(
    `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { method: 'DELETE' }
  )
  return r.ok
}
