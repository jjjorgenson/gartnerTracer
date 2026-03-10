# Technical Requirements Document (TRD)

## Tracer — AI-Assisted Documentation & Auditable Change Summaries

**Version:** 0.2.0-draft  
**Last Updated:** 2026-03-09  
**Status:** Pre-Development  
**Method:** BMAD  
**Companion:** [PRD.md](PRD.md)  

---

## 1. Technical Overview

Tracer is a local-first CLI tool and SDK wrapper that automates documentation generation from code changes and produces structured, auditable change summaries. It intercepts AI API calls to track token usage and cost, detects when code changes invalidate existing docs, generates suggested updates via AI, and maintains an append-only audit log of all AI interactions.

### Architecture Style

**Modular CLI + Library** — Tracer ships as both a CLI tool (`tracer`) and an importable library (`@tracer/sdk`). The CLI handles reporting, status, and configuration. The library provides SDK wrappers that intercept API calls transparently.

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────┐
│                  Developer Workflow                   │
│                                                       │
│  ┌──────────┐    ┌──────────────┐    ┌────────────┐ │
│  │ AI Tool  │───▶│ Tracer SDK   │───▶│ Provider   │ │
│  │ (Cursor, │    │ Wrapper      │    │ API        │ │
│  │  script) │    │              │    │ (Anthropic,│ │
│  └──────────┘    └──────┬───────┘    │  OpenAI)   │ │
│                         │            └────────────┘ │
│                         ▼                            │
│                  ┌──────────────┐                    │
│                  │ Audit Logger │                    │
│                  └──────┬───────┘                    │
│                         │                            │
│                         ▼                            │
│                  ┌──────────────┐                    │
│                  │ Local Store  │                    │
│                  │ (SQLite)     │                    │
│                  └──────┬───────┘                    │
│                         │                            │
│         ┌───────────────┼───────────────┐           │
│         ▼               ▼               ▼           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │ CLI Report │  │ Drift      │  │ Doc Status │   │
│  │ Engine     │  │ Detector   │  │ Tracker    │   │
│  └────────────┘  └────────────┘  └────────────┘   │
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │ Git Hooks / File Watcher (Drift Trigger)      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 2. Technology Decisions

### Runtime & Language: TypeScript (Node.js)

**Rationale:** The primary AI SDKs we're wrapping (Anthropic SDK, OpenAI SDK) are JavaScript/TypeScript. Writing Tracer in TypeScript means the wrapper layer is native — no FFI, no subprocess overhead. It also aligns with the existing mopac-software ecosystem (serverless Node.js functions, SAM templates) and the broader BMAD toolchain.

**Alternative considered:** Python. Rejected because the Anthropic/OpenAI JS SDKs are the primary targets and wrapping from Python would require a proxy architecture for JS consumers.

### Data Store: SQLite (via `better-sqlite3`)

**Rationale:** SQLite gives us a real query engine (for reports and aggregations) with zero infrastructure. Single file, portable, battle-tested. The audit log's append-only, hash-chain pattern maps cleanly to a table with indexed timestamps.

**Schema supports future migration:** If a future release needs Postgres or DynamoDB, the data model is relational and portable. SQLite is the MVP choice, not the forever choice.

**Alternative considered:** JSON files (NDJSON). Rejected because aggregation queries (sum tokens by model, cost over time range) would require full file scans. SQLite handles this natively.

**Alternative considered:** DynamoDB. Deferred to a future release that adds team aggregation and cloud sync. Overkill for single-developer local use.

### CLI Framework: `commander` + `chalk`

Lightweight, widely used, no magic. `commander` for argument parsing, `chalk` for terminal formatting. No framework overhead.

### Git Integration: `simple-git`

For programmatic git hook installation and diff analysis during drift detection.

### Package Distribution: npm

Published as a global CLI (`npm install -g @tracer/cli`) and importable library (`npm install @tracer/sdk`).

---

