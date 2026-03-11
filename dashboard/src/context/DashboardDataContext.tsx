import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadDashboardData } from '../data/loadDashboardData'
import { hasApi, getMe, getRepos } from '../data/api'
import type { ApiUser, ApiRepo } from '../data/api'
import type { ChangeSummary, DocStatus, DocUpdate } from '../data/types'

export interface DashboardDataState {
  docStatus: DocStatus
  changeSummaries: ChangeSummary[]
  docUpdates: DocUpdate[]
  loadErrors: string[]
  loading: boolean
  refresh: () => Promise<void>
  // API mode
  user: ApiUser | null
  repos: ApiRepo[]
  selectedRepo: string | null
  setSelectedRepo: (repo: string | null) => void
  apiError: string | null
  refetchRepos: () => Promise<void>
}

const defaultState: DashboardDataState = {
  docStatus: {},
  changeSummaries: [],
  docUpdates: [],
  loadErrors: [],
  loading: true,
  refresh: async () => {},
  user: null,
  repos: [],
  selectedRepo: null,
  setSelectedRepo: () => {},
  apiError: null,
  refetchRepos: async () => {},
}

const DashboardDataContext = createContext<DashboardDataState>(defaultState)

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState<DashboardDataState>(defaultState)
  const [user, setUser] = useState<ApiUser | null>(null)
  const [repos, setRepos] = useState<ApiRepo[]>([])
  const [apiError, setApiError] = useState<string | null>(null)
  const selectedRepoFromUrl = searchParams.get('repo')
  const repoList = repos.map((r) => r.repo)
  const selectedRepo =
    (selectedRepoFromUrl && repoList.includes(selectedRepoFromUrl) ? selectedRepoFromUrl : null) ||
    (repos.length > 0 ? repos[0].repo : null)

  const setSelectedRepo = useCallback(
    (repo: string | null) => {
      if (repo) setSearchParams({ repo })
      else setSearchParams({})
    },
    [setSearchParams]
  )

  const refresh = useCallback(async () => {
    const effectiveRepo = selectedRepo
    setState((s) => ({ ...s, loading: true }))
    try {
      const result = await loadDashboardData(effectiveRepo)
      setState((s) => ({
        ...s,
        docStatus: result.docStatus,
        changeSummaries: result.changeSummaries,
        docUpdates: result.docUpdates,
        loadErrors: result.loadErrors,
        loading: false,
      }))
    } catch (e) {
      setState((s) => ({
        ...s,
        loadErrors: [...s.loadErrors, e instanceof Error ? e.message : 'Failed to load'],
        loading: false,
      }))
    }
  }, [selectedRepo])

  const refetchRepos = useCallback(async () => {
    if (!hasApi()) return
    const list = await getRepos()
    setRepos(list)
  }, [])

  // When API is set: fetch user and repos on mount; sync selectedRepo from URL or first repo
  useEffect(() => {
    if (!hasApi()) {
      setApiError(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const me = await getMe()
      if (cancelled) return
      if (!me) {
        setUser(null)
        setRepos([])
        setApiError('unauthorized')
        return
      }
      setUser(me)
      setApiError(null)
      const list = await getRepos()
      if (cancelled) return
      setRepos(list)
      const inList = list.map((r) => r.repo)
      const urlRepo = searchParams.get('repo')
      const effective = urlRepo && inList.includes(urlRepo) ? urlRepo : list[0]?.repo ?? null
      if (effective && !urlRepo) {
        setSearchParams({ repo: effective })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Load dashboard data: static once when no API; when API, when user + selectedRepo (URL or first repo) change
  useEffect(() => {
    if (!hasApi()) {
      setState((s) => ({ ...s, loading: true }))
      loadDashboardData(null).then((result) => {
        setState((s) => ({
          ...s,
          docStatus: result.docStatus,
          changeSummaries: result.changeSummaries,
          docUpdates: result.docUpdates,
          loadErrors: result.loadErrors,
          loading: false,
        }))
      }).catch((e) => {
        setState((s) => ({
          ...s,
          loadErrors: [e instanceof Error ? e.message : 'Failed to load'],
          loading: false,
        }))
      })
      return
    }
    const urlRepo = searchParams.get('repo')
    const effective = urlRepo || (repos.length > 0 ? repos[0].repo : null)
    if (!user) return
    if (!effective) {
      setState((s) => ({ ...s, loading: false, docStatus: {}, changeSummaries: [], docUpdates: [], loadErrors: [] }))
      return
    }
    setState((s) => ({ ...s, loading: true }))
    loadDashboardData(effective).then((result) => {
      setState((s) => ({
        ...s,
        docStatus: result.docStatus,
        changeSummaries: result.changeSummaries,
        docUpdates: result.docUpdates,
        loadErrors: result.loadErrors,
        loading: false,
      }))
    }).catch((e) => {
      setState((s) => ({
        ...s,
        loadErrors: [e instanceof Error ? e.message : 'Failed to load'],
        loading: false,
      }))
    })
  }, [hasApi(), user?.id, selectedRepoFromUrl, repos.length])

  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('tracer-refresh', handler)
    return () => window.removeEventListener('tracer-refresh', handler)
  }, [refresh])

  const value: DashboardDataState = {
    ...state,
    refresh,
    user,
    repos,
    selectedRepo,
    setSelectedRepo,
    apiError,
    refetchRepos,
  }
  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  )
}

export function useDashboardDataContext() {
  const ctx = useContext(DashboardDataContext)
  if (!ctx) throw new Error('useDashboardDataContext must be used within DashboardDataProvider')
  return ctx
}
