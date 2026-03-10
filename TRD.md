# Technical Requirements Document (TRD)

## Tracer — AI-Powered Documentation Agent & Audit Trail

**Version:** 2.0.0  
**Last Updated:** 2026-03-09  
**Status:** Pre-Development  
**Method:** BMAD  
**Companion:** [PRD.md](PRD.md)  

---

## 1. Technical Overview

Tracer is three things:

1. **A doc update agent** — a CLI that takes a code diff + manifest + existing doc, calls an AI provider, and produces a suggested doc update with provenance metadata.
2. **A collection layer** — tool-native hooks (Cursor, Claude Code, OpenClaw) that write structured spans to a local log.
3. **A reporting surface** — CLI + web dashboard that aggregates spans and change summaries into audit trails and cost reports.

The agent is a portable CLI/container that any CI system can invoke. It does not know or care about GitHub vs. GitLab vs. Azure. Thin CI templates handle the platform-specific triggering and result delivery.

### Architecture

```
LOCAL (per developer)                    CI (per commit/PR)
─────────────────────                    ───────────────────

Cursor hooks.json ──┐                   Git push / PR opened
Claude Code hooks ──┼→ spans.jsonl        │
OpenClaw hook ──────┘   (local file)      ▼
                                        ┌──────────────────┐
        ┌───────────────────────────────│  CI Runner        │
        │  (optional: sync spans to     │  (GitHub Actions) │
        │   dashboard collector)        └────────┬─────────┘
        ▼                                        │
┌──────────────┐                        ┌────────▼─────────┐
│ Web Dashboard│◀── reads ──────────────│  tracer agent     │
│ (audit trail,│                        │                   │
│  doc status, │                        │  1. read diff     │
│  cost report)│                        │  2. read manifest │
└──────────────┘                        │  3. read current  │
                                        │     doc           │
┌──────────────┐                        │  4. call AI       │
│ tracer report│                        │  5. produce:      │
│ (CLI)        │◀── reads spans.jsonl   │     - doc update  │
└──────────────┘                        │     - change      │
                                        │       summary     │
                                        │  6. deliver via   │
                                        │     adapter       │
                                        └──────────────────┘
```

---

## 2. Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Language** | TypeScript (Node.js) | Primary AI SDKs are JS/TS. Aligns with mopac-software ecosystem. Runs in any CI. |
| **Agent packaging** | CLI (`npx tracer`) + Docker container | CLI for local use. Container for CI. Same code, two entry points. |
| **Span storage (local)** | JSONL file (`spans.jsonl`) | Append-only, zero dependencies, greppable. No SQLite for v0.1 — keep it simple. |
| **Span storage (dashboard)** | SQLite or Postgres | Dashboard needs queries. Decide at dashboard build time. |
| **CI integration** | GitHub Actions (v0.1) | Primary target. Agent is CI-agnostic; only the YAML template is platform-specific. |
| **AI Provider** | Anthropic Claude Sonnet (v0.1) | Best code understanding. Configurable — provider is an adapter interface. |

### 2.1 Execution Lifecycle

Tracer execution follows this sequence:

1. Load configuration
2. Load manifest
3. Detect git context
4. Collect changed files
5. Resolve manifest mappings
6. Load affected documentation
7. Construct AI prompts
8. Call AI provider
9. Validate generated output
10. Generate artifacts
11. Deliver suggestions
12. Update doc status
13. Write logs
14. Exit

If no documentation targets are matched, Tracer exits with code **9**.

### 2.2 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | success |
| 1 | runtime failure |
| 2 | invalid config or manifest |
| 3 | AI provider failure |
| 4 | delivery failure |
| 9 | no matched docs |

Exit code 9 allows CI systems to detect "nothing to do".

---

## 3. Canonical Schemas

All data types are defined here. No other shapes exist. If a component produces or consumes data, it uses these schemas.

### 3.1 Span (Collection Layer Output)

One span = one tool event. Written by hooks to `~/.tracer/spans.jsonl`.

