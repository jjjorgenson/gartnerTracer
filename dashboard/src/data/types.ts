/** TRD §3.2, §3.3, §6 — dashboard data types */

export interface DocRef {
  type: string
  path: string
  metadata?: Record<string, string>
}

export interface Provenance {
  model: string
  provider: string
  timestamp: string
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  promptHash?: string
}

export interface DocImpact {
  docRef: DocRef
  status: 'updated' | 'stale' | 'current' | 'unmapped'
  updateId?: string
}

export interface ChangeSummary {
  id: string
  commitHash: string
  commitMessage: string
  author: string
  timestamp: string
  filesChanged: number
  filesAdded: number
  filesModified: number
  filesDeleted: number
  docsAffected: DocImpact[]
  docsUpdated: number
  docsSkipped: number
  provenance: Provenance
  markdownBody: string
  schemaVersion?: number
  prNumber?: string | null
  branch?: string | null
  repo?: string | null
}

export interface DocUpdate {
  id: string
  commitHash: string
  triggeredBy: 'ci' | 'manual'
  docRef: DocRef
  strategy: 'suggest' | 'pr-comment' | 'commit'
  currentHash: string
  suggestedContent: string
  suggestedHash: string
  diffFromCurrent: string
  sectionsModified: string[]
  provenance: Provenance
  deliveryStatus: 'pending' | 'delivered' | 'failed' | 'accepted' | 'rejected'
  deliveryRef?: string
  deliveredAt?: string
  timestamp: string
}

export interface DocStatusEntry {
  state: 'current' | 'stale' | 'pending' | 'unknown'
  lastVerifiedCommit?: string
  contentHash?: string
  lastUpdated?: string
  staleReason?: string
}

/** doc-status.json: top-level repo (optional branch later); rest are doc path -> DocStatusEntry */
export type DocStatus = Record<string, DocStatusEntry | string> & {
  repo?: string
  branch?: string
}

export interface DashboardData {
  docStatus: DocStatus
  changeSummaries: ChangeSummary[]
  docUpdates: DocUpdate[]
  loadErrors: string[]
}