## 3. Data Model

### 3.1 Audit Log Entry

The core data unit. One entry per AI API call.

```sql
CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY,        -- ULID (sortable, unique)
  timestamp       TEXT NOT NULL,           -- ISO 8601
  provider        TEXT NOT NULL,           -- 'anthropic' | 'openai'
  model           TEXT NOT NULL,           -- 'claude-sonnet-4-20250514', 'gpt-4o', etc.
  input_tokens    INTEGER NOT NULL,        -- Token count: input/prompt
  output_tokens   INTEGER NOT NULL,        -- Token count: output/completion
  total_tokens    INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  estimated_cost  REAL,                    -- USD, calculated from token counts + pricing table
  latency_ms      INTEGER,                -- Wall-clock time for the API call
  prompt_hash     TEXT,                    -- SHA-256 of the prompt (not the prompt itself)
  response_hash   TEXT,                    -- SHA-256 of the response
  operation       TEXT,                    -- Optional label: 'code_gen', 'doc_update', 'review', etc.
  metadata        TEXT,                    -- JSON blob for extensibility
  prev_hash       TEXT,                    -- Hash of the previous log entry (chain integrity)
  entry_hash      TEXT NOT NULL,           -- SHA-256 of this entry's fields (tamper evidence)
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_provider ON audit_log(provider);
CREATE INDEX idx_audit_model ON audit_log(model);
```

**Hash chain:** Each entry's `entry_hash` is computed from its fields + `prev_hash`, forming an append-only chain. If any entry is modified after the fact, the chain breaks. Verification: `tracer verify`.

**ULID over UUID:** ULIDs are lexicographically sortable by timestamp, which makes range queries on the primary key efficient without needing a separate timestamp index for ordering.

### 3.2 Doc Registry

Tracks document freshness state.

```sql
CREATE TABLE doc_registry (
  id              TEXT PRIMARY KEY,        -- ULID
  doc_path        TEXT NOT NULL UNIQUE,    -- Relative path from project root
  last_verified   TEXT,                    -- ISO 8601 — last time doc was confirmed current
  status          TEXT DEFAULT 'unknown',  -- 'current' | 'stale' | 'unknown'
  staleness_reason TEXT,                   -- Which code change triggered staleness
  code_hash       TEXT,                    -- Hash of mapped code files at last verification
  updated_at      TEXT DEFAULT (datetime('now'))
);
```

### 3.3 Pricing Table

Bundled lookup table for cost estimation. Updated with each Tracer release.

```sql
CREATE TABLE pricing (
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  input_per_mtok  REAL NOT NULL,           -- USD per million input tokens
  output_per_mtok REAL NOT NULL,           -- USD per million output tokens
  effective_date  TEXT NOT NULL,
  PRIMARY KEY (provider, model, effective_date)
);
```

**Seeded on `tracer init`** with current pricing. Updated via `tracer update-pricing` (fetches from a bundled JSON, no network call required — ships with the package).

### 3.4 Change Summaries

Structured record of each commit's impact, AI usage, and doc status.

```sql
CREATE TABLE change_summaries (
  id              TEXT PRIMARY KEY,        -- ULID
  commit_hash     TEXT NOT NULL,           -- Git commit SHA
  commit_message  TEXT,                    -- Developer's commit message
  author          TEXT,                    -- Git author
  timestamp       TEXT NOT NULL,           -- ISO 8601
  files_changed   INTEGER,                -- Count of files in commit
  summary_text    TEXT NOT NULL,           -- Plain-English change description (AI-generated)
  docs_affected   TEXT,                    -- JSON array of {doc_path, status, suggestion_path}
  session_tokens  INTEGER,                -- Total tokens used in AI calls since last commit
  session_cost    REAL,                    -- Total estimated cost since last commit
  session_calls   INTEGER,                -- Number of AI API calls since last commit
  model_breakdown TEXT,                    -- JSON: {model: {calls, tokens, cost}}
  provenance      TEXT NOT NULL,           -- JSON: {model, tokens, cost} for generating this summary
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_summaries_timestamp ON change_summaries(timestamp);
CREATE INDEX idx_summaries_commit ON change_summaries(commit_hash);
```

