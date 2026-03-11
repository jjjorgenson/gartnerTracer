# AutoDocs

**AI-powered documentation agent and audit trail.** AutoDocs automatically generates documentation updates and structured change summaries from code diffs and AI pipeline output — reducing manual doc work and making AI workflows auditable.

---

## What it does

- **Doc update agent** — On commit or PR, reads your diff and a code→doc manifest, calls an AI provider to suggest doc updates, and delivers them (PR comment, commit to branch, or wiki) for human review.
- **Change summaries** — Each run produces a structured summary: what changed, which docs were affected, provenance (model, cost), and a markdown narrative.
- **AI usage collection** — Hooks for Cursor, Claude Code, and OpenClaw write usage spans to a local log; `tracer report` and the dashboard show token/cost breakdowns.
- **Dashboard** — Read-only web UI: timeline of changes, agent log, doc status, and (with optional backend) connect repos via GitHub, switch repos, and manage connected repos.

---

## How it works

1. **Manifest** — A `tracer.manifest.yaml` (or `.yaml`) maps code globs to doc targets (repo files or GitHub Wiki). Each mapping can use strategy `suggest`, `pr-comment`, or `commit`.
2. **Trigger** — Run the agent locally (`tracer agent`) or in CI (e.g. GitHub Action). The agent uses the diff (or `--diff`, `--since`), resolves affected docs from the manifest, calls the AI provider, and writes a suggested update plus a change summary and doc-update artifact under `.tracer/`.
3. **Delivery** — Depending on strategy, the suggestion is written to `.tracer/suggestions/`, posted as a PR comment, or committed to the branch. You **accept** or **reject** via `tracer accept` / `tracer reject` (updates doc-status and optionally the doc or wiki).
4. **Dashboard** — Static build reads JSON from `dashboard-data/` (or from an optional backend when `VITE_API_BASE` is set). CI can copy `.tracer/` into `dashboard-data/` and build the dashboard; with the backend, you log in with GitHub, connect repos via the GitHub App, and view data from the API.

---

## Repository layout

| Path | Description |
|------|-------------|
| **`tracer-v0.1/`** | Core agent and CLI: manifest resolution, AI calls, delivery (repo + GitHub Wiki), accept/reject, hooks install, report, status, sync. Entry: `node tracer-v0.1/cli.js` or `tracer` if linked. |
| **`dashboard/`** | React + TypeScript + Vite dashboard: timeline, agent log, docs page, settings. Uses static `dashboard-data/` or backend API when configured. |
| **`backend/`** | Optional Node server: GitHub OAuth, session, GitHub App install callback, per-user repos, API for repo list and repo data (manifest, doc-status, change-summaries, doc-updates). |
| **`docs/`** | PRD, TRD, dashboard plan, data contract, active memory. |
| **`.github/workflows/`** | Example: build dashboard on push to main, upload Pages artifact. |

---

## Install and run

### Prerequisites

- **Node.js** 18+
- **Git**
- For AI doc generation: **Anthropic API key** (`ANTHROPIC_API_KEY`)
- For GitHub (PR comments, wiki, App): **GitHub token** or **GitHub App** credentials

### 1. Clone and install

```bash
git clone https://github.com/jjjorgenson/gartnerTracer.git
cd gartnerTracer
cd tracer-v0.1 && npm install && cd ..
```

### 2. Manifest

Create a `tracer.manifest.yaml` in your repo (or pass `-m path/to/manifest`). Example:

```yaml
version: 1
mappings:
  - code:
      paths: ["src/**/*.ts"]
    docs:
      - path: "docs/API.md"
        type: repo
    strategy: suggest
```

See [PRD.md](PRD.md) and [docs/](docs/) for full manifest and TRD schemas.

### 3. Run the agent

```bash
# From repo root (where the manifest and .git live)
node tracer-v0.1/cli.js agent

# Or with options
node tracer-v0.1/cli.js agent -m tracer.manifest.yaml --since HEAD~1
```

Output and artifacts go under `.tracer/` (change-summaries, doc-updates, doc-status, suggestions).

### 4. Accept or reject a suggestion

```bash
node tracer-v0.1/cli.js accept <doc-update-id>
node tracer-v0.1/cli.js reject <doc-update-id>
```

### 5. Hooks (optional)

Install tool hooks so usage spans are written for Cursor, Claude Code, or OpenClaw:

```bash
node tracer-v0.1/cli.js hooks install
node tracer-v0.1/cli.js hooks status
```

### 6. Report and status

```bash
node tracer-v0.1/cli.js report --since 7d
node tracer-v0.1/cli.js status
node tracer-v0.1/cli.js sync   # sync .tracer to a remote or backup path
```

### 7. Dashboard (static)

```bash
# Optional: copy .tracer into dashboard data (e.g. after a run)
node dashboard/scripts/prepare-dashboard-data.mjs tracer-v0.1/.tracer

cd dashboard && npm install && npm run build
# Serve dashboard/dist (e.g. npx serve dashboard/dist) or use GitHub Pages.
```

Open the app; it will read from `dashboard-data/` (or set `VITE_API_BASE` to point to the backend for API mode).

### 8. Backend (optional, for “Connect Repo” and API data)

For GitHub login and repo-backed dashboard data:

```bash
cd backend && npm install
# Set env: GITHUB_APP_ID, GITHUB_APP_CLIENT_ID, GITHUB_APP_PRIVATE_KEY (or OAuth client),
# SESSION_SECRET, DASHBOARD_ORIGIN (e.g. http://localhost:5174)
node server.js
```

Dashboard: set `VITE_API_BASE=http://localhost:3002` (or your backend URL), then run the dashboard dev server; use “Log in with GitHub” and “Connect Repo” to add repos.

---

## CI (GitHub Actions)

The repo includes `.github/workflows/dashboard.yml`: on push to `main`, it optionally prepares dashboard data from `.tracer`, builds the dashboard, and uploads the artifact for GitHub Pages. Enable Pages in repo Settings → Pages → “GitHub Actions”. To run the agent in CI, add a step that runs `node tracer-v0.1/cli.js agent` with the right manifest and env (e.g. `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`).

---

## Docs and references

- **[PRD.md](PRD.md)** — Product vision, goals, scope, user flows, manifest format.
- **[docs/](docs/)** — TRD (schemas), dashboard plan, dashboard data contract, active memory.
- **[dashboard/README.md](dashboard/README.md)** — Dashboard dev setup (Vite, React, Tailwind).

---

## License

See [LICENSE](LICENSE) if present; otherwise all rights reserved.