```typescript
interface Span {
  // Identity
  id: string;                    // ULID — sortable, unique
  sessionId: string;             // Groups spans within one tool session
  traceId?: string;              // Optional: correlates to a CI run or commit (set retroactively)

  // Source
  tool: 'cursor' | 'claude-code' | 'openclaw' | 'sdk' | 'unknown';
  event: SpanEvent;

  // Timing
  timestamp: string;             // ISO 8601, UTC
  durationMs?: number;           // For events with measurable duration

  // AI Usage (present on response events, absent on file edits / shell)
  model?: string;                // e.g., 'claude-sonnet-4-20250514'
  provider?: string;             // 'anthropic' | 'openai'
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;        // USD, calculated from bundled pricing table

  // Context
  file?: string;                 // For file edit events: relative path
  command?: string;              // For shell events: command string
  mcpTool?: string;              // For MCP events: tool name
  promptHash?: string;           // SHA-256 of input (not content, just fingerprint)

  // Extensibility
  metadata?: Record<string, unknown>;
}

type SpanEvent =
  | 'session_start'              // beforeSubmitPrompt
  | 'thinking'                   // afterAgentThought
  | 'response'                   // afterAgentResponse — primary token carrier
  | 'file_edit'                  // afterFileEdit
  | 'shell_exec'                 // afterShellExecution
  | 'mcp_exec'                   // afterMCPExecution
  | 'session_end';               // stop
```

**Validation rules:**
- `id` must be a valid ULID.
- `timestamp` must be valid ISO 8601 UTC.
- `tool` must be a known enum value.
- `event` must be a known enum value.
- If `event` is `response`, then `model` and at least one of `inputTokens` / `outputTokens` should be present. If the hook can't extract tokens (some tools don't expose this), log a warning in metadata: `{"warning": "token_count_unavailable"}`.
- Lines that fail validation are written to `~/.tracer/spans-rejected.jsonl` with the rejection reason appended.

### 3.2 DocUpdate (Agent Output)

One doc update = one suggested change to one document.

```typescript
interface DocUpdate {
  // Identity
  id: string;                    // ULID
  commitHash: string;            // The commit that triggered this update
  triggeredBy: 'ci' | 'manual';

  // Target
  docRef: DocRef;
  strategy: 'suggest' | 'pr-comment' | 'commit';

  // Content
  currentHash: string;           // SHA-256 of the doc BEFORE update
  suggestedContent: string;      // Full text of suggested doc
  suggestedHash: string;         // SHA-256 of suggested content
  diffFromCurrent: string;       // Unified diff: current → suggested
  sectionsModified: string[];    // Heading names of modified sections

  // Provenance
  provenance: Provenance;

  // Delivery
  deliveryStatus: 'pending' | 'delivered' | 'failed' | 'accepted' | 'rejected';
  deliveryRef?: string;          // PR comment URL, commit SHA, or suggestion file path
  deliveredAt?: string;

  // Metadata
  timestamp: string;             // ISO 8601
}
```

### 3.3 ChangeSummary (Agent Output)

One change summary per agent invocation (typically per commit or PR).

```typescript
interface ChangeSummary {
  // Identity
  id: string;                    // ULID
  commitHash: string;
  commitMessage: string;
  author: string;
  timestamp: string;

  // Code changes
  filesChanged: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;

  // Doc impact
  docsAffected: DocImpact[];
  docsUpdated: number;           // Count of DocUpdates generated
  docsSkipped: number;           // Mapped docs where no update was needed

  // AI usage (from correlated spans, if available)
  aiUsage?: SessionUsage;

  // Provenance for THIS summary
  provenance: Provenance;

  // Rendered output
  markdownBody: string;          // Pre-rendered markdown for posting to PR / storing
}

interface DocImpact {
  docRef: DocRef;
  status: 'updated' | 'stale' | 'current' | 'unmapped';
  updateId?: string;             // References DocUpdate.id if update was generated
}

interface SessionUsage {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  modelBreakdown: Record<string, { calls: number; tokens: number; cost: number }>;
  toolBreakdown: Record<string, { calls: number; tokens: number; cost: number }>;
  spanIds: string[];             // Which spans contributed to this summary
}
```

### 3.4 Shared Types

```typescript
interface DocRef {
  type: 'repo' | 'confluence' | 'notion' | 'gitbook';
  path: string;                  // File path for repo, page ID for wiki
  metadata?: Record<string, string>;  // spaceKey, databaseId, etc.
}

interface Provenance {
  model: string;
  provider: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;         // USD
  promptHash: string;            // SHA-256 of the full prompt sent to AI
}

interface Manifest {
  version: 1;
  mappings: MappingEntry[];
}

interface MappingEntry {
  code: { paths: string[] };     // Glob patterns relative to repo root
  docs: DocRef[];
  strategy: 'suggest' | 'pr-comment' | 'commit';
}
```

---

## 4. Core Agent

### Prompt Strategy

The AI call is the make-or-break. The prompt must produce **conservative, section-level updates** — not full doc rewrites.