---

## 4. Core Modules

### 4.1 SDK Wrapper (`@tracer/sdk`)

The wrapper intercepts API calls by wrapping the provider SDK client. It's a drop-in replacement.

**Usage pattern:**

```typescript
// Before: direct SDK usage
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

// After: traced SDK usage (one-line change)
import { traced } from "@tracer/sdk";
import Anthropic from "@anthropic-ai/sdk";
const client = traced(new Anthropic());

// Everything else stays the same
const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello" }],
});
// → Tracer silently logs: model, tokens, cost, latency
```

**Implementation approach:** ES Proxy wrapping. The `traced()` function returns a Proxy that intercepts method calls on the client, wraps them with timing/logging, and forwards to the real SDK. This avoids forking or monkey-patching the provider SDKs.

**Provider support matrix (MVP):**

| Provider | SDK | Wrapper Status |
|---|---|---|
| Anthropic | `@anthropic-ai/sdk` | P0 — MVP |
| OpenAI | `openai` | P0 — MVP |
| Bedrock | `@aws-sdk/client-bedrock-runtime` | Parking lot |
| Vertex AI | `@google-cloud/aiplatform` | Parking lot |

**Streaming support:** For streaming responses, the wrapper intercepts the stream, passes through all chunks to the consumer unmodified, and tallies tokens from the final `usage` event (both Anthropic and OpenAI emit usage metadata at stream completion).

**Fail-open guarantee:** If the logging layer throws for any reason, the error is swallowed (logged to stderr in debug mode) and the API call proceeds normally. Tracer must never break the developer's workflow.

### 4.2 Audit Logger

Receives intercepted call metadata from the SDK wrapper and writes to SQLite.

**Responsibilities:**

- Compute `entry_hash` from fields + `prev_hash`
- Estimate cost using pricing table
- Generate ULID for entry ID
- Write to `audit_log` table
- Handle concurrent writes safely (SQLite WAL mode)

**Hash chain computation:**

```typescript
function computeEntryHash(entry: AuditEntry, prevHash: string): string {
  const payload = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    provider: entry.provider,
    model: entry.model,
    input_tokens: entry.input_tokens,
    output_tokens: entry.output_tokens,
    estimated_cost: entry.estimated_cost,
    prompt_hash: entry.prompt_hash,
    prev_hash: prevHash,
  });
  return createHash("sha256").update(payload).digest("hex");
}
```

### 4.3 Drift Detector

Monitors code changes and checks them against the doc registry manifest.

**Trigger:** Git post-commit hook. Predictable, low noise, catches all committed changes. File watcher (chokidar) deferred to a future release as opt-in.

**Drift detection algorithm:**

```
1. Git hook fires on commit
2. Get list of changed files from the commit
3. For each changed file:
   a. Check against tracer.manifest.yaml mappings
   b. If file matches a mapping's code.paths glob:
      - Identify the mapped doc(s)
      - Compute hash of all mapped code files
      - Compare against stored code_hash in doc_registry
      - If different: mark doc as "stale", record reason
4. Pass stale docs to Doc Generator (4.4)
5. Pass commit metadata to Change Summary Generator (4.5)
```

### 4.4 Doc Generator

The headline feature. When drift is detected, the Doc Generator reads the code diff, the current doc, and the manifest context, then calls an AI provider to produce a suggested doc update.

**Input:**

```typescript
interface DocGenRequest {
  codeDiff: string;          // Unified diff of changed files
  currentDoc: string;        // Full text of the stale doc
  manifestMapping: Mapping;  // Which code paths map to this doc
  commitMessage: string;     // Developer's commit message for intent context
  auditContext?: AuditEntry[]; // Recent AI calls from this session (if available)
}
```

