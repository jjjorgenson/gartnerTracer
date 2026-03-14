# AutoDocs

**AI-powered documentation agent and audit trail.** AutoDocs automatically generates documentation updates and structured change summaries from code diffs and AI pipeline output — reducing manual doc work and making AI workflows auditable.

**Default dashboard:** [https://gartner-tracer.vercel.app/](https://gartner-tracer.vercel.app/)

---

## What it does

- **Doc update agent** — On commit or PR, reads your diff and a code→doc manifest, calls an AI provider to suggest doc updates, and delivers them (PR comment, commit to branch, or wiki) for human review.
- **Change summaries** — Each run produces a structured summary: what changed, which docs were affected, provenance (model, cost), and a markdown narrative.
- **AI usage collection** — Hooks for Cursor, Claude Code, and OpenClaw write usage spans to a local log; `tracer report` and the dashboard show token/cost breakdowns.
- **Dashboard** — Read-only web UI: timeline of changes, agent log, doc status, and (with optional backend) sign in with GitHub, pick app-accessible repos to connect, switch repos, and manage connected repos.

---

## How it works

1. **Manifest** — A `tracer.manifest.yaml` (or `.yaml`) maps code globs to doc targets (repo files or GitHub Wiki). Each mapping can use strategy `suggest`, `pr-comment`, or `commit`.
2. **Trigger** — Run the agent locally (`tracer agent`) or in CI (e.g. GitHub Action). The agent uses the diff (or `--diff`, `--since`), resolves affected docs from the manifest, calls the AI provider, and writes a suggested update plus a change summary and doc-update artifact under `.tracer/`.
3. **Delivery** — Depending on strategy, the suggestion is written to `.tracer/suggestions/`, posted as a PR comment, or committed to the branch. You **accept** or **reject** via `tracer accept` / `tracer reject` (updates doc-status and optionally the doc or wiki).
4. **Dashboard** — Static build reads JSON from `dashboard-data/` (or from an optional backend when `VITE_API_BASE` is set). CI can copy `.tracer/` into `dashboard-data/` and build the dashboard; with the backend, you log in with GitHub, grant the GitHub App access to repos, select which repo to connect in-app, and view data from the API.

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
cp .env.example .env
# Fill in the GitHub OAuth App + GitHub App values in backend/.env
npm start
```

The backend loads `backend/.env` automatically. For local dev:

- Create a GitHub OAuth App for login.
- Create a GitHub App for repo connect/install.
- Set `VITE_API_BASE=http://localhost:3002` in `dashboard/.env`.
- Start the backend on `:3002`, then run the dashboard dev server.

End-user connect flow in API mode:

1. Sign in with GitHub.
2. Click `Connect` in the dashboard header.
3. If the repo is not already available, use `Add repo access` to update the GitHub App installation on GitHub.
4. Return to the dashboard and choose a single repo from the in-app picker.

The dashboard now keeps two separate concepts:

- **App-accessible repos**: repos the GitHub App installation can access.
- **Connected repos**: repos the current user has explicitly added to their dashboard view.

This means the app no longer auto-connects every repo visible to a GitHub App installation.

Use `backend/.env.example` for the full variable list.

### 8.1 GitHub setup (developer/operator one-time)

End users do **not** create GitHub apps or set env vars. This is the deployer/operator setup.

**OAuth App**

- Application name: `AutoDocs-gartnerTracer`
- Homepage URL: `http://localhost:5174`
- Authorization callback URL: `http://localhost:3002/api/auth/callback`

**GitHub App**

- GitHub App name: `AutoDocs-gartnerTracer`
- Homepage URL: `http://localhost:5174`
- Setup URL: `http://localhost:3002/api/auth/app-callback`
- Install scope: `Only on this account` for local/dev
- Permissions: `Contents: Read-only`, `Metadata: Read-only`

Fill these backend vars after app creation:

- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_SLUG`
- `SESSION_SECRET`
- `DASHBOARD_ORIGIN`

### 8.2 Backend deploy

For production, deploy `backend/` to any Node-capable host. The included `backend/Dockerfile` works on most container platforms.

```bash
cd backend
docker build -t autodocs-backend .
docker run --rm -p 3002:3002 --env-file .env autodocs-backend
```

Production checklist:

- Set `DASHBOARD_ORIGIN` to the deployed dashboard URL
- Set `API_BASE` to the public backend URL
- Update the OAuth callback URL to `https://<backend-host>/api/auth/callback`
- Update the GitHub App Setup URL to `https://<backend-host>/api/auth/app-callback`
- Set `VITE_API_BASE` in the dashboard build to the public backend URL
- Optionally set `WEBHOOK_SHARED_SECRET` to protect `POST /webhook/ingest`

---

## CI (GitHub Actions)

The repo includes `.github/workflows/dashboard.yml`: on push to `main`, it optionally prepares dashboard data from `.tracer`, can POST those artifacts to the backend when `AUTODOCS_INGEST_URL` is configured, builds the dashboard, and uploads the artifact for GitHub Pages.

Enable Pages in repo Settings → Pages → “GitHub Actions”.

To run the agent in CI, add a step that runs `node tracer-v0.1/cli.js agent` with the right manifest and env (e.g. `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`).

To push `.tracer/` artifacts to the backend after a run:

```bash
node scripts/post-tracer-ingest.mjs \
  --source tracer-v0.1/.tracer \
  --repo owner/repo \
  --url https://your-backend.example.com
```

The script auto-posts to `/webhook/ingest` and includes the optional `AUTODOCS_WEBHOOK_SECRET` header when that env var is present.

### Continuous auto-docing (any connected repo)

To have a **connected repo** (e.g. [instinct8](https://github.com/jjjorgenson/instinct8)) push tracer data to the backend on every push (or on demand):

1. **In that repo**, add two GitHub Actions secrets (Settings → Secrets and variables → Actions):
   - **`AUTODOCS_INGEST_URL`** = your backend base URL, e.g. `https://gartnertracer-production.up.railway.app`
   - **`AUTODOCS_WEBHOOK_SECRET`** = same value as `WEBHOOK_SHARED_SECRET` on the backend

2. **Add a workflow** that runs the ingest script. Two options:
   - **Use gartnerTracer’s script and (for testing) mock data:** checkout gartnerTracer and run `post-tracer-ingest.mjs` with `--source dashboard/public/dashboard-data` and `--repo owner/repo`. See [docs/example-ingest-workflow.yml](docs/example-ingest-workflow.yml) for a copy-paste workflow.
   - **Use real tracer output:** run the tracer agent in that repo (or in a repo that has it), write `.tracer/` (or equivalent), then run the same script with `--source path/to/.tracer` and `--repo owner/repo`. See [docs/how-to-live-tracer-data.md](docs/how-to-live-tracer-data.md) for step-by-step (manifest, diff, CI, secrets).

3. Trigger the workflow on **push to main** and/or **workflow_dispatch** so each push (or manual run) updates the dashboard for that repo.

---

## Docs and references

- **[PRD.md](PRD.md)** — Product vision, goals, scope, user flows, manifest format.
- **[docs/](docs/)** — TRD (schemas), dashboard plan, dashboard data contract, active memory.
- **[dashboard/README.md](dashboard/README.md)** — Dashboard dev setup (Vite, React, Tailwind).

---

## License

See [LICENSE](LICENSE) if present; otherwise all rights reserved.
