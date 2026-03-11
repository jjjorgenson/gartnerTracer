# Dashboard data contract

The Tracer dashboard (Phases 1–4) is a static app that reads JSON from `dashboard-data/`. No backend.

## Paths

| Path | Description |
|------|-------------|
| `dashboard-data/doc-status.json` | Doc lifecycle state (TRD §6) |
| `dashboard-data/manifest.json` | Lists `changeSummaryIds` and `docUpdateIds` so the app can fetch summaries and updates without directory listing |
| `dashboard-data/change-summaries/<id>.json` | One file per ChangeSummary (TRD §3.3) |
| `dashboard-data/doc-updates/<id>.json` | One file per DocUpdate (TRD §3.2) |

## Schemas

- **doc-status.json:** Top-level keys: `repo` (optional), `branch` (optional, v1 default to `main` or derive from latest ChangeSummary). Other keys are doc paths (or `wiki:Page-Slug`); value is `{ state, lastVerifiedCommit?, contentHash?, lastUpdated?, staleReason? }`. See TRD §6.
- **ChangeSummary:** id, commitHash, commitMessage, author, timestamp, filesChanged, docsAffected, docsUpdated, docsSkipped, provenance, markdownBody, schemaVersion, prNumber?, branch?, repo?. See TRD §3.3.
- **DocUpdate:** id, commitHash, docRef, strategy, currentHash, suggestedHash, diffFromCurrent, provenance, deliveryStatus, deliveryRef?, deliveredAt?, timestamp. See TRD §3.2.

## Source

The agent writes under `.tracer/`: `doc-status.json`, `change-summaries/*.json`, `doc-updates/*.json`. CI (or a local step) copies these into `dashboard/public/dashboard-data/` and generates `manifest.json` from the copied filenames.

**Script:** `node dashboard/scripts/prepare-dashboard-data.mjs [source-dir]`  
Default source: `.tracer`. Writes to `dashboard/public/dashboard-data/` and creates `manifest.json`.

**Branch for repo links:** doc-status may include top-level `branch`. Dashboard v1: when absent, default to `main` or derive from latest ChangeSummary.branch.

## Deploy

Build: `cd dashboard && npm ci && npm run build`. Output: `dashboard/dist/`. For GitHub Pages at a subpath, set `VITE_BASE_PATH=/repo-name/` when building.
