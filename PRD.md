# Product Requirements Document (PRD)

## Tracer — AI-Powered Documentation Agent & Audit Trail

**Version:** 1.0.0-draft  
**Last Updated:** 2026-03-09  
**Status:** Pre-Development (spike tonight)  
**Method:** BMAD  
**Orgs:** Mopac Software · Gauntlet AI · KellyClaude Engineering  

---

## 1. Problem Statement

Engineering teams spend significant time maintaining documentation and reviewing code changes. AI coding assistants accelerate code velocity, but docs still require manual effort — creating an ever-widening gap between what the code does and what the docs say. When multiple AI agents contribute to a codebase, there's no structured record of what was generated, by which model, or at what cost.

### Elevator Pitch

Tracer is an AI agent that automatically generates documentation updates and structured change summaries from code diffs and AI pipeline output — reducing manual review work, accelerating documentation updates, and making AI workflows auditable.

### Who Feels This Pain

Senior engineers and engineering managers at organizations scaling AI-assisted development. The pain is sharpest on platform teams managing multiple services where documentation accuracy is a prerequisite for team velocity.

---

## 2. Product Vision

> Every code change gets documented. Every AI decision gets logged. Every review gets context. Automatically.

### Key Principles

1. **Docs as a first-class output** — Documentation is a byproduct of coding, generated automatically from code changes and AI pipeline output.
2. **Structured change summaries** — Every commit produces a human-readable summary: what changed, what docs were affected, what AI calls were made, and what they cost.
3. **Audit trail by default** — Every AI interaction produces a structured, queryable log entry with token usage, model selection, and cost.
4. **Passive collection, active generation** — Hooks silently collect AI usage data. The doc agent actively produces updates on trigger events.
5. **Platform-agnostic by design** — The agent doesn't care if it's GitHub or GitLab, Confluence or Notion. Adapters handle the edges, the core logic stays portable.

### Demo Narrative (Gartner Audience)

1. *"A developer commits code written with an AI assistant."*
2. *"Tracer automatically generates an updated doc and a structured change summary."*
3. *"The reviewer opens the PR and sees exactly what changed, why, and that it cost $0.12 in AI calls."*
4. *"The engineering manager opens the dashboard and sees the team's AI usage, cost breakdown, and documentation coverage."*

Demo target: < 3 minutes, live, full loop.

---

## 3. Target Users

### Primary: Engineering Manager / Tech Lead

- Manages a team using AI coding assistants across multiple services
- Responsible for documentation quality and onboarding speed
- Needs to report AI tool ROI to leadership
- Wants structured evidence that AI adoption is helping

### Secondary: Senior / Platform Engineer

- Uses AI coding assistants daily
- Tired of manually updating docs after every AI-assisted change
- Wants reviewers to have full context without writing paragraphs in PR descriptions

---

## 4. Solution Goals

### Goal 1: Automated Documentation Updates from Code Changes

**Pain:** Docs rot faster than ever. AI tools make code change faster, but docs still require manual effort.

**Solution:** On trigger (commit, PR, CI event), Tracer reads the code diff against a manifest of code→doc mappings, calls an AI provider to generate a doc update suggestion, and delivers it via the appropriate channel (PR comment, commit, wiki update).

**Success Criteria:**

- SC-1.1: Identify affected docs within 30 seconds of trigger.
- SC-1.2: Generate a doc update suggestion with provenance (which model, when, from which diff).
- SC-1.3: Code→doc mappings are configurable via a human-readable manifest.
- SC-1.4: Doc suggestions are reviewable — never auto-merged without human approval.
- SC-1.5: **Spike validation: the AI-generated doc update is accepted by a human reviewer >50% of the time on real mopac-software diffs.** If this fails, the product doesn't work.

### Goal 2: Auditable AI Output

**Pain:** No structured record of what AI agents generated, which models were used, or what it cost.

**Solution:** Tool-native hooks (Cursor, Claude Code, OpenClaw) passively collect AI usage spans. The agent produces structured change summaries per commit. A dashboard aggregates the audit trail.

