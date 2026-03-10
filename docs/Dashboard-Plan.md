# Tracer Dashboard Plan

Plan for building the Tracer web dashboard, aligned with AutoDocs UI reference and TRD constraints. v0.1 is a **static artifact dashboard** — no backend, reads JSON only.

---

## 1. Constraints (from TRD & Prd2gpt)

| Constraint | Source |
|------------|--------|
| Data: `doc-status.json`, `change-summaries/`, `doc-updates/` | TRD §8, §9 |
| Fail-open: dashboard never blocks CI | TRD failure philosophy |

**Expanded scope:** Connect Repo (OAuth), multi-repo, Full Resync from UI, settings editing, search, and real-time Live are in scope. These may require a backend service (e.g. for OAuth, webhook installation, resync triggers, settings persistence).

---

## 2. Data Sources

The dashboard consumes artifacts produced by the CI agent and (optionally) synced spans.

| Artifact | Location | Schema | Content |
|----------|----------|--------|---------|
| `doc-status.json` | `.tracer/` | TRD §6 | Per-doc state: current/stale/pending, lastVerifiedCommit, contentHash, staleReason |
| Change summaries | `.tracer/change-summaries/` | ChangeSummary | Per-commit: id, commitHash, commitMessage, author, filesChanged, docsAffected, docsUpdated, docsSkipped, aiUsage?, provenance, markdownBody |
| Doc updates | `.tracer/doc-updates/` | DocUpdate | Per-doc: id, commitHash, docRef, strategy, suggestedContent, diffFromCurrent, sectionsModified, provenance, deliveryStatus |
| Spans (optional) | `~/.tracer/spans.jsonl` | Span | AI tool usage; v0.1 dashboard may not have span sync yet |

**CI publish flow:** GitHub Actions runs agent → uploads `.tracer/` as artifact → dashboard build step copies or references these into `dashboard-data/` for static site.

### 2.1 Schema Extensions for Dashboard

The TRD schemas need dashboard-specific fields. **Agent/CLI changes required** to emit these:

| Field | Schema | Source | Notes |
|-------|--------|--------|-------|
| `prNumber` | ChangeSummary | `GITHUB_REF` (e.g. `refs/pull/287/merge`) or `github.event.pull_request.number` in Actions | Optional; null if not a PR |
| `branch` | ChangeSummary | `GITHUB_REF` or `github.ref_name` | e.g. `main` |
| `repo` | ChangeSummary, doc-status | `GITHUB_REPOSITORY` (e.g. `owner/repo`) | Required for multi-repo |
| `repoUrl` | manifest / dashboard config | `GITHUB_SERVER_URL` + `GITHUB_REPOSITORY` | e.g. `https://github.com/owner/repo` for "open in repo" links |

**ChangeSummary:** One summary per agent run. When CI triggers on PR merge, that run = one commit (the merge commit). So "PR #287 merged" = the ChangeSummary for that merge commit. Agent should include `prNumber` when available.

**Multi-repo namespacing:** `doc-status.json` keys stay as doc paths. Add top-level `repo` field to `doc-status.json` (or use `dashboard-data/{owner}/{repo}/doc-status.json` per repo). ChangeSummary and DocUpdate already have commitHash; add `repo: "owner/repo"` to each.

### 2.2 Multi-Repo Data Flow

**Option A: Backend collector (recommended for multi-repo)**

1. Each connected repo has Tracer workflow that runs on push/PR.
2. Workflow uploads `.tracer/` as artifact, then calls a **backend webhook** with `{ repo, artifactUrl, commitHash }`.
3. Backend fetches artifact, parses JSON, stores in DB or file store keyed by `owner/repo`.
4. Dashboard API serves aggregated data: `GET /api/repos`, `GET /api/repos/:owner/:repo/data`, `GET /api/activity` (all repos).

**Option B: Per-repo artifact URLs**

1. Each repo publishes its `.tracer/` to a known location (e.g. GitHub Pages branch `tracer-data`, or S3/GCS bucket).
2. Dashboard stores list of connected repos + their data URLs.
3. Dashboard fetches from each URL at load (or backend proxies). CORS may require backend to proxy.

