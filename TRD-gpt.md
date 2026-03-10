# Technical Requirements Document (TRD)

## Tracer — AI-Powered Documentation Agent & Audit Trail

**Version:** 1.0.0-draft  
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

---

## 3. Core Agent

### Input

```typescript
interface AgentInput {
  diff: string;              // Unified diff (from git or CI)
  commitMessage: string;     // Developer's commit message
  manifest: Manifest;        // Parsed tracer.manifest.yaml
  currentDocs: DocContent[]; // Full text of each affected doc
  spanContext?: SpanSummary; // Optional: recent AI usage spans for this session
}
```

### Output

```typescript
interface AgentOutput {
  docUpdates: DocUpdate[];      // One per affected doc
  changeSummary: ChangeSummary; // Structured commit summary
}

interface DocUpdate {
  docPath: string;
  suggestedContent: string;     // Full updated doc text
  diffFromCurrent: string;      // Unified diff: current → suggested
  sectionsModified: string[];   // Which sections were changed
  provenance: Provenance;
}

interface ChangeSummary {
  commitHash: string;
  commitMessage: string;
  author: string;
  timestamp: string;
  filesChanged: number;
  docsAffected: DocImpact[];    // {path, status: 'updated' | 'stale' | 'current'}
  aiUsage?: {                   // From span context, if available
    totalTokens: number;
    totalCost: number;
    modelBreakdown: Record<string, { calls: number; tokens: number; cost: number }>;
    toolBreakdown: Record<string, { calls: number; tokens: number; cost: number }>;
  };
  provenance: Provenance;       // Model/cost for generating THIS summary
}

interface Provenance {
  model: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}
```

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

---

## 4. Collection Layer (Hooks)

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

### Span Format

All hooks write the same JSONL format, one line per event:

```jsonl
{"id":"01HXYZ...","timestamp":"2026-03-09T14:32:00Z","tool":"cursor","event":"afterAgentResponse","model":"claude-sonnet-4","inputTokens":1200,"outputTokens":800,"latencyMs":3400,"sessionId":"abc123","metadata":{}}
{"id":"01HXYZ...","timestamp":"2026-03-09T14:32:01Z","tool":"cursor","event":"afterFileEdit","file":"src/api/campaigns.ts","sessionId":"abc123","metadata":{}}
```

**Location:** `~/.tracer/spans.jsonl` (user-level, not repo-level — spans cross repos).

---

## 5. Delivery Adapters

### v0.1: GitHub

```typescript
interface CodeReviewAdapter {
  postComment(prNumber: number, body: string): Promise<void>;
  postFileSuggestion(prNumber: number, file: string, suggestion: string): Promise<void>;
  commitToBranch(branch: string, file: string, content: string, message: string): Promise<void>;
}
```

The GitHub adapter uses `@octokit/rest`. Authenticated via `GITHUB_TOKEN` (available in Actions by default).

**Delivery strategies:**

| Strategy | Implementation |
|---|---|
| `pr-comment` | `POST /repos/{owner}/{repo}/issues/{pr}/comments` |
| `commit` | Commit updated doc to PR branch via Git API |
| `suggest` | Write to `.tracer/suggestions/` and comment a link |

### v0.2+: Other Platforms

The `CodeReviewAdapter` interface stays the same. Implementations for GitLab, Azure DevOps, Bitbucket are thin wrappers (~50-100 lines each) around their respective REST APIs.

---

## 6. Doc Platform Adapters

### Interface

```typescript
interface DocPlatformAdapter {
  read(ref: DocRef): Promise<string>;          // Returns doc content as markdown
  write(ref: DocRef, content: string, message: string): Promise<WriteResult>;
  list(filter?: DocFilter): Promise<DocRef[]>;
}

interface DocRef {
  type: 'repo' | 'confluence' | 'notion' | 'gitbook';
  path: string;            // For repo: file path. For wiki: page ID or path.
  metadata?: Record<string, string>;  // Space key, database ID, etc.
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

**Grouped capabilities across platforms:**

| Capability Group | Confluence | Notion | GitBook |
|---|---|---|---|
| Full page read/write | Yes | Yes (via block reconstruction) | Yes |
| Section-level update | No (full page replace) | Yes (block-level) | No (full file replace) |
| Version/conflict handling | Explicit version bump | None needed | Git merge |
| Hierarchical pages | Ancestors array | Parent page ID | TOC structure |
| Search/find page | CQL queries | Search API | Path-based |

---

## 7. CLI Interface

```
tracer agent <diff-file> [--manifest path] [--output dir]
                                Run the doc update agent on a diff

tracer hooks install <tool>     Install collection hooks (cursor | claude-code | openclaw)
tracer hooks status             Show installed hooks and collection status

tracer report [--days N]        Token/cost/doc summary from local spans
tracer report --format <fmt>    Output: table | json | markdown

tracer status                   Doc freshness from manifest (which docs are stale)