**Output:**

```typescript
interface DocGenResult {
  suggestedDoc: string;      // Updated doc content
  changeSummary: string;     // Plain-English description of what changed
  diffFromCurrent: string;   // Unified diff: current doc → suggested doc
  provenance: {
    model: string;           // Which model generated this
    timestamp: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    promptHash: string;
  };
}
```

**AI prompt strategy:** The prompt is structured to produce conservative updates — it should modify only the sections of the doc affected by the code change, not rewrite the whole document. The prompt includes:

1. The full current doc (so the AI sees what already exists)
2. Only the relevant code diff (not the entire codebase)
3. The commit message (for intent)
4. An instruction to preserve the doc's existing voice, structure, and formatting

**Output location:** Suggestions are written to `.tracer/suggestions/{doc-name}-{timestamp}.md` with a YAML frontmatter block containing provenance metadata. Developers review and apply manually (copy into the real doc, or use `tracer apply <suggestion>`).

**Cost guardrails:** Doc generation uses the model specified in config (default: `claude-sonnet-4-20250514`). Large diffs are chunked to stay within context limits. If the diff exceeds a configurable threshold (default: 5000 tokens), Tracer warns and asks for confirmation before making the AI call.

### 4.5 Change Summary Generator

Produces a structured summary for every commit, regardless of whether docs were affected. This is the audit artifact that reviewers and managers care about.

**Output format (markdown):**

```markdown
## Change Summary — 2026-03-09T14:32:00Z

**Commit:** a1b2c3d — "Add rate limiting to /api/campaigns endpoint"
**Author:** jason
**Files Changed:** 4 (3 modified, 1 added)

### What Changed
- Added rate limiting middleware to the campaigns API endpoint
- New `RateLimiter` class with sliding window algorithm
- Updated API route handler to apply rate limiter
- Added unit tests for rate limiting logic

### Documentation Impact
- 📝 `docs/API.md` — **stale** (new endpoint behavior not documented)
  - Suggested update generated → `.tracer/suggestions/API-20260309T143200.md`
- ✅ `docs/ARCHITECTURE.md` — current (no affected code paths)

### AI Usage This Session
| Model | Calls | Tokens | Cost |
|---|---|---|---|
| claude-sonnet-4 | 12 | 48,200 | $0.52 |
| Total | 12 | 48,200 | $0.52 |

### Provenance
- Summary generated by: claude-sonnet-4-20250514
- Summary cost: 1,200 tokens ($0.01)
- Audit log entries: #142–#154
```

**Storage:** Change summaries are stored in SQLite (`change_summaries` table) and optionally written to `.tracer/summaries/` as markdown files for git-trackable history.

### 4.6 Report Engine

Aggregates audit log data and produces summaries.

**CLI commands:**

```bash
# Weekly summary (default: last 7 days)
tracer report
tracer report --week
tracer report --days 30

# Output formats
tracer report --format table    # Terminal table (default)
tracer report --format json     # Machine-readable
tracer report --format markdown # For pasting into docs/Slack

# Doc freshness
tracer status                   # Show all tracked docs + freshness
tracer status --stale           # Show only stale docs
```

**Report contents:**

```
╔══════════════════════════════════════════════════════╗
║  Tracer Weekly Report — 2026-03-03 to 2026-03-09    ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Total API Calls:     142                            ║
║  Total Tokens:        1,284,300                      ║
║  Estimated Cost:      $14.72                         ║
║                                                      ║
║  ┌─────────────────────┬────────┬──────────┬───────┐ ║
║  │ Model               │ Calls  │ Tokens   │ Cost  │ ║
║  ├─────────────────────┼────────┼──────────┼───────┤ ║
║  │ claude-sonnet-4      │    98  │  892,100 │ $9.41 │ ║
║  │ gpt-4o              │    31  │  310,200 │ $4.02 │ ║
║  │ claude-haiku-3.5     │    13  │   82,000 │ $1.29 │ ║
║  └─────────────────────┴────────┴──────────┴───────┘ ║
║                                                      ║
║  Top Operations by Cost:                             ║
║  1. code_gen      — $8.12 (55%)                      ║
║  2. doc_update    — $3.40 (23%)                      ║
║  3. review        — $2.10 (14%)                      ║
║                                                      ║
║  Doc Freshness: 8 current, 3 stale, 1 unknown       ║
╚══════════════════════════════════════════════════════╝
```

