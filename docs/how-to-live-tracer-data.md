# How to get live (real) .tracer data

The example workflow uses **mock** data from gartnerTracer’s `dashboard-data`. To get **live** data (real change summaries and doc updates from your repo), the tracer **agent** must run against your repo and write `.tracer/`.

## What produces .tracer

The tracer **agent** (in gartnerTracer’s `tracer-v0.1/`) does:

1. Reads a **manifest** (`tracer.manifest.yaml`) that maps code paths → doc paths.
2. Gets a **diff** (e.g. `git diff`, or a saved diff file from CI).
3. Resolves which docs are affected, calls the AI, and writes:
   - `.tracer/change-summaries/*.json`
   - `.tracer/doc-updates/*.json`
   - `.tracer/doc-status.json`
   - `.tracer/suggestions/` (for suggest strategy)

So “live” data = run the agent in (or against) the repo you’re tracking, then ingest that `.tracer/` with `post-tracer-ingest.mjs`.

## Option A: Run the agent inside the connected repo

1. **Add a manifest** in that repo, e.g. `tracer.manifest.yaml` at repo root:

   ```yaml
   version: "0.1"
   mappings:
     - code:
         paths: ["strategies/**/*.py", "evaluation/**/*.py"]
       docs:
         - path: "docs/README.md"
           type: repo
     - code:
         paths: ["README.md", "docs/**/*.md"]
       docs:
         - path: "docs/overview.md"
           type: repo
     strategy: suggest
   ```

   Adjust `paths` and `docs` to match your repo (code that changes → docs that should be updated).

2. **In that repo**, add a workflow that:
   - Checkouts the repo.
   - Checkouts gartnerTracer (to get `tracer-v0.1/` and `scripts/post-tracer-ingest.mjs`).
   - Installs deps in `gartnerTracer/tracer-v0.1` (`npm install`).
   - Builds a diff (e.g. last commit: `git diff HEAD~1 HEAD > pr.diff`, or for push to main: `git diff ${{ github.event.before }} HEAD > pr.diff` if available; or `git diff origin/main...HEAD > pr.diff` for PRs).
   - Runs the agent from the **repo’s** working directory so the manifest and paths resolve:
     - `TRACER_PROVIDER_API_KEY` from secrets (Anthropic API key)
     - `TRACER_OUTPUT_DIR` set to e.g. `.tracer` in the repo
     - `node gartnerTracer/tracer-v0.1/cli.js -m tracer.manifest.yaml -d pr.diff`
   - If the agent produced `.tracer/`, run ingest:
     - `node gartnerTracer/scripts/post-tracer-ingest.mjs --source .tracer --repo ${{ github.repository }} --url $AUTODOCS_INGEST_URL`
   - Use the same `AUTODOCS_INGEST_URL` and `AUTODOCS_WEBHOOK_SECRET` as in the example workflow.

3. **Secrets** in that repo:
   - `AUTODOCS_INGEST_URL` – backend base URL
   - `AUTODOCS_WEBHOOK_SECRET` – same as backend `WEBHOOK_SHARED_SECRET`
   - `TRACER_PROVIDER_API_KEY` – Anthropic API key (for the agent)

## Option B: Run the agent from gartnerTracer (one runner for many repos)

A single workflow in **gartnerTracer** can:

1. Clone the **target** repo into a subdir.
2. Copy (or fetch) a manifest for that repo into the clone.
3. Generate a diff in the clone (e.g. `git diff origin/main...HEAD > pr.diff`).
4. Run the tracer agent from gartnerTracer’s `tracer-v0.1/` with `-m path/to/clone/tracer.manifest.yaml -d path/to/clone/pr.diff`, and set `TRACER_OUTPUT_DIR` to a directory you then pass to the ingest script.
5. Run `post-tracer-ingest.mjs` with `--source <that dir>` and `--repo <owner>/<repo>` (e.g. the clone’s `github.repository` or a matrix value).

This way one CI job (and one API key) can feed multiple connected repos; the downside is manifest and diff logic must be per-repo (e.g. a small script or matrix).

## Summary

| Goal              | Approach                                                                 |
|-------------------|--------------------------------------------------------------------------|
| Mock data (testing)| Use example workflow as-is (source = gartnerTracer dashboard-data).     |
| Live data (one repo) | Add manifest + workflow in that repo; run agent then ingest (Option A). |
| Live data (many repos) | One workflow in gartnerTracer that clones each repo, runs agent, ingests (Option B). |

Agent requirements: `TRACER_PROVIDER_API_KEY` (Anthropic), a manifest, and a diff. In CI it writes to `.tracer` in cwd (or `TRACER_OUTPUT_DIR`). Then point `post-tracer-ingest.mjs --source` at that directory and `--repo owner/repo` at the repo you’re tracking.