**Option C: Single-repo with artifact in repo**

1. One repo: workflow commits `.tracer/` to a branch or pushes to `dashboard-data/` in repo.
2. Dashboard fetches from `https://raw.githubusercontent.com/owner/repo/main/dashboard-data/` or similar.

**Recommendation:** Option A for multi-repo + Connect Repo. Option C for Phase 1–4 (single-repo, static).

### 2.3 Connect Repo & OAuth

**Use GitHub App** (not OAuth App) — better for org installs, repo-level permissions, webhook events.

**Flow:**
1. User clicks "Connect Repo" → redirect to GitHub App install URL.
2. User selects org/user, selects repos to grant access.
3. GitHub redirects back with `installation_id`. Backend stores `installation_id` + `repo` list.
4. Backend uses installation token to create `tracer-setup` PR (or direct push) with workflow file + manifest template if repo doesn't have them.
5. User merges PR (or we auto-merge with permission). Repo is now "connected."

**Data ingestion:** After connect, repo's CI runs on next push. Workflow uploads artifact and calls backend webhook (see 2.2 Option A). Backend ingests and stores.

**Permissions needed:** `contents: read/write` (for workflow file), `pull_requests: read/write` (for PR comments), `actions: read` (to check workflow runs). Optional: `workflow: write` to add workflow via API.

### 2.4 Settings Mapping & Persistence

| Setting | Agent support today | Persistence | Notes |
|---------|----------------------|-------------|-------|
| Auto-update on merge | Yes (CI trigger) | Display only | Always on when workflow exists |
| Default branch | From `GITHUB_REF` | Backend: `repos/{id}/settings.json` or manifest | Backend writes to manifest or stores; agent reads |
| Documentation style | No | Backend + agent | Agent needs `TRACER_DOC_STYLE` or prompt variant |
| Include code examples | No | Backend + agent | Agent needs prompt change |
| Wiki language | No | Backend + agent | Agent needs prompt change |
| Watched Paths | Manifest | Backend: PR to update manifest, or API | Include paths (code globs), exclude paths (ignore globs), docs output dir. Structured form → YAML. |
| Agent Behavior | Partial | Backend + agent | Auto-create pages, require review for deletions, diff depth, commit docs, max concurrent. Some need agent changes. |
| Tokens & Auth | GitHub Secrets | **Never store in dashboard** | Display: "Configured via GitHub Secrets" | Link to repo Settings → Secrets. User adds `ANTHROPIC_API_KEY` in Actions secrets. |
| Notifications | No | Defer | Slack/email on failure is future |

**Settings persistence:** Backend stores per-repo settings. When agent runs, backend injects env vars or config into workflow (e.g. via `workflow_dispatch` inputs, or a config file the workflow fetches). Or: backend opens PR to update `tracer.manifest.yaml` and `.tracer/config.json` in repo.

### 2.5 Live / Real-Time Architecture

**Source of updates:** Agent runs in CI. CI does not push to dashboard. We need a bridge.

**Flow:**
1. Workflow runs agent, uploads artifacts.
2. Workflow step: `curl -X POST https://api.tracer.com/webhook/ingest -d '{"repo":"owner/repo","commitHash":"abc","artifactUrl":"..."}'` (or backend fetches from artifact API).
3. Backend ingests, stores, broadcasts to connected WebSocket clients (or writes to a store that polling reads).
4. Dashboard: WebSocket connection to backend, or polling `GET /api/activity?since=...` every 5–10s.

**Without backend:** No true Live. Dashboard shows "last updated" from artifact mtime. User clicks Sync to refetch.

**With backend:** WebSocket for Agent Log; polling acceptable for other views.

### 2.6 Docs Page Context

**Repo URL for "open in repo":** Backend stores `repoUrl` per connected repo (from `GITHUB_SERVER_URL` + `GITHUB_REPOSITORY`). Dashboard fetches `GET /api/repos/:id` → `{ repoUrl, ... }`. Link: `${repoUrl}/blob/${branch}/${docPath}`.

