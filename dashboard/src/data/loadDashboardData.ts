/**
 * Load dashboard JSON from base URL (e.g. /dashboard-data/) or from backend API when VITE_API_BASE + selectedRepo.
 */

import type { ChangeSummary, DocStatus, DocUpdate } from './types'
import { hasApi, getRepoData, getChangeSummary, getDocUpdate } from './api'

const DATA_BASE = import.meta.env.BASE_URL + 'dashboard-data'

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

/** Fetch list of JSON filenames from a directory (if index or we glob). We fetch known paths or try common patterns. */
async function fetchJsonDirKeys(basePath: string): Promise<string[]> {
  try {
    const r = await fetch(basePath + '/')
    if (!r.ok) return []
    const text = await r.text()
    const matches = text.match(/href="([^"]+\.json)"/g) || []
    return matches.map((m) => m.replace(/href="|"/g, '').replace(/^\//, ''))
  } catch {
    return []
  }
}

/** Load all JSON files from a directory by fetching index or by known id pattern. For static site we may have no index; use a fixed list or convention. */
async function loadAllFromDir<T>(dirPath: string): Promise<T[]> {
  const keys = await fetchJsonDirKeys(dirPath)
  const out: T[] = []
  for (const k of keys) {
    const full = dirPath.endsWith('/') ? dirPath + k : dirPath + '/' + k
    const item = await fetchJson<T>(full)
    if (item) out.push(item)
  }
  return out
}

/** manifest.json can list { changeSummaryIds: string[], docUpdateIds: string[] } for static hosts without dir listing */
interface DataManifest {
  changeSummaryIds?: string[]
  docUpdateIds?: string[]
}

async function loadChangeSummaries(): Promise<ChangeSummary[]> {
  const manifest = await fetchJson<DataManifest>(DATA_BASE + '/manifest.json')
  const ids = manifest?.changeSummaryIds
  if (Array.isArray(ids) && ids.length > 0) {
    const summaries: ChangeSummary[] = []
    for (const id of ids) {
      const s = await fetchJson<ChangeSummary>(DATA_BASE + '/change-summaries/' + id + '.json')
      if (s) summaries.push(s)
    }
    return summaries.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
  }
  const list = await fetchJson<string[]>(DATA_BASE + '/change-summaries/index.json')
  if (Array.isArray(list)) {
    const summaries: ChangeSummary[] = []
    for (const id of list) {
      const s = await fetchJson<ChangeSummary>(DATA_BASE + '/change-summaries/' + id + '.json')
      if (s) summaries.push(s)
    }
    return summaries.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
  }
  return loadAllFromDir<ChangeSummary>(DATA_BASE + '/change-summaries')
}

async function loadDocUpdates(): Promise<DocUpdate[]> {
  const manifest = await fetchJson<DataManifest>(DATA_BASE + '/manifest.json')
  const ids = manifest?.docUpdateIds
  if (Array.isArray(ids) && ids.length > 0) {
    const updates: DocUpdate[] = []
    for (const id of ids) {
      const u = await fetchJson<DocUpdate>(DATA_BASE + '/doc-updates/' + id + '.json')
      if (u) updates.push(u)
    }
    return updates.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
  }
  const list = await fetchJson<string[]>(DATA_BASE + '/doc-updates/index.json')
  if (Array.isArray(list)) {
    const updates: DocUpdate[] = []
    for (const id of list) {
      const u = await fetchJson<DocUpdate>(DATA_BASE + '/doc-updates/' + id + '.json')
      if (u) updates.push(u)
    }
    return updates.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
  }
  return loadAllFromDir<DocUpdate>(DATA_BASE + '/doc-updates')
}

/** When API + selectedRepo: load from backend. Otherwise load from static dashboard-data. */
export async function loadDashboardData(selectedRepo: string | null): Promise<{
  docStatus: DocStatus
  changeSummaries: ChangeSummary[]
  docUpdates: DocUpdate[]
  loadErrors: string[]
}> {
  const loadErrors: string[] = []

  if (hasApi() && selectedRepo) {
    const [owner, repo] = selectedRepo.split('/')
    if (owner && repo) {
      const data = await getRepoData(owner, repo)
      if (!data) {
        loadErrors.push('Failed to load repo data')
        return {
          docStatus: {},
          changeSummaries: [],
          docUpdates: [],
          loadErrors,
        }
      }
      const docStatus = (data.docStatus || {}) as DocStatus
      const summaryIds = data.manifest?.changeSummaryIds || []
      const updateIds = data.manifest?.docUpdateIds || []
      const changeSummaries: ChangeSummary[] = []
      const docUpdates: DocUpdate[] = []
      for (const id of summaryIds) {
        const s = await getChangeSummary(owner, repo, id)
        if (s) changeSummaries.push(s as ChangeSummary)
      }
      for (const id of updateIds) {
        const u = await getDocUpdate(owner, repo, id)
        if (u) docUpdates.push(u as DocUpdate)
      }
      changeSummaries.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
      docUpdates.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
      return {
        docStatus,
        changeSummaries,
        docUpdates,
        loadErrors: [],
      }
    }
  }

  const docStatus = await fetchJson<DocStatus>(DATA_BASE + '/doc-status.json')
  if (!docStatus || typeof docStatus !== 'object') {
    loadErrors.push('doc-status.json missing or invalid')
  }

  let changeSummaries: ChangeSummary[] = []
  try {
    changeSummaries = await loadChangeSummaries()
  } catch (e) {
    loadErrors.push('change-summaries: ' + (e instanceof Error ? e.message : 'load failed'))
  }

  let docUpdates: DocUpdate[] = []
  try {
    docUpdates = await loadDocUpdates()
  } catch (e) {
    loadErrors.push('doc-updates: ' + (e instanceof Error ? e.message : 'load failed'))
  }

  const safeDocStatus: DocStatus = (docStatus && typeof docStatus === 'object' ? docStatus : {}) as DocStatus

  return {
    docStatus: safeDocStatus,
    changeSummaries,
    docUpdates,
    loadErrors,
  }
}