```
System: You are a documentation maintenance agent. Given a code diff and an
existing document, produce an updated version of the document that reflects
the code changes. Rules:
- Only modify sections directly affected by the code diff.
- Preserve the document's existing voice, structure, and formatting.
- If a section isn't affected by the diff, reproduce it exactly.
- Add a brief provenance comment at the bottom of each modified section.
- If you're uncertain whether a change is needed, don't make it.

User:
## Commit Message
{commitMessage}

## Code Diff
{diff}

## Current Document
{currentDoc}

## Instructions
Produce the updated document. Then produce a brief plain-English summary
of what you changed and why.
```

**Cost guardrails:** If diff exceeds 5000 tokens, chunk by file and process in parallel. Log a warning if total input exceeds 50k tokens.

**Token budget:** Tracer does not enforce a fixed global token cap. Configurable: `TRACER_MAX_PROMPT_TOKENS` (default 120k), `TRACER_DIFF_TOKEN_LIMIT` (default 20k per doc). Prompt construction: filter diff to mapped files; truncate large diffs (head/tail); reduce document context if needed; retry if over limit.

### 4.1 Diff → Document Resolution

Manifest resolution algorithm:

1. Collect changed files
2. Match files against manifest globs
3. Apply precedence rules
4. Dedupe document targets
5. Rank docs by number of contributing files
6. Process top N docs

**Mapping precedence** (when multiple mappings match a file): exact path match wins; narrower glob wins; later manifest entry overrides earlier; unresolved ties include both.

**Max fan-out:** `TRACER_MAX_DOCS_PER_RUN = 10`. If more than 10 docs match, rank by matching files, process top 10, record skipped docs in ChangeSummary warnings.

### 4.2 Output Validation

**Hard reject** (do not deliver): empty response; unparseable format; >2× original document size; >40% content deletion; malformed markdown; diff cannot be applied. Rejected outputs go to `spans-rejected.jsonl`.

**Soft warnings** (deliver but record): >5 sections modified; unusually large token usage; document rewritten instead of updated.

---

## 5. Correlation Rules

How data from different sources connects.

### 5.1 Spans → ChangeSummary

Spans are collected locally. ChangeSummaries are generated in CI. The correlation is **time-window based**, not session-ID based, because spans and CI runs don't share a session context.

```
Correlation algorithm:
1. CI agent runs on commit C at time T.
2. Agent reads manifest, generates DocUpdates and ChangeSummary.
3. If span data is available (synced to CI or dashboard):
   a. Find all spans where timestamp is between (T - 24h) and T.
   b. Filter to spans from the commit author (if author→tool mapping exists).
   c. Aggregate into SessionUsage.
   d. Attach to ChangeSummary.aiUsage.
   e. Set ChangeSummary.aiUsage.spanIds to the IDs of correlated spans.
4. If span data is NOT available:
   a. ChangeSummary.aiUsage is null.
   b. Summary still contains all doc impact and provenance data.
   c. This is the expected state for v0.1 until span sync is implemented.
```

**Key rule: ChangeSummary is valid and useful WITHOUT span correlation.** Span data enriches but is not required. The CI agent works even if no developer has hooks installed.

### 5.2 CommitHash as Primary Key

`commitHash` is the universal correlator across all schemas. Given a commit hash, you can find all DocUpdates it triggered, the ChangeSummary for that commit, and all Spans from the session window (approximate).

```
Dashboard view for a single commit:

  Commit abc123 — "Add rate limiting to campaigns API"
  ├── ChangeSummary (id: 01HXY...)
  │   ├── docsAffected: [API.md → updated, ARCHITECTURE.md → current]
  │   └── aiUsage: 48,200 tokens, $0.52 (from 12 correlated spans)
  │
  ├── DocUpdate for API.md (id: 01HXZ...)
  │   ├── diffFromCurrent: +23 lines, -4 lines
  │   ├── deliveryStatus: delivered (PR comment)
  │   └── provenance: claude-sonnet-4, 3,400 tokens, $0.04
  │
  └── Correlated Spans (12)
      ├── response: claude-sonnet-4, 8,200 tokens (cursor)
      ├── file_edit: src/api/campaigns.ts (cursor)
      ├── response: claude-sonnet-4, 12,100 tokens (cursor)
      └── ... (9 more)
```

### 5.3 DocUpdate → Delivery

```
DocUpdate.deliveryRef links to the delivered artifact:
- strategy 'pr-comment':  deliveryRef = PR comment URL
- strategy 'commit':      deliveryRef = commit SHA on PR branch
- strategy 'suggest':     deliveryRef = file path in .tracer/suggestions/
```

---

## 6. Doc Lifecycle State Machine