**Success Criteria:**

- SC-2.1: Each commit produces a structured change summary (files changed, docs affected, AI calls made, cost).
- SC-2.2: Weekly report shows total tokens, cost by model, and doc freshness.
- SC-2.3: Audit data is queryable and exportable.

---

## 5. Scope

### v0.1 — Prove the Loop (NOW)

The smallest thing that demonstrates the full cycle. Ship to the 13 mopac-software engineers.

| Feature | Description | Priority |
|---|---|---|
| **Doc Update Agent** | CLI/script: takes a diff + manifest + existing doc → produces suggested doc update via AI call | P0 |
| **Manifest** | `tracer.manifest.yaml` mapping code globs → doc paths | P0 |
| **Change Summary** | Per-commit markdown summary: what changed, docs affected, provenance | P0 |
| **CI Trigger** | GitHub Action that runs the agent on push/PR | P0 |
| **Hook Collectors** | Cursor hooks.json, Claude Code hooks, OpenClaw hook (instinct8 pattern) → local span log | P1 |
| **CLI Reporter** | `tracer report` — weekly token/cost/doc summary from span log | P1 |
| **Web Dashboard** | Read-only view: audit trail, doc freshness, cost breakdown | P1 (demo) |

### v0.2 — Team & Platform Expansion

| Feature | Description |
|---|---|
| Wiki adapter: Confluence | Read/write pages via REST API v2 |
| Wiki adapter: Notion | Read/write pages via blocks API |
| Multi-repo support | Aggregate spans + summaries across repos |
| Observability sink integration | Forward spans to Langfuse, Helicone, or Datadog |
| CI templates for GitLab, Azure Pipelines, Bitbucket | Thin wrappers calling the same agent CLI |

### v0.3+ — Parking Lot

| Feature | Notes |
|---|---|
| Wiki adapters: GitBook, MediaWiki, Google Docs | Designed via DocAdapter interface, built on demand |
| Code review inline suggestions | GitHub/GitLab suggested changes, not just comments |
| Model recommendation engine | Suggest cheaper models for specific task types |
| Cost alerting / budget thresholds | Notify when spend exceeds threshold |
| PR-native doc approval workflow | Reviewer approves doc update in same PR |

---

## 6. User Flows

### Flow 1: Code Change → Doc Update + Change Summary (Primary Demo Flow)

```
Developer commits code (or opens PR)
  → CI trigger fires (GitHub Action)
  → Agent reads diff + manifest
  → Matched docs identified
  → Agent calls AI provider: diff + current doc + commit message → suggested update
  → Agent posts: (a) doc update as PR comment or commit, (b) change summary
  → Developer reviews, accepts or discards
```

### Flow 2: Passive AI Usage Collection (Background)

```
Developer uses Cursor / Claude Code / OpenClaw
  → Tool-native hook fires on agent events
  → Hook script normalizes event → structured span
  → Span written to local log (JSON/SQLite)
  → Data feeds into change summaries and reports
```

### Flow 3: Weekly Report

```
Developer or manager runs `tracer report` or opens dashboard
  → Reads span log + change summary history
  → Aggregates: tokens, cost by model, cost by tool, doc freshness
  → Output: terminal table, markdown, or web dashboard
```

---

## 7. Manifest

```yaml
# tracer.manifest.yaml
version: 1
mappings:
  - code:
      paths:
        - "src/api/**/*.ts"
        - "src/routes/**/*.ts"
    docs:
      - path: "docs/API.md"
        type: repo          # repo | confluence | notion (v0.2+)
    strategy: suggest        # suggest | pr-comment | commit

  - code:
      paths:
        - "infrastructure/**/*.tf"
        - "template.yaml"
    docs:
      - path: "docs/ARCHITECTURE.md"
        type: repo
    strategy: suggest

  - code:
      paths:
        - "src/**/*.ts"
    docs:
      - path: "README.md"
        type: repo
    strategy: pr-comment
```

**Strategies:**