**Doc content:** Option A: Include `docContent` in DocUpdate when `strategy: suggest` (we have suggestedContent). For current doc, fetch from GitHub API: `GET /repos/{owner}/{repo}/contents/{path}`. Backend proxies with installation token. Option B: Don't show content; just link to GitHub.

### 2.7 Auth & Access Control

**Who can see the dashboard?** With backend: user must be logged in (GitHub OAuth). Dashboard shows only repos the user has connected (or has access to via org).

**Who can:**
- **View:** Any user with repo access (or who connected it).
- **Connect Repo:** User must have admin on repo (to install App / add workflow).
- **Full Resync:** User with write access to repo (triggers workflow_dispatch).
- **Edit settings:** User with write access to repo (or org admin for org settings).

**Storage:** Backend stores `user_id` + `repo` + `installation_id`. No API keys in dashboard.

**Security:** OAuth tokens and installation tokens in backend only. HTTPS only. CORS restricted to dashboard origin. API keys (Anthropic) never touch dashboard; user configures in GitHub Secrets.

### 2.8 Onboarding Flow

**First-time user:**
1. Land on dashboard → "Connect your first repo" prompt.
2. Click Connect Repo → GitHub App install → select repo(s).
3. Backend creates setup PR (workflow + manifest) if repo doesn't have Tracer.
4. User merges PR. Dashboard shows "Waiting for first run" — next push triggers workflow.
5. After first run: data appears. Dashboard shows "Agent Active – watching 1 repo."

**Repo already has Tracer:** Connect Repo → backend just registers repo; no PR. Fetch existing artifacts from last workflow run (if available) or wait for next run.

### 2.9 Cost / AI Usage

**Data:** ChangeSummary has `aiUsage?: SessionUsage` (totalCalls, totalTokens, totalCost, modelBreakdown). Provenance on each DocUpdate has `inputTokens`, `outputTokens`, `estimatedCost`.

**Dashboard metrics:** Add "AI cost" card: total cost this week, or from last N ChangeSummaries. Agent Log entry: show cost per DocUpdate in expandable section.

---

## 3. Pages & Views (AutoDocs-inspired)

### 3.1 Dashboard (home)

**Purpose:** At-a-glance metrics, recent activity, quick actions.

| Section | AutoDocs | Tracer equivalent |
|---------|----------|-------------------|
| **Metric cards** | Docs updated, Pending merges, Wiki pages, Agent actions | Docs updated, Pending suggestions, Docs tracked, Agent runs, **AI cost** (this week) |
| **Recent Activity** | PR merges, agent updates, new wiki, flagged | Change summaries (commit → docs affected), DocUpdates (success/fail), flagged for review |
| **Quick Actions** | Browse Wiki, Full Resync, Agent Logs, Manage Repos | Browse Docs, Agent Log, Timeline, Settings |

**Data:** Aggregate `doc-status.json` (count current/stale/pending), `change-summaries/*.json` (last N), `doc-updates/*.json` (last N), derive metrics.

**"Full Resync" / "Manage Repos":** In scope — Full Resync triggers regeneration from UI; Manage Repos links to Connect Repo / repo management.

### 3.2 Timeline (merge timeline)

**Purpose:** Chronological view of commits/PRs and their doc impact.

| Element | AutoDocs | Tracer equivalent |
|---------|----------|-------------------|
| **Cards** | PR #N merged – description | ChangeSummary: prNumber (when available), commitHash, commitMessage, author |
| **Timeline dots** | Purple per PR | One per ChangeSummary |
| **Tags** | `dashboard-components.md updated` | `docsAffected` from ChangeSummary; docs with `updateId` or status updated/created |
| **Metadata** | Files changed, +lines -lines, branch | filesChanged, filesAdded, filesModified, filesDeleted, branch, repo from ChangeSummary |

**Data:** `change-summaries/*.json` sorted by timestamp descending. Each doc in `docsAffected` links to DocUpdate if `updateId` present. Requires schema extensions (2.1): prNumber, branch, repo.