tracer init                     Create .tracer/ config + manifest template
```

---

## 8. Project Structure

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
│   │   └── types.ts            # Adapter interfaces
│   │
│   ├── hooks/
│   │   ├── cursor.py           # Cursor hook script
│   │   ├── claude-code.py      # Claude Code hook script
│   │   ├── openclaw.py         # OpenClaw hook script (from instinct8)
│   │   └── span-schema.ts      # Shared span format types
│   │
│   ├── cli/
│   │   ├── index.ts            # CLI entry point (commander)
│   │   ├── commands/           # agent, hooks, report, status, init
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

**Not a monorepo.** Single package. The previous four-package monorepo was premature. If we need to split later, we split.

---

## 9. Testing Strategy

### Spike Test (Tonight)

1. Take a real diff from mopac-software (an actual recent commit).
2. Take the corresponding doc (ARCHITECTURE.md, API.md, or README).
3. Feed to Claude via the prompt template.
4. Evaluate: would a human accept this update?
5. Iterate prompt until acceptance rate > 50%.

**This is the most important test. If the prompt doesn't produce useful output, nothing else matters.**

### Unit Tests

- Manifest parsing and glob matching
- Span JSONL read/write
- Report aggregation (sum tokens by model, by tool, by time range)
- Prompt construction (verify diff + doc + context assembled correctly)
- Change summary formatting

### Integration Tests

- Full agent flow: diff file → manifest → AI call (mocked) → doc update + summary output
- GitHub adapter: mock Octokit, verify correct API calls for each delivery strategy
- Hook installation: verify files placed correctly, hooks.json updated

### Live Validation (Dogfood)

- Ship to mopac-software team, track suggestion acceptance rate over 2 weeks
- Compare auto-generated summaries against manually written PR descriptions
- Measure: does `tracer report` output match provider billing dashboard?

---

## 10. Performance Budget

| Operation | Target |
|---|---|
| Agent execution (including AI call) | < 60s per commit |
| Hook overhead per tool event | < 50ms (just writing a JSON line) |
| `tracer report` on 10k spans | < 2s |
| `tracer status` on 20 docs | < 500ms |
| `tracer init` | < 5s |

---

## 11. Security & Privacy

| Concern | Approach |
|---|---|
| **Prompt content** | Not logged by default. Only SHA-256 hash. Full logging opt-in per config. |
| **API keys** | Never touched by Tracer. CI provides tokens. Hooks don't intercept auth. |
| **Span data** | Local file by default. Sync to dashboard is opt-in. |
| **Doc content** | Passes through AI provider for update generation. Standard provider data policies apply. |

---

## 12. BMAD Epic Breakdown

### Epic 1: Spike + Foundation

- Story 1.1: **Spike the doc update prompt** on real mopac-software data (TONIGHT)
- Story 1.2: Project scaffolding (TypeScript, single package, Vitest)
- Story 1.3: Manifest parser (YAML, glob matching)
- Story 1.4: Agent core: diff + manifest + doc → AI call → DocUpdate + ChangeSummary
- Story 1.5: Anthropic adapter (messages.create, usage extraction)

### Epic 2: CI Integration + Delivery

- Story 2.1: GitHub Actions template (trigger on push/PR, run agent, post results)
- Story 2.2: GitHub delivery adapter (PR comment, commit to branch)
- Story 2.3: Change summary formatting (markdown, posted to PR)
- Story 2.4: CLI entry point (`tracer agent <diff>`)

### Epic 3: Collection Hooks

- Story 3.1: Cursor hook script + installer
- Story 3.2: Claude Code hook script + installer
- Story 3.3: OpenClaw hook script (port from instinct8)
- Story 3.4: Span JSONL schema + writer
- Story 3.5: `tracer hooks install` and `tracer hooks status` commands

### Epic 4: Reporting + Dashboard

- Story 4.1: `tracer report` CLI (read spans.jsonl, aggregate, format)
- Story 4.2: Pricing table (bundled JSON, cost estimation)
- Story 4.3: `tracer status` (doc freshness from manifest + git)
- Story 4.4: Web dashboard (read-only, shows audit trail + doc freshness + cost)

### Epic 5: Dogfood + Demo

- Story 5.1: Deploy to mopac-software (all 13 engineers)
- Story 5.2: Track suggestion acceptance rate, iterate prompt
- Story 5.3: Build Gartner demo script (< 3 min, live, full loop)
- Story 5.4: README + getting started guide

---

## 13. Open Technical Questions

1. **Prompt strategy** — Spike tonight will determine if full-doc-in-context or chunked approach works better.
2. **Cursor hook data richness** — Does `afterAgentResponse` include token counts and model info, or just the response text? Need to verify against actual hook payloads.
3. **Dashboard hosting** — Static JSON + client-side rendering? Lightweight Express server? Hosted somewhere?
4. **Span sync** — How do local span files get to the dashboard? Git commit? POST to collector? Manual export?
5. **OpenClaw hook portability** — How much of the instinct8 hook can be reused directly vs. needs adaptation for the Tracer span format?
6. **Diff size limits** — What's the practical token limit before the AI call becomes too expensive or low quality? Need spike data.

---

*Companion: [PRD.md](PRD.md). Next step: spike the doc update agent.*