A document tracked in the manifest has exactly one state at any time.

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
              ┌──────────┐    code change      ┌───────┐  │
  tracer init │ UNKNOWN  │───touches mapped───▶│ STALE │  │
              └──────────┘    code paths       └───┬───┘  │
                    │                              │      │
                    │ first agent run               │      │
                    │ (no changes needed)           │      │
                    ▼                              ▼      │
              ┌──────────┐    agent generates  ┌────────┐ │
              │ CURRENT  │◀──update accepted───│PENDING │ │
              └────┬─────┘                     └───┬────┘ │
                   │                               │      │
                   │ new code change               │      │
                   │ touches mapped paths          │      │
                   │                               │      │
                   └───────────▶ STALE ◀───────────┘      │
                                  │   update rejected     │
                                  │   (stays stale)       │
                                  │                       │
                                  └───────────────────────┘
                                    next commit triggers
                                    new agent run
```

**States:**

| State | Meaning | Transition |
|---|---|---|
| `UNKNOWN` | Doc is in manifest but never evaluated. | → `CURRENT` (agent runs, no update needed) or → `STALE` (code changed) |
| `CURRENT` | Doc reflects the latest code. Hash matches. | → `STALE` (mapped code paths change) |
| `STALE` | Code changed since last doc update. | → `PENDING` (agent generates update) |
| `PENDING` | Update generated, awaiting human review. | → `CURRENT` (accepted) or → `STALE` (rejected, awaiting next cycle) |

**State transition rules:**

1. **Only the agent sets state to PENDING or CURRENT.** Humans don't edit doc-status.json directly.
2. **Only CI triggers set state to STALE.** The post-commit diff check against the manifest is the sole source of staleness.
3. **PENDING → CURRENT requires evidence.** The doc's contentHash must match the suggestedHash from the accepted DocUpdate.
4. **PENDING → STALE on rejection.** If a human discards the suggestion, the doc remains stale until the next agent cycle.

**Canonical truth:** `doc-status.json` represents canonical truth for the **default branch only**. Branch-local suggestions do not affect canonical state until merged.

**Acceptance evidence** (by strategy): **suggest** — accepted when user runs `tracer accept <artifact>`, rejected via `tracer reject <artifact>`. **pr-comment** — accepted when equivalent doc changes appear in merged branch (identical suggested hash or similarity ≥ 0.90). **commit** — accepted when documentation commit merges into default branch.

**State storage (v0.1):** `.tracer/doc-status.json` committed to repo.

```json
{
  "docs/API.md": {
    "state": "current",
    "lastVerifiedCommit": "abc123",
    "contentHash": "sha256:...",
    "lastUpdated": "2026-03-09T14:32:00Z"
  },
  "docs/ARCHITECTURE.md": {
    "state": "stale",
    "lastVerifiedCommit": "def456",
    "staleReason": "infrastructure/main.tf changed in commit ghi789",
    "contentHash": "sha256:...",
    "lastUpdated": "2026-03-07T10:00:00Z"
  }
}
```

---

## 7. Failure & Idempotency Rules

### 7.1 Agent Failures

| Failure | Behavior | Recovery |
|---|---|---|
| AI provider error (429, 500, timeout) | Retry 3x with exponential backoff (1s, 4s, 16s). If all fail: log error, doc stays STALE, post PR comment "Tracer: doc update failed, manual review needed." | Next commit retriggers. |
| AI returns unusable output (empty, malformed) | Log warning. Do NOT update doc state. Post PR comment: "Tracer: generated update was empty." | Manual review or next commit. |
| Manifest parse failure | Fatal. Agent exits code 2. CI step fails visibly. | Developer fixes manifest syntax. |
| Doc file not found at declared path | Log warning per missing doc. Continue processing others. Post PR comment listing missing docs. | Developer updates manifest or creates the doc. |
| Delivery failure (GitHub API error) | Retry 2x. If all fail: write output to `.tracer/suggestions/` as fallback. Log error. CI step succeeds (doesn't block PR). | Developer manually applies from suggestions dir. |

### 7.2 Idempotency

**Core rule: Running the agent twice on the same commit produces the same DocUpdates (content-identical, different IDs and timestamps).**

- The agent is a pure function of (diff, manifest, current doc content). Same inputs → same AI prompt → same output (modulo AI non-determinism, which we accept).
- If the agent runs twice and the doc hasn't changed, the second run's `suggestedHash` matches the first. The delivery adapter checks: if a PR comment with the same `suggestedHash` already exists, skip posting a duplicate.
- DocUpdate IDs are always new (ULIDs). Deduplication is by `suggestedHash`, not by ID.

### 7.3 Concurrency

Two PRs modify the same code paths and trigger the agent simultaneously:

- Each agent run reads the current doc from the base branch. They may produce different suggestions.
- Both suggestions post to their respective PRs. No cross-PR coordination in v0.1.
- When the first PR merges, the doc updates. The second PR's agent runs on rebase and sees the new doc. Standard git merge flow.

**Failure philosophy:** Tracer prioritizes developer workflow safety. Failures never block commits, never break developer tools, and fail open where possible.

### 7.4 Hook Failures

**Core rule: Hook failures are silent. They must never block or crash the developer's tool.**

- If the hook script throws, the tool (Cursor, Claude Code, OpenClaw) ignores it and continues.
- Failed span writes go to `~/.tracer/hook-errors.log` (not spans.jsonl).
- Missing or malformed spans are tolerable — the agent works without span data.

---

## 8. Artifact & Storage Strategy

### Where Everything Lives

```
LOCAL (developer machine)
~/.tracer/
├── config.yaml                  # User-level config (hook settings, default provider)
├── spans.jsonl                  # All tool spans, append-only
├── spans-rejected.jsonl         # Spans that failed validation
└── hook-errors.log              # Hook script errors