### 4.5 Configuration Manager

Handles `.tracer/config.yaml` and `tracer.manifest.yaml`.

**`.tracer/config.yaml`:**

```yaml
# Auto-generated by `tracer init`
version: 1
store:
  type: sqlite                    # sqlite (MVP) | postgres (future)
  path: .tracer/tracer.db

logging:
  prompt_content: false           # Never log prompt text by default
  response_content: false         # Never log response text by default
  debug: false                    # Verbose stderr logging

drift:
  trigger: git-hook               # git-hook | file-watcher | manual
  auto_suggest: false             # Trigger AI doc suggestion on drift
  suggest_provider: anthropic     # Which provider to use for suggestions
  suggest_model: claude-sonnet-4-20250514

hooks:
  post_commit: true               # Install post-commit hook
```

---

## 5. CLI Interface

### Command Reference

```
tracer init                        Initialize Tracer in current project
tracer status                      Show doc freshness for all tracked docs
tracer status --stale              Show only stale docs
tracer report                      Weekly token/cost/doc summary
tracer report --days <N>           Summary for last N days
tracer report --format <fmt>       Output format: table | json | markdown
tracer summary                     Show most recent change summary
tracer summary --last <N>          Show last N change summaries
tracer suggest <doc-path>          Manually trigger AI doc update suggestion
tracer apply <suggestion-path>     Apply a generated suggestion to the real doc
tracer verify                      Verify audit log hash chain integrity
tracer update-pricing              Refresh bundled pricing table
tracer config                      Print current configuration
tracer config set <key> <value>    Update configuration
```

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error (missing init, bad manifest) |
| 3 | Integrity error (hash chain broken) |

---

## 6. Project Structure

```
tracer/
├── packages/
│   ├── cli/                       # @tracer/cli — CLI tool
│   │   ├── src/
│   │   │   ├── commands/          # init, report, status, verify, suggest, apply
│   │   │   ├── reporters/         # table, json, markdown formatters
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── sdk/                       # @tracer/sdk — SDK wrapper library
│   │   ├── src/
│   │   │   ├── wrappers/          # anthropic.ts, openai.ts
│   │   │   ├── proxy.ts           # ES Proxy factory
│   │   │   ├── logger.ts          # Audit log writer
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── core/                      # @tracer/core — Shared types, DB, engines
│       ├── src/
│       │   ├── db.ts              # SQLite connection + migrations
│       │   ├── hash.ts            # Hash chain utilities
│       │   ├── pricing.ts         # Cost estimation
│       │   ├── manifest.ts        # Manifest parser (code→doc mappings)
│       │   ├── drift.ts           # Drift detection engine
│       │   ├── doc-generator.ts   # AI doc update generation
│       │   ├── change-summary.ts  # Structured change summary generation
│       │   ├── types.ts           # Shared TypeScript types
│       │   └── index.ts
│       └── package.json
│
├── data/
│   └── pricing.json               # Bundled pricing table
│
├── scripts/
│   └── post-commit.sh             # Git hook template
│
├── docs/
│   ├── PRD.md
│   ├── TRD.md
│   └── ARCHITECTURE.md
│
├── package.json                    # Monorepo root (npm workspaces)
├── tsconfig.json
├── tracer.manifest.yaml            # Example manifest (dogfooding)
└── .tracer/                        # Tracer's own config (dogfooding)
    ├── config.yaml
    ├── suggestions/               # Generated doc update suggestions
    └── summaries/                 # Generated change summaries (markdown)
```

