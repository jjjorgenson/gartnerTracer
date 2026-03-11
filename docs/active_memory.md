# Active memory (session context)

Context saved so the project can continue in a new chat. **Main repo path:** `/Users/jasonjorgenson/Gauntlet/gartnerTracer`. Always open this folder in Cursor (not a worktree) to avoid path/apply bugs.

---

## Worktree vs main

- **Main repo:** `/Users/jasonjorgenson/Gauntlet/gartnerTracer` — use this as the workspace.
- **Worktree (kok):** `/Users/jasonjorgenson/.cursor/worktrees/gartnerTracer/kok`. Changes were merged into main via: commit in worktree on branch `worktree-sync`, then `git merge worktree-sync` from main. You can remove the worktree with `git worktree remove <path>` (or `--force`) from main if desired.
- **Cursor bug:** "Apply worktree to current branch" fails with EROFS (writes to `/Gauntlet/...`). Use the git-merge flow above instead of the UI apply.

---

## What's in the repo

### Auto-wiki (done)

- **`tracer-v0.1/adapters/github-wiki.js`** — GitHub Wiki adapter: read, write, list, getHistory, readSidebar, writeSidebar, writeWithSidebar. Uses git clone/push; auth via `GITHUB_TOKEN` in URL.
- **`tracer-v0.1/adapters/sidebar.js`** — _Sidebar.md generation/parse: generateSidebar, parseSidebar, addPageToStructure, loadWikiStructure, saveWikiStructure.
- **Manifest:** `type: github-wiki` supported; `resolveTargets` returns `docTypeByDoc` Map.
- **Delivery:** `commit` strategy for github-wiki pushes via adapter; `deliverToWiki()`; doc-status key for wiki pages: `wiki:Page-Slug`.
- **CLI:** Loads doc by type (repo vs github-wiki); passes `docTypeByDoc` and `commitContext` to delivery.
- **accept-reject:** Accept pushes to wiki when target is wiki (heuristic: `wiki:` prefix or page-slug pattern).
- **Tests:** `github-wiki.test.js`, `sidebar.test.js`, `delivery.test.js`; manifest tests for docTypeByDoc. All 61 tests pass.
- **Dependency:** `diff` (npm) for unified diff in artifacts.

### Docs layout

- **`docs/`** — PRD.md, Prd2gpt.md, TRD.md, Dashboard-Plan.md, AutoDocs-UI-Reference.md. Root also has PRD.md; Prd2gpt and TRD live in docs/.

---

## Web UI / v1 launch (not finished)

Plan: **Web UI and v1 Launch** (see `.cursor/plans/` for full plan).

### Done

- **`tracer-v0.1/artifacts.js`** — Module with: `writeChangeSummary`, `writeDocUpdate`, `buildChangeSummary`, `buildDocUpdate`, `contentHash`, `createUnifiedDiff` (uses `diff`). Ensures `.tracer/change-summaries/` and `.tracer/doc-updates/` dirs. **Wired:** cli.js and delivery.js now write ChangeSummary and DocUpdate on each run.
- **Part A (artifact wiring):**  
  - **cli.js**: After delivery, builds ChangeSummary (git context from `getGitContext()` or GITHUB_EVENT_PATH, changedFiles, docsAffected with updateId, provenance, markdownBody) and calls `writeChangeSummary`. Exits with **code 4** on delivery failure.  
  - **delivery.js**: Builds DocUpdate (currentHash, suggestedHash, diffFromCurrent, provenance, deliveryStatus, deliveryRef), calls `writeDocUpdate`, returns `{ docUpdateId, deliveryFailed, deliveryRef? }`. `deliverSuggestion(matchedDocs, content, docPath, docContent, strategy, opts)` now takes docPath and docContent.  
  - **doc-status.json**: TRD §6 shape — per-doc keys with `state`, `lastVerifiedCommit`, `contentHash`, `lastUpdated`; top-level `repo`. Backward-compat read for legacy `docs: {}`.  
  - **accept-reject.js**: Reads/writes doc-status with TRD §6; accept sets `state: 'current'`, `contentHash` from accepted content.

### Dashboard (Part B) — done (Phases 1–4)

- **Phase 1:** `dashboard/` (Vite + React + TS + Tailwind), dark theme, Layout + Sidebar (responsive), data loader + types, Dashboard page (metric cards, Recent Activity, Quick Actions, empty state, loading/error), mock data in `public/dashboard-data/`, Sync = refetch.
- **Phase 2:** Timeline, Agent Log (pagination 50), single-commit drill-down (`/timeline/commit/:hash`), deep links (`?id=`, `?commit=`), DiffView (+/- lines), deliveryRef as "View comment" link.
- **Phase 3:** Docs page (doc-status list, sort by path/lastUpdated/state, wiki keys, "Open in repo"), Settings placeholder (read-only).
- **Phase 4:** `.github/workflows/dashboard.yml` (build on push to main; prepare-dashboard-data if `.tracer` exists), `dashboard/scripts/prepare-dashboard-data.mjs` (copy .tracer → dashboard-data + manifest.json), [docs/dashboard-data-contract.md](docs/dashboard-data-contract.md).

### Not done / on deck

1. **Optional (agent):** Process all matched docs in cli (loop over matchedDocs, not just [0]); STALE detection (separate follow-up).
2. **GitHub integration (dashboard):** Not built yet. Current state: agent runs in GitHub Actions (GITHUB_* env), workflow copies `.tracer` → dashboard-data and builds. **Missing:** Connect Repo (GitHub App install), multi-repo, backend for OAuth/webhook ingest, Settings persistence, Full Resync from UI — these are **Phase 5–7** in Dashboard-Plan.md and require a backend.
3. **Epics/stories on deck (from Dashboard-Plan + TRD §18):**
   - **Phase 5:** Connect Repo + Multi-repo (GitHub App, repo picker, backend webhook ingest).
   - **Phase 6:** Full Resync (workflow_dispatch) + Settings editing (persist via backend or PR).
   - **Phase 7:** Search, Live (polling/WebSocket), GitHub commit/PR links, polish.
   - **TRD Epic 3:** Collection Hooks (Cursor/Claude/OpenClaw, span JSONL, `tracer hooks install`).
   - **TRD Epic 4:** `tracer report`, `tracer status`, `tracer sync` (dashboard partially done).
   - **TRD Epic 5:** Dogfood (mopac-software), demo script, README/getting started.
4. **Deploy:** Workflow uploads `dashboard/dist` as Pages artifact; enable GitHub Pages (Settings → Pages → "GitHub Actions") to publish. Optional: set `VITE_BASE_PATH` if hosting at a repo subpath.

### Data contract (dashboard)

Dashboard expects:

- `dashboard-data/doc-status.json` (or fetch from that path).
- `dashboard-data/change-summaries/*.json` — ChangeSummary schema + prNumber?, branch?, repo?, schemaVersion: 1.
- `dashboard-data/doc-updates/*.json` — DocUpdate schema.

Agent now writes ChangeSummary and DocUpdate to `.tracer/`; CI or a copy step can populate dashboard-data for the static dashboard.

---

## Useful references

- **TRD** — docs/TRD.md (schemas §3.2 DocUpdate, §3.3 ChangeSummary, §6 doc-status, §8 artifact paths).
- **Dashboard-Plan** — docs/Dashboard-Plan.md (phases, data sources, API ideas).
- **Auto-wiki plan** — .cursor/plans/ (auto-wiki via GitHub Wiki) for sidebar, version history, dashboard wiki view later.

---

*Last updated: Dashboard (Part B) Phases 1–4 implemented. Optional: multi-doc loop, STALE detection.*