### 3.3 Agent Log

**Purpose:** Audit trail of agent actions — what ran, what succeeded, what failed.

| Element | AutoDocs | Tracer equivalent |
|---------|----------|-------------------|
| **Entries** | Updated X, Detected merge, Failed to update X | DocUpdate entries + "merge detected" from ChangeSummary |
| **Expandable** | Diff view of doc change | `diffFromCurrent` or `sectionsModified` from DocUpdate |
| **Icons** | ✓ success, ✗ failure | `deliveryStatus`: delivered/accepted = ✓, failed/rejected = ✗ |
| **Meta** | Triggered by PR #N, N min ago | prNumber (from ChangeSummary), commitHash, timestamp, provenance, cost (from provenance.estimatedCost) |

**Data:** `doc-updates/*.json` + `change-summaries/*.json` merged into chronological feed. Each DocUpdate has `diffFromCurrent`, `sectionsModified`, `provenance`.

**"Live" badge:** In scope — real-time or near-live via polling or WebSocket.

### 3.4 Docs (browse) / Auto-Wiki

**Purpose:** List of tracked docs with their status. Optionally evolve toward an "auto-wiki" browse experience.

**v1 (Docs list):**

| Element | Data |
|---------|------|
| **List** | Keys from `doc-status.json` |
| **Status** | current / stale / pending |
| **Last verified** | lastVerifiedCommit, lastUpdated |
| **Stale reason** | staleReason when state = stale |

**Quick link:** Click doc path → open in repo. Repo URL from backend (`repoUrl` per connected repo). Link: `${repoUrl}/blob/${branch}/${docPath}`. Doc content: fetch from GitHub API via backend proxy, or link only (see 2.6).

**Auto-wiki reference (future consideration):**

- **Concept:** "Full wiki from your code, like Confluence or Notion, but automated." "Every page generated and kept up to date by the agent." "Structured documentation built from your actual codebase."
- **Left nav:** Nested hierarchy (Getting Started, API Reference, Architecture, Guides). Search wiki pages.
- **Main content:** Rendered doc, "Updated by Agent", "Last updated: X ago", version (e.g. v14 - 6 revisions). API endpoints, Event Types, Retry Policy, etc.
- **Right sidebar:** PAGE INFO (Created, Author, Words, Links to), VERSION HISTORY (v14, v13... with change descriptions), RELATED MERGES (link to PR).
- **Tracer scope:** Prd2gpt says we don't replace documentation platforms - we generate suggested updates. Docs page v1 = flat list + link to repo. Auto-wiki-style browse (hierarchical nav, version history, rendered content) could be a later phase if we add doc structure / TOC inference.

### 3.5 Settings

**Purpose:** Configure how Tracer operates across repositories. Editable from UI.

| AutoDocs | Tracer |
|----------|--------|
| Auto-update on merge | Toggle: trigger doc updates when PR merges into default branch |
| Default branch | Dropdown: branch to monitor |
| Documentation style | Dropdown: tone/format (e.g. Technical – concise) |
| Include code examples | Toggle: auto-generate code snippets from source |
| Wiki language | Dropdown: primary language for generated content |

**Sub-nav:** General, Watched Paths, Agent Behavior, Tokens & Auth, Notifications.

### 3.5.1 Watched Paths (UI reference)

- **Included paths:** Glob patterns to monitor. Tag-like chips (e.g. `src/**/*.ts`, `lib/**/*.js`) with × to remove. Add input + "Add" to create. Maps to manifest `code.paths`.
- **Excluded paths:** Patterns to ignore. Same chip UI (e.g. `node_modules/**`, `dist/**`, `**/*.test.ts`). **Manifest extension:** add `exclude` array if not present.
- **Docs output directory:** Text input (e.g. `docs/`). "Where generated documentation files are written." Default prefix for doc paths; may inform manifest `docs[].path` defaults.

### 3.5.2 Agent Behavior (UI reference)