**Monorepo rationale:** Three packages with clear boundaries — `sdk` has zero CLI dependencies, `cli` has zero SDK wrapper dependencies, `core` is shared. Keeps install size small for SDK consumers who don't need the CLI.

---

## 7. Testing Strategy

### Unit Tests

- Hash chain computation and verification
- Cost estimation from token counts + pricing table
- Manifest parsing and glob matching
- Report aggregation queries
- SDK Proxy interception (mock provider SDKs)
- Doc Generator prompt construction (verify diff + doc + context are assembled correctly)
- Change Summary formatting and provenance metadata

### Integration Tests

- Full flow: wrapped SDK call → audit log entry → report output
- Full flow: code change → drift detection → doc suggestion generated → change summary written
- Git hook installation and trigger
- Drift detection: modify code file → verify doc flagged stale → verify suggestion generated
- Change summary: commit → verify summary in SQLite + markdown file
- SQLite concurrent write handling

### Provider Integration Tests (require API keys)

- Wrap real Anthropic SDK, make a minimal API call, verify log entry
- Wrap real OpenAI SDK, make a minimal API call, verify log entry
- Streaming response: verify token counts match provider-reported usage
- Doc generation: provide a real code diff + doc, verify AI produces a reasonable update
- Gated behind `TRACER_TEST_ANTHROPIC_KEY` / `TRACER_TEST_OPENAI_KEY` env vars

### Test Framework

- **Vitest** for unit and integration tests
- **Target:** 80%+ line coverage on `core` and `sdk` packages
- **CI:** GitHub Actions running tests on push

---

## 8. Security & Privacy Considerations

| Concern | Approach |
|---|---|
| **Prompt content** | Never logged by default. Only a SHA-256 hash is stored. Full logging requires explicit opt-in via config. |
| **Response content** | Same as prompts — hash only by default. |
| **API keys** | Never touched by Tracer. The wrapper passes through to the underlying SDK which handles auth. |
| **Audit log access** | Local file. Permissions inherit from filesystem. No network exposure in MVP. |
| **Hash chain** | Tamper-evident, not tamper-proof. A determined actor with file access can rewrite the chain. Sufficient for "honest audit" use cases, not adversarial compliance. |

---

## 9. Performance Budget

| Operation | Target | Measurement |
|---|---|---|
| SDK wrapper overhead per API call | < 5ms (excluding the API call itself) | Benchmark: wrapped vs. direct call |
| Audit log write | < 10ms per entry | SQLite WAL mode, single writer |
| `tracer report` (1000 entries) | < 500ms | SQLite aggregation query |
| `tracer status` (20 docs) | < 200ms | File hash comparison |
| `tracer init` | < 3s | Config generation + hook install |
| Git hook execution | < 100ms | Manifest check + status update |

---

## 10. Migration & Storage Evolution Path

MVP uses SQLite. Here's how the storage layer evolves:

| Release | Store | Reason |
|---|---|---|
| v0.1 (MVP) | SQLite (local) | Zero infrastructure, single developer |
| v0.2 | SQLite + optional S3 sync | Backup audit logs, share across machines |
| v0.3 | Postgres option | Team aggregation, concurrent multi-user writes |
| v0.4+ | DynamoDB option | Fits mopac-software AWS infrastructure, serverless-native |

**Abstraction layer:** All database access goes through a `Store` interface. MVP implements `SqliteStore`. Future releases add `PostgresStore`, `DynamoStore` as drop-in replacements configured via `config.yaml`.

```typescript
interface Store {
  writeAuditEntry(entry: AuditEntry): Promise<void>;
  getAuditEntries(filter: AuditFilter): Promise<AuditEntry[]>;
  getDocStatus(docPath: string): Promise<DocStatus>;
  updateDocStatus(docPath: string, status: DocStatus): Promise<void>;
  writeChangeSummary(summary: ChangeSummary): Promise<void>;
  getChangeSummaries(filter: DateRange): Promise<ChangeSummary[]>;
  getReport(range: DateRange): Promise<ReportData>;
  verifyChain(): Promise<ChainVerification>;
}
```