REPO (version controlled)
<repo-root>/
├── tracer.manifest.yaml         # Code→doc mappings
├── .tracer/
│   ├── doc-status.json          # Doc lifecycle state (committed by CI)
│   ├── change-summaries/
│   ├── doc-updates/
│   └── suggestions/             # Fallback: generated suggestions when delivery fails
│       └── API-20260309T1432.md
└── docs/                        # Actual documentation
    ├── API.md
    └── ARCHITECTURE.md

CI (ephemeral, per run)
- Agent reads diff + manifest + docs from repo
- Agent writes DocUpdates + ChangeSummary
- Delivery adapter posts to PR / commits to branch
- doc-status.json updated and committed

DASHBOARD (persistent, centralized)
- Ingests: ChangeSummaries (from CI webhook or git polling)
- Ingests: Spans (from optional sync or manual export)
- Serves: audit trail, doc freshness, cost reports
- Storage: SQLite (v0.1) or Postgres (v0.2+)
```

### Data Flow

```
[Developer machine]                  [GitHub / Git host]           [Dashboard]
       │                                    │                          │
  hooks write                          push / PR                       │
  spans.jsonl ──(opt. sync)──────────────────────────────────────────▶ │
       │                                    │                          │
       │                              CI trigger                       │
       │                                    │                          │
       │                              ┌─────▼──────┐                  │
       │                              │ tracer agent│                  │
       │                              │ (in runner) │                  │
       │                              └─────┬──────┘                  │
       │                                    │                          │
       │                          DocUpdates + ChangeSummary           │
       │                                    │                          │
       │                              ┌─────▼──────┐                  │
       │                              │ delivery    │──PR comment──▶ GitHub
       │                              │ adapter     │──commit──────▶ GitHub
       │                              └─────┬──────┘                  │
       │                                    │                          │
       │                          doc-status.json                      │
       │                          committed to repo                    │
       │                                    │                          │
       │                              ChangeSummary ──(webhook)──────▶ │
       │                                                               │
       │                                                          [Dashboard]
       │                                                          renders:
       │                                                          - audit trail
       │                                                          - doc freshness
       │                                                          - cost report