- **Auto-create new pages** – toggle: "Create new wiki pages when the agent detects entirely new modules or features."
- **Require review for deletions** – toggle: "Flag removed sections for human review instead of auto-deleting."
- **Diff analysis depth** – dropdown: e.g. "Standard - function signatures & exports" (how deep the agent analyzes).
- **Commit docs changes** – toggle: "Auto-commit generated docs back to the repository."
- **Max concurrent updates** – number input (default 5): "Limit how many documentation pages the agent updates simultaneously."

### 3.5.3 Tokens & Auth (UI reference)

- **GitHub Personal Access Token:** "Used for repository access and webhook management. Requires repo and admin:repo_hook scopes."
- **Webhook Secret:** "Shared secret for validating incoming GitHub webhook payloads."
- **API Key:** "For external integrations and CI/CD pipelines."

**Tracer note:** We use GitHub App (not PAT) for repo access. Tokens & Auth = display only; link to GitHub Secrets. Anthropic API key lives in Actions secrets, never in dashboard.

---

## 4. In Scope (all phases)

| Feature | Notes |
|---------|-------|
| Connect Repo / OAuth | GitHub OAuth flow to authorize and connect repositories |
| Multi-repo | Support multiple repositories in one dashboard |
| Full Resync from UI | Trigger full doc regeneration from current codebase |
| Settings editing | Edit config (default branch, style, commit vs suggest, etc.) from UI |
| Search | Client-side search/filter across docs, merges, activity |
| Real-time "Live" | Live or near-live agent log (polling or WebSocket) |

---

## 5. Tech Stack

| Option | Pros | Cons |
|--------|------|------|
| **Vite + React** | Component ecosystem, fast dev, easy to add later | Heavier for static |
| **Vite + HTML/JS** | Minimal, no framework | More manual DOM |
| **Astro** | Static-first, good for content + islands | Newer, less familiar |
| **11ty** | Static, simple | Less interactive |

**Recommendation:** **Vite + React** — aligns with TRD (TypeScript Node ecosystem), good for interactive timeline/agent log, easy to add search/filters later. Build outputs static files.

**Styling:** Tailwind or similar — dark theme, orange accents (AutoDocs reference).

---

## 6. Build & Deploy

**Input:** JSON artifacts in `dashboard-data/` (or equivalent):

```
dashboard-data/
├── doc-status.json        # add top-level "repo": "owner/repo" for multi-repo
├── change-summaries/
│   ├── 01HXY....json      # add prNumber?, branch, repo
│   └── ...
├── doc-updates/
│   ├── 01HXZ....json     # add repo
│   └── ...
└── manifest.json          # repo name, repoUrl, branch, last run
```

**Multi-repo:** Use `dashboard-data/{owner}/{repo}/` per repo, or single files with `repo` field in each.

**CI flow:**

1. Agent runs, produces `.tracer/` artifacts.
2. Workflow step: copy `.tracer/doc-status.json`, `change-summaries/`, `doc-updates/` → `dashboard-data/` (or a dedicated artifact).
3. Dashboard build: `npm run build` reads from `dashboard-data/` at build time (or fetches from a known URL if artifacts are published).
4. Output: `dist/` or `build/` with static HTML/JS/CSS.

**Hosting options:**

- **Static (Phases 1–4):** GitHub Pages, Vercel, Netlify — push `dist/`, data from `dashboard-data/` or fetch at runtime.
- **With backend (Phases 5–7):** Vercel/Netlify functions, or separate Node service — for OAuth, resync trigger, settings persistence, Live updates.

---

## 7. Phases

### Phase 1: Shell + Dashboard

- [ ] Create `dashboard/` at repo root (keeps tracer-v0.1 focused on CLI/agent).
- [ ] Vite + React + TypeScript + Tailwind, dark theme.
- [ ] Layout: sidebar (Dashboard, Timeline, Agent Log, Docs, Settings), top bar (search placeholder, Sync placeholder).
- [ ] Dashboard page: 5 metric cards (docs updated, pending, tracked, agent runs, AI cost), Recent Activity list, Quick Actions.
- [ ] Empty state: no data → "Connect your first repo" or "Waiting for data" CTA.
- [ ] Branding: "Tracer" throughout (no AutoDocs references in UI).
- [ ] Footer: link to tracer.dev/docs.
- [ ] Mock data: sample `doc-status.json`, `change-summaries/`, `doc-updates/` for development.