---

## 11. BMAD Epic Breakdown

### Epic 1: Foundation (Core + Store)

- Story 1.1: Project scaffolding (monorepo, TypeScript config, Vitest)
- Story 1.2: SQLite store implementation (`@tracer/core`) — audit_log, doc_registry, change_summaries, pricing tables
- Story 1.3: Hash chain utilities (compute, verify)
- Story 1.4: Pricing table (bundled JSON, cost estimation)
- Story 1.5: Configuration manager (YAML parse, defaults)
- Story 1.6: Manifest parser (YAML, glob matching for code→doc mappings)

### Epic 2: SDK Wrappers + Audit Logging

- Story 2.1: ES Proxy factory for generic SDK wrapping
- Story 2.2: Anthropic SDK wrapper (messages.create, streaming)
- Story 2.3: OpenAI SDK wrapper (chat.completions.create, streaming)
- Story 2.4: Audit logger (intercept → structured entry → SQLite with hash chain)
- Story 2.5: Fail-open error handling
- Story 2.6: Integration tests with real API calls (gated)

### Epic 3: Drift Detection + Doc Generation (Primary Value)

- Story 3.1: Git hook installer (post-commit)
- Story 3.2: Drift detection algorithm (changed files → manifest lookup → doc status update)
- Story 3.3: Doc Generator — AI call with code diff + current doc → suggested update
- Story 3.4: Suggestion output with provenance metadata (YAML frontmatter)
- Story 3.5: `tracer apply <suggestion>` — apply a suggestion to the real doc
- Story 3.6: Cost guardrails (large diff warning, confirmation prompt)

### Epic 4: Change Summary Generator

- Story 4.1: Post-commit summary generation (commit metadata + AI session data + doc impact)
- Story 4.2: Markdown summary output to `.tracer/summaries/`
- Story 4.3: SQLite storage for summaries (queryable history)
- Story 4.4: Summary provenance tracking (which model generated the summary, at what cost)

### Epic 5: CLI — Reporting & Status

- Story 5.1: `tracer init` command (config, manifest template, hook install)
- Story 5.2: `tracer status` — doc freshness display
- Story 5.3: `tracer report` with table formatter (weekly token/cost/doc summary)
- Story 5.4: JSON and markdown report formatters
- Story 5.5: `tracer verify` hash chain verification
- Story 5.6: `tracer config` management

### Epic 6: Dogfooding, Demo & Polish

- Story 6.1: Tracer monitors its own development (eat your own dogfood)
- Story 6.2: Demo script for Gartner audience (< 3 min, full loop)
- Story 6.3: README, getting started guide
- Story 6.4: npm publish pipeline
- Story 6.5: GitHub Actions CI (tests + lint)

---

## 12. Open Technical Questions

1. **ES Proxy depth:** Anthropic SDK nests methods (`client.messages.create`). Need to verify Proxy traps work at arbitrary depth or if we need to wrap specific known method paths.
2. **Streaming token counting:** Both Anthropic and OpenAI include `usage` in the final stream event, but behavior may differ for tool-use streams. Needs spike.
3. **SQLite in monorepo:** `better-sqlite3` has native bindings. Need to verify it works cleanly as a workspace dependency without rebuild issues.
4. **Manifest glob performance:** For large repos, glob matching on every commit could be slow. May need to cache resolved globs.
5. **ULID vs. UUID v7:** Both are time-sortable. ULID is more compact (26 chars vs. 36). Leaning ULID but open to UUID v7 if ecosystem support is better.

---

*Document generated for BMAD workflow. Companion: [PRD.md](PRD.md). Next: Epic 1 stories.*