- `suggest` — Write suggested update to `.tracer/suggestions/` for manual application.
- `pr-comment` — Post the suggestion as a PR comment (requires CI integration).
- `commit` — Commit the suggestion to the PR branch (auto-update, still reviewable in PR).

---

## 8. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Agent execution time | < 60s per triggered commit (including AI call) |
| Setup time | < 10 minutes from clone to first doc suggestion |
| Privacy | Prompts not logged by default. Hash fingerprint only. Full logging opt-in. |
| Portability | Agent is a CLI/container. Any CI system can run it. |
| No cloud dependency (v0.1) | Runs 100% local or in CI runner. No SaaS required. |
| Human-in-the-loop | Doc suggestions are never auto-merged. Always reviewable. |

---

## 9. Adapter Interfaces (Design Now, Build Incrementally)

Seven service categories. v0.1 implements one adapter per category. The interfaces are the product's moat — platform-agnostic by design.

| Interface | v0.1 Implementation | v0.2+ |
|---|---|---|
| **Source Control** | Git (local CLI) | — (git covers 95% of users) |
| **CI/CD Trigger** | GitHub Actions | GitLab CI, Azure Pipelines, Bitbucket |
| **Code Review** | GitHub PR comments API | GitLab MR, Azure DevOps, Gerrit |
| **Doc Platform** | Repo files (markdown, git commit) | Confluence, Notion, GitBook |
| **Notification** | PR comment (doubles as notification) | Slack, Discord, Teams, email |
| **AI Provider** | Anthropic (Claude) | OpenAI, Bedrock, Vertex, Ollama |
| **Dev Tool Collector** | Cursor hooks, Claude Code hooks, OpenClaw hook | Windsurf, Copilot, Cody, Aider |
| **Observability Sink** | Local SQLite | Langfuse, Helicone, Datadog |

---

## 10. Validation Plan

### Spike (Tonight)

Take a real diff from mopac-software. Take a real doc (ARCHITECTURE.md or API.md). Feed both to Claude with a structured prompt. Evaluate: is the output good enough that a human would accept it?

**If yes:** The product is real. Proceed to v0.1 build.  
**If no:** Iterate on the prompt strategy before building anything else.

### Dogfood (Week 1-2)

Ship the GitHub Action to the 13 mopac-software engineers. Track:

- How many doc suggestions are accepted vs. discarded?
- What's the average edit distance between suggestion and final doc?
- Do engineers find the change summaries useful in PR review?

### Conference (Gartner)

Live demo showing the full loop on a real repo. Dashboard showing a week of real audit data from the mopac-software team.

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI doc suggestions are low quality | Medium | Critical | Spike tonight. Iterate prompt strategy. Conservative updates (modify sections, don't rewrite). |
| Hook APIs differ significantly across tools | Medium | Medium | Start with Cursor (best documented). OpenClaw hook already exists (instinct8). |
| Manifest maintenance becomes a chore | High | Medium | Provide `tracer suggest-mappings` to auto-detect code→doc relationships. |
| Scope creep into observability platform | High | Medium | We are NOT building an observability tool. Use Langfuse/Helicone for that. We build the doc agent. |
| Engineers ignore doc suggestions | Medium | High | Make suggestions high quality and low friction. PR comments > separate PRs. |

---

## 12. Open Questions

1. ~~Proxy vs. hooks?~~ **Resolved: hooks.** Tool-native hooks for collection. No proxy.
2. ~~Local daemon vs. CI trigger?~~ **Resolved: CI trigger.** GitHub Action for doc updates. Hooks are lightweight scripts, not daemons.
3. **Prompt strategy for doc updates** — How much context does the AI need? Full doc + full diff, or chunked? Need spike results.
4. **Manifest auto-discovery** — Should `tracer init` attempt to auto-map code→docs, or start blank?
5. **Dashboard hosting** — Static site with JSON data? Lightweight server? Hosted SaaS?
6. **Span schema** — Align with OpenTelemetry? Respan's model? Custom? (Respan's is a good reference.)

---

*Companion: [TRD.md](TRD.md). Next step: spike the doc update agent tonight.*