### Phase 2: Timeline + Agent Log

- [ ] Timeline page: list ChangeSummaries by timestamp, commit message, author, docs affected, tags.
- [ ] Agent Log page: list DocUpdates + merge events, success/fail icons, expandable diff, cost in expandable.
- [ ] Wire to real schema (ChangeSummary, DocUpdate).
- [ ] Relative timestamps: "2 min ago", "Yesterday" (e.g. date-fns `formatDistance`).
- [ ] Pagination: 50 per page for Timeline and Agent Log.
- [ ] Empty state: no activity → "No activity yet" message.
- [ ] Schema graceful degradation: if prNumber, branch, repo missing (older agent), hide or show fallback; no crash.

### Phase 3: Docs + Settings (read-only placeholder)

- [ ] Docs page: list docs from doc-status.json, state, last verified, link to repo.
- [ ] Empty state: no docs in manifest → "No docs tracked" + link to Settings.
- [ ] Settings page: read-only "Configured via manifest" — placeholder until Phase 6.

### Phase 4: CI Integration

- [ ] GitHub Actions: add step to copy `.tracer/` → `dashboard-data/` (or path dashboard expects).
- [ ] Dashboard build in CI: produce static site.
- [ ] Publish to GitHub Pages (or chosen host).
- [ ] Agent: emit `schemaVersion: 1` in ChangeSummary and doc-status for future compatibility.

### Phase 5: Connect Repo + Multi-repo

- [ ] Connect Repo flow: GitHub App install, repo picker, permissions (see 2.3).
- [ ] Multi-repo support: switch repos, aggregate or per-repo views.
- [ ] Manage Repos: add repo, remove repo.
- [ ] Disconnect: confirm modal ("Remove repo? This will stop ingesting data."), stop ingest, optionally revoke App access. **Data retention:** 15 days after disconnect, then purge (see 11.1).

### Phase 6: Full Resync + Settings Editing

- [ ] Full Resync: trigger via `workflow_dispatch`; show error + retry if failed.
- [ ] Settings editing: General, Watched Paths (include/exclude paths, docs output dir), Agent Behavior (auto-create, require review for deletions, diff depth, commit docs, max concurrent), Tokens & Auth (display only).
- [ ] Persist settings: backend stores in DB; workflow fetches at run time or backend opens PR.
- [ ] Error state: resync failed → toast with retry.

### Phase 7: Search + Live + Polish

- [ ] Search/filter across docs, merges, activity.
- [ ] Real-time Live: polling or WebSocket for agent log.
- [ ] Links to GitHub commit/PR when available.
- [ ] Error state: API down → banner at top.
- [ ] Tooltips on metric cards and Settings labels.
- [ ] Accessibility, responsive layout.

---

## 8. File Structure (proposed)

```
gartnerTracer/
├── dashboard/              # at repo root
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MetricCard.tsx
│   │   │   ├── ActivityFeed.tsx
│   │   │   ├── TimelineCard.tsx
│   │   │   └── AgentLogEntry.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Timeline.tsx
│   │   │   ├── AgentLog.tsx
│   │   │   ├── Docs.tsx
│   │   │   └── Settings.tsx
│   │   ├── data/
│   │   │   └── types.ts       # ChangeSummary, DocUpdate, DocStatus
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   │   └── dashboard-data/    # or symlink; CI populates
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── tracer-v0.1/
│   └── ...
└── docs/
    ├── AutoDocs-UI-Reference.md
    ├── Dashboard-Plan.md
    ├── PRD.md
    ├── Prd2gpt.md
    └── TRD.md
```

---

## 9. Open Decisions