```

### Span Sync (v0.1)

v0.1 does NOT require span sync for the agent to work. Span data is local-only enrichment for `tracer report` CLI.

For the dashboard (demo), spans can be ingested via:
- **Option A (simplest):** Developer runs `tracer sync` which POSTs `spans.jsonl` to the dashboard ingest endpoint. Manual, on-demand.
- **Option B (slightly automated):** A pre-push git hook runs `tracer sync` automatically.
- **Option C (v0.2):** Background process watches `spans.jsonl` and streams new lines to dashboard.

For Gartner demo: Option A is sufficient.

### Artifact Retention

| Artifact | Limit |
|----------|-------|
| spans.jsonl | rotate at 10MB |
| rejected spans | rotate at 5MB |
| change summaries | last 200 commits |
| doc updates | last 200 commits |
| suggestions | last 200 commits |

---

## 9. CI Integration

**Required environment variables:** `TRACER_PROVIDER`, `TRACER_PROVIDER_API_KEY`, `TRACER_MANIFEST_PATH`.

**Optional:** `TRACER_MAX_DOCS_PER_RUN`, `TRACER_MAX_PROMPT_TOKENS`, `TRACER_OUTPUT_DIR`, `TRACER_DELIVERY_STRATEGY`.

**GitHub Action flow:** (1) checkout repository, (2) install tracer, (3) run `tracer agent`, (4) upload `.tracer/change-summaries`, (5) upload `.tracer/doc-updates`, (6) upload `.tracer/doc-status.json`, (7) publish dashboard artifacts.

**Dashboard data contract (v0.1):** The dashboard is static. It reads JSON artifacts only (`dashboard-data/doc-status.json`, `change-summaries/`, `reports/`). No backend service required.

---

## 10. Collection Layer (Hooks)

### Cursor

Cursor provides native hooks via `~/.cursor/hooks.json`. We write a hook script that fires on agent events and writes structured spans to `spans.jsonl`.

**Hook events we capture:**

| Hook | What We Log |
|---|---|
| `beforeSubmitPrompt` | Session start, user prompt hash |
| `afterAgentThought` | Thinking duration |
| `afterAgentResponse` | Response metadata, token usage (if available) |
| `afterFileEdit` | File path, edit type |
| `afterShellExecution` | Command, duration |
| `afterMCPExecution` | Tool name, duration |
| `stop` | Session end, total duration |

**Installation:**

```bash
tracer hooks install cursor
# → Copies hook script to ~/.cursor/hooks/tracer_hook.py
# → Creates/updates ~/.cursor/hooks.json with tracer events
```

### Claude Code

Claude Code supports hooks. Similar pattern — script fires on events, writes spans.

```bash
tracer hooks install claude-code
```

### OpenClaw

OpenClaw has hooks. Jason built the instinct8 integration as prior art. Same span output format.

```bash
tracer hooks install openclaw
```

---

## 11. Delivery Adapters

### v0.1: GitHub

```typescript
interface CodeReviewAdapter {
  postComment(prNumber: number, body: string): Promise<void>;
  postFileSuggestion(prNumber: number, file: string, suggestion: string): Promise<void>;
  commitToBranch(branch: string, file: string, content: string, message: string): Promise<void>;
}
```

GitHub adapter uses `@octokit/rest`. Authenticated via `GITHUB_TOKEN` (available in Actions by default).

| Strategy | Implementation |
|---|---|
| `pr-comment` | `POST /repos/{owner}/{repo}/issues/{pr}/comments` |
| `commit` | Commit updated doc to PR branch via Git API |
| `suggest` | Write to `.tracer/suggestions/` and comment a link |

### v0.2+: Other Platforms

The `CodeReviewAdapter` interface stays the same. Implementations for GitLab, Azure DevOps, Bitbucket are thin wrappers (~50-100 lines each) around their respective REST APIs.

---

## 12. Doc Platform Adapters

### Interface

```typescript
interface DocPlatformAdapter {
  read(ref: DocRef): Promise<string>;
  write(ref: DocRef, content: string, message: string): Promise<WriteResult>;
  list(filter?: DocFilter): Promise<DocRef[]>;
}
```

### v0.1: Repo Files

```typescript
// Read: fs.readFileSync(ref.path, 'utf-8')
// Write: git commit via simple-git or shell
// List: glob against manifest paths
```

### Wiki API Comparison (Shapes v0.2 Design)

| Operation | Confluence (v2 REST) | Notion (v1) | GitBook |
|---|---|---|---|
| **Auth** | Bearer token / OAuth 2.0 | Bearer (integration token) | Bearer token |
| **Read** | `GET /wiki/api/v2/pages/{id}` body-format=storage | `GET /v1/blocks/{id}/children` (recursive) | Git sync (pull markdown) |
| **Write** | `PUT /wiki/api/v2/pages/{id}` + version increment | `PATCH /v1/blocks/{id}` per block, or delete + recreate children | Git sync (push markdown) |
| **Content model** | Atlassian Storage Format (XHTML) | Block objects (JSON, 2000 char limit per rich text) | Markdown |
| **Versioning** | Explicit version number (must increment) | Last write wins (no versioning) | Git commits (branch/PR model) |
| **Quirk** | Must fetch current version before write | Block-level only, no full-page replace | Cleanest — it's just git |
| **Conversion need** | Markdown ↔ XHTML | Markdown ↔ Notion blocks | None (native markdown) |

**Common pattern:** `read → convert to markdown → let AI modify → convert back → write`. The adapter handles format conversion. The agent always works in markdown.

**Grouped capabilities:**

| Capability | Confluence | Notion | GitBook |
|---|---|---|---|
| Full page read/write | Yes | Yes (via block reconstruction) | Yes |
| Section-level update | No (full page replace) | Yes (block-level) | No (full file replace) |
| Version/conflict handling | Explicit version bump | None needed | Git merge |
| Hierarchical pages | Ancestors array | Parent page ID | TOC structure |
| Search/find page | CQL queries | Search API | Path-based |

---

## 13. CLI Interface

```
tracer agent <diff-file> [--manifest path] [--output dir]
                                Run the doc update agent on a diff

tracer hooks install <tool>     Install collection hooks (cursor | claude-code | openclaw)
tracer hooks status             Show installed hooks and collection status

