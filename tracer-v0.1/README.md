# AutoDocs v0.1

CLI and CI agent that detects code changes affecting documentation, generates suggested doc updates via an AI provider, and delivers them (suggest artifact, or PR comment). No hosted backend required.

## Commands

- **agent** (default): Run the doc-update agent (diff + manifest → AI → validate → deliver).  
  `node cli.js [-m manifest] [-d diff-file]` or `node cli.js agent ...`
- **accept** \<artifact\>: Mark a suggestion as accepted, apply content to doc files, set doc-status to CURRENT.  
  `node cli.js accept .tracer/suggestions/update_xxx.json` or `node cli.js accept update_xxx`
- **reject** \<artifact\>: Mark a suggestion as rejected; doc-status stays PENDING with rejection recorded.  
  `node cli.js reject .tracer/suggestions/update_xxx.json`

## Quick start

```bash
npm install
export TRACER_PROVIDER_API_KEY=your_anthropic_key
node cli.js -m tracer.manifest.yaml
```

With a precomputed diff (e.g. in CI):

```bash
git diff origin/main...HEAD > pr.diff
node cli.js -m tracer.manifest.yaml -d pr.diff
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TRACER_PROVIDER_API_KEY` | Yes | Anthropic API key for doc generation |
| `TRACER_OUTPUT_DIR` | No | Output directory (default: `~/.tracer` locally; repo `.tracer` in CI) |
| `TRACER_MAX_DOCS_PER_RUN` | No | Max docs to process per run (default: 10) |
| `GITHUB_TOKEN` | For pr-comment | Set automatically in GitHub Actions; needed to post PR comments |

## Manifest

Define code → documentation mappings in `tracer.manifest.yaml`.

**Legacy format:**

```yaml
version: "0.1"
mappings:
  - path: "src/**/*.js"
    docs:
      - "docs/architecture.md"
  - path: "database/schema.sql"
    docs:
      - "docs/database.md"
    strategy: suggest   # optional: suggest | pr-comment
```

**TRD format** (code.paths, docs as objects):

```yaml
version: "0.1"
mappings:
  - code:
      paths:
        - "src/**/*.js"
    docs:
      - path: "docs/architecture.md"
        type: repo
    strategy: pr-comment
```

- **Precedence** when multiple mappings match a file: exact path > narrower glob > later entry.
- At most **10 docs per run** (configurable via `TRACER_MAX_DOCS_PER_RUN`); extra are skipped with a warning.

## Delivery strategies

- **suggest** (default): Write suggestion to `.tracer/suggestions/` and update `.tracer/doc-status.json`.
- **pr-comment**: In CI with `GITHUB_TOKEN`, post the suggestion as a PR comment; on failure, fall back to suggest.

Set `strategy` per mapping in the manifest.

## Output validation

Generated doc updates are validated before delivery. Output is **rejected** (not delivered) if:

- Empty or unparseable
- Larger than 2× the original document
- More than 40% content deletion
- Malformed markdown (e.g. unbalanced code fences)

Rejected outputs are appended to `.tracer/spans-rejected.jsonl` with reason and lengths (no full content).

## AI retries and exit codes

- The agent retries the Anthropic call **3 times** with exponential backoff (1s, 4s, 16s) on 429, 5xx, or timeout.
- **Exit codes:** `0` success, `1` runtime failure, `2` config/manifest/argument error, `3` AI provider failure after retries, `9` no matched docs.
- On AI failure in CI, AutoDocs posts a PR comment: *"AutoDocs: doc update failed, manual review needed."* and exits with code 3.

## Artifacts

| Path | Description |
|------|-------------|
| `.tracer/suggestions/` | Suggestion JSON files (suggest strategy) |
| `.tracer/doc-status.json` | Doc state (e.g. PENDING) |
| `.tracer/spans-rejected.jsonl` | Rejected validation records |

In CI, the workflow uploads the whole `.tracer/` directory as an artifact.

## CI (GitHub Actions)

Use the included workflow:

- **Trigger:** Pull requests to `main`
- **Steps:** Checkout, Node 20, install deps, run `node cli.js -m tracer.manifest.yaml -d pr.diff`, upload `.tracer/`
- **Fail-open:** AutoDocs failures do not block the PR (`continue-on-error: true`)

Ensure the repo has `ANTHROPIC_API_KEY` in Actions secrets. `GITHUB_TOKEN` is provided automatically for pr-comment delivery.

## Tests

```bash
npm test
```

Runs unit tests for validation rules and manifest resolution (precedence, max docs).