1. **Dashboard location:** Resolved — `dashboard/` at repo root.
2. **Backend for expanded scope:** OAuth, resync trigger, settings persistence, Live updates need a backend. Options: lightweight Node/Express, serverless (Vercel/Netlify functions), or separate service.
3. **Data at build time vs runtime:** Static (Phases 1–4): bundle or fetch at load. With backend: API serves aggregated data.
4. **Multi-repo data model:** Per-repo `dashboard-data/{owner}/{repo}/` or single store with `repo` field; structure should support both.
5. **Span integration:** When span sync exists, feed "AI usage" section. Defer until span sync is built.

---

## 10. Product Decisions (resolved)

1. **Documentation style / wiki language / code examples:** Coming soon — Settings UI built, wired to "coming soon" until agent supports.

2. **Setup PR vs manual:** Both — offer setup PR when Connect Repo is used, and also "copy workflow YAML" for users who prefer manual setup.

3. **Notifications:** No Slack or email in v1.

4. **Hosting:** Target SaaS, with self-host option. Pros/cons below.

5. **Connect Repo model:** One repo at a time (additive). User adds repos individually; can remove one-at-a-time as well. No bulk org-level "connect all."

6. **Watched Paths UI:** Recommendation: structured form (add path, add doc, save) that generates YAML. See 10.1.

### 10.1 Hosting: SaaS vs Self-Host — Pros/Cons

| | SaaS (tracer.app or similar) | Self-hosted |
|---|------------------------------|-------------|
| **Setup** | Sign up, connect repos. No infra. | Deploy backend + frontend; configure GitHub App (or use different auth); manage DB, secrets. |
| **OAuth / GitHub App** | Single App, single redirect URL. Simple. | Each deployment needs its own GitHub App (or OAuth App) — different client ID, redirect. Org may restrict which Apps can be installed. |
| **Data** | Data in our cloud. Users trust us with repo metadata + artifacts. | Data stays in user's infra. Better for air-gapped or compliance-sensitive orgs. |
| **Updates** | We ship; users get fixes/features automatically. | User pulls new images/versions; may lag behind SaaS. |
| **Cost** | We pay infra; user pays subscription (or free tier). | User pays infra (VPS, k8s, etc.). No per-seat fee to us. |
| **Multi-tenant** | Natural. One backend, many orgs. | Single-tenant per deployment. |
| **Maintenance** | We maintain. | User maintains (or we offer managed self-host). |

**Recommendation:** Ship SaaS first. Add self-host later as a Docker Compose or Helm chart — same codebase, different config (env for GitHub App credentials, DB URL). Self-host users run their own GitHub App and point dashboard at their backend.

### 10.2 Watched Paths UI — Recommendation

**Structured form** (add path, add doc, save) that generates YAML:

- **Pros:** Less error-prone than raw YAML. Validation at input time. Familiar pattern (like GitHub Actions visual editor).
- **Cons:** May not cover every manifest edge case; power users might want raw edit.

**Implementation:** Form with "Add mapping" → row: code paths (multi-input), doc paths (multi-input), strategy dropdown. "Add mapping" adds another row. Save → backend generates/updates `tracer.manifest.yaml` and opens PR (or pushes with permission). Include "Edit YAML" toggle for advanced users — shows textarea with current YAML, validate on save.

---

## 11. Remaining Considerations

### 11.1 Disconnect: What We Retain

When a user disconnects a repo, we stop ingesting new data. Stored data for that repo:

| Data | Description |
|------|--------------|
| Change summaries | Per-commit doc impact, provenance, timestamps |
| Doc updates | Suggested updates, diffs, delivery status |
| Doc-status | Per-doc state (current/stale/pending) |
| Repo metadata | installation_id, repoUrl, settings |

**Retention:** 15 days after disconnect, then purge. Allows recovery if user reconnects or disconnected by mistake. After 15 days, data is deleted; reconnecting starts fresh.

### 11.2 Resolved (folded into phases)

- Empty states, error states, branding, help/tooltips, pagination, relative timestamps, schema graceful degradation → see Phases 1, 2, 5, 6, 7.
- Docs URL: tracer.dev/docs.