tracer report [--days N]        Token/cost/doc summary from local spans
tracer report --format <fmt>    Output: table | json | markdown

tracer status                   Doc freshness from manifest (which docs are stale)
tracer sync                     Push local spans to dashboard collector

tracer init                     Create .tracer/ config + manifest template
```

---

## 14. Project Structure

```
tracer/
├── src/
│   ├── agent/
│   │   ├── index.ts            # Core agent: diff + manifest + doc → update + summary
│   │   ├── prompt.ts           # AI prompt construction
│   │   └── manifest.ts         # Manifest parser (YAML, glob matching)
│   │
│   ├── adapters/
│   │   ├── ai/
│   │   │   └── anthropic.ts    # AI provider adapter (v0.1)
│   │   ├── delivery/
│   │   │   └── github.ts       # PR comment / commit adapter (v0.1)
│   │   ├── docs/
│   │   │   ├── repo.ts         # Read/write repo files (v0.1)
│   │   │   ├── confluence.ts   # Confluence adapter (v0.2)
│   │   │   └── notion.ts       # Notion adapter (v0.2)
│   │   └── types.ts            # All adapter interfaces
│   │
│   ├── hooks/
│   │   ├── cursor.py           # Cursor hook script
│   │   ├── claude-code.py      # Claude Code hook script
│   │   ├── openclaw.py         # OpenClaw hook script (from instinct8)
│   │   └── span-schema.ts      # Shared span format types
│   │
│   ├── state/
│   │   ├── doc-status.ts       # Doc lifecycle state machine
│   │   └── span-reader.ts      # JSONL span reader + aggregation
│   │
│   ├── cli/
│   │   ├── index.ts            # CLI entry point (commander)
│   │   ├── commands/           # agent, hooks, report, status, sync, init
│   │   └── reporters/          # table, json, markdown formatters
│   │
│   └── dashboard/              # Web dashboard (v0.1 — demo priority)
│       └── ...                 # Static site reading from span log + summaries
│
├── ci/
│   ├── github-action.yml       # GitHub Actions template
│   ├── gitlab-ci.yml           # GitLab CI template (v0.2)
│   └── azure-pipeline.yml     # Azure Pipelines template (v0.2)
│
├── data/
│   └── pricing.json            # Bundled model pricing table
│
├── package.json
├── tsconfig.json
└── Dockerfile                  # For CI container usage
```

**Not a monorepo.** Single package. Split later if needed.

---

## 15. Testing & Validation

### Spike (Tonight)

1. Take a real diff from mopac-software (an actual recent commit).
2. Take the corresponding doc (ARCHITECTURE.md, API.md, or README).
3. Feed to Claude via the prompt template.
4. Evaluate: would a human accept this update?
5. Iterate prompt until acceptance rate > 50%.

**This is the most important test. If the prompt doesn't produce useful output, nothing else matters.**

### Unit Tests

- Manifest parsing and glob matching; mapping precedence; validation rules; artifact rotation
- Span JSONL read/write + validation (valid spans accepted, invalid → rejected file)
- Report aggregation (sum tokens by model, by tool, by time range)
- Prompt construction (verify diff + doc + context assembled correctly)
- Change summary formatting
- Doc state machine transitions (UNKNOWN→STALE→PENDING→CURRENT)
- Idempotency: same inputs → same suggestedHash

### Integration Tests

- Full agent flow: diff file → manifest → AI call (mocked) → DocUpdate + ChangeSummary with correct schemas
- PR with no matched docs (exit code 9); PR affecting >10 docs (fan-out); duplicate runs dedupe correctly; malformed AI output rejection
- GitHub adapter: mock Octokit, verify correct API calls for each delivery strategy
- Deduplication: agent runs twice, second delivery is skipped (suggestedHash match)
- Hook installation: verify files placed correctly, hooks.json updated
- Failure paths: AI timeout → retry → fallback to suggestions dir

### Live Validation (Dogfood)

Ship to mopac-software team, track over 2 weeks.

### Success Metrics

**Spike (tonight):**

| Metric | Target |
|---|---|
| Doc update quality | Human accepts ≥50% of suggestions on 5 real diffs |
| Section-level precision | Agent modifies only relevant sections ≥80% |
| No hallucinated content | Zero fabricated endpoints, parameters, or behaviors |

**Dogfood (week 1-2):**

| Metric | Target |
|---|---|
| Suggestion acceptance rate | ≥40% accepted with minor or no edits |
| Change summary usefulness | ≥60% of engineers rate 4+/5 |
| Hook adoption | ≥8 of 13 engineers install hooks |
| Agent reliability | ≤5% non-recoverable failures |
| Performance | Agent completes <60s at 95th percentile |

**Demo (Gartner):**

| Metric | Target |
|---|---|
| Live demo completes | Full loop in <3 min, no failures |
| Dashboard shows real data | ≥7 days of real team usage visible |
| Audience engagement | ≥3 follow-up conversations |

### What Failure Looks Like

- **Spike fails (suggestions unusable >50%):** Pivot to prompt research. Do not proceed to v0.1 build.
- **Dogfood acceptance <20%:** Pause features, focus entirely on prompt quality.
- **Hook adoption <4 engineers:** Collection layer has too much friction. Simplify installation.
- **Demo errors live:** Ensure demo repo has a known-good cached result as backup.

---

## 16. Performance Budget

| Operation | Target |
|---|---|
| Agent execution (including AI call) | < 60s per commit |
| Hook overhead per tool event | < 50ms (writing a JSON line) |
| `tracer report` on 10k spans | < 2s |
| `tracer status` on 20 docs | < 500ms |
| `tracer init` | < 5s |

---

## 17. Security & Privacy

Span logs must **never include**: prompt text, code diffs, or document contents. Only metadata and hashes are stored. Optional logging of prompts requires explicit config.

| Concern | Approach |
|---|---|
| **Prompt content** | Not logged by default. Only SHA-256 hash. Full logging opt-in per config. |
| **API keys** | Never touched by Tracer. CI provides tokens. Hooks don't intercept auth. |
| **Span data** | Local file by default. Sync to dashboard is opt-in. |
| **Doc content** | Passes through AI provider for update generation. Standard provider data policies apply. |

---

## 18. BMAD Epic Breakdown

### Epic 1: Spike + Foundation

- Story 1.1: **Spike the doc update prompt** on real mopac-software data (TONIGHT)
- Story 1.2: Project scaffolding (TypeScript, single package, Vitest)
- Story 1.3: Manifest parser (YAML, glob matching)
- Story 1.4: Agent core: diff + manifest + doc → AI call → DocUpdate + ChangeSummary (canonical schemas)
- Story 1.5: Anthropic adapter (messages.create, usage extraction)
- Story 1.6: Doc state machine + doc-status.json read/write

### Epic 2: CI Integration + Delivery

- Story 2.1: GitHub Actions template (trigger on push/PR, run agent, post results)
- Story 2.2: GitHub delivery adapter (PR comment, commit to branch) with dedup by suggestedHash
- Story 2.3: Change summary formatting (markdown, posted to PR)
- Story 2.4: CLI entry point (`tracer agent <diff>`)
- Story 2.5: Failure handling: retry logic, fallback to suggestions dir, error PR comments

### Epic 3: Collection Hooks

- Story 3.1: Cursor hook script + installer
- Story 3.2: Claude Code hook script + installer
- Story 3.3: OpenClaw hook script (port from instinct8)
- Story 3.4: Span JSONL writer with validation (valid → spans.jsonl, invalid → spans-rejected.jsonl)
- Story 3.5: `tracer hooks install` and `tracer hooks status` commands

### Epic 4: Reporting + Dashboard

- Story 4.1: `tracer report` CLI (read spans.jsonl, aggregate by model/tool/time, format)
- Story 4.2: Pricing table (bundled JSON, cost estimation)
- Story 4.3: `tracer status` (doc freshness from doc-status.json + manifest)
- Story 4.4: `tracer sync` (push spans to dashboard collector)
- Story 4.5: Web dashboard (read-only: audit trail, doc freshness, cost, correlated commit view)

### Epic 5: Dogfood + Demo

- Story 5.1: Deploy to mopac-software (all 13 engineers)
- Story 5.2: Track suggestion acceptance rate, iterate prompt
- Story 5.3: Build Gartner demo script (< 3 min, live, full loop)
- Story 5.4: README + getting started guide

---

## 19. Open Technical Questions

1. **Prompt strategy** — Spike tonight determines if full-doc-in-context or chunked approach works better.
2. **Cursor hook data richness** — Does `afterAgentResponse` include token counts and model info, or just response text? Verify against actual hook payloads.
3. **Dashboard hosting** — Static JSON + client-side rendering? Lightweight Express server? Hosted?
4. **Span sync transport** — HTTP POST to collector? Git commit? For v0.1 demo, manual `tracer sync` is enough.
5. **OpenClaw hook portability** — How much of instinct8 hook reuses directly vs. needs adaptation for Tracer span format?
6. **Diff size limits** — Practical token limit before AI call becomes too expensive or low quality? Need spike data.

---

*Companion: [PRD.md](PRD.md). Next step: spike the doc update agent.*
