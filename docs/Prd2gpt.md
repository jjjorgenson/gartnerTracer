# GPT Cleanup Pass (Truthfulness & Precision)

This version narrows unverifiable claims and clarifies architectural decisions
without changing product scope or feature design.

Clarifications applied:

- Marketing claims narrowed to avoid absolute or unverifiable statements
- v0.1 dashboard architecture fixed as **static artifact dashboard**
- Mapping precedence rules clarified
- Acceptance evidence defined per delivery strategy
- `doc-status.json` scoped to canonical **default branch truth**
- Several overly strong claims softened (commit correlation, determinism, etc.)

---

# Product Requirements Document (PRD)

## Product Vision

Tracer helps teams keep documentation aligned with code changes and
understand how AI tools are being used during development.

Tracer does **not attempt to replace documentation systems or observability
platforms**. Instead, it focuses on two narrow capabilities:

1. **Detect when code changes may require documentation updates**
2. **Provide transparent reporting of AI tool usage during development**

Tracer operates primarily as a **CLI and CI tool**, requiring no hosted
Tracer-managed backend in v0.1.

---

## Product Goals

Primary goals for v0.1:

- Detect code changes that likely require documentation updates
- Generate suggested documentation updates
- Deliver those updates in a reviewable format
- Provide visibility into AI tool usage associated with development workflows

Success is measured primarily by **useful documentation update suggestions**
that are accepted by human reviewers.

---

## Non-Goals (v0.1)

Tracer v0.1 does not attempt to:

- Replace documentation platforms
- Become a full AI observability system
- Provide deep static code analysis
- Guarantee perfect documentation accuracy

Tracer suggestions should be treated as **reviewable proposals**, not
automatically trusted documentation.

---

## Key Capabilities

### 1. Code → Documentation Mapping

Tracer uses a **manifest** to define relationships between code paths and
documentation files.

Mappings define which documentation files should be considered when code
within certain paths changes.

Tracer does not automatically activate inferred mappings.

Optional tooling (`tracer suggest-mappings`) may propose candidate mappings
that must be explicitly accepted by users.

---

### Mapping Precedence Rules

When multiple mappings match a changed file, precedence is resolved using
the following rules:

1. **More specific path globs override broader globs**
2. **Mappings defined later in the manifest override earlier entries**
3. **Exact path matches override wildcard matches**
4. If two mappings remain ambiguous, both documentation files may be
   evaluated by the agent.

These rules ensure predictable behavior without requiring complex
configuration.

---

### 2. Documentation Update Suggestions

Tracer evaluates code changes and generates **suggested documentation updates**.

Suggested updates are not automatically merged. They are delivered through
one of several delivery strategies.

Supported delivery strategies:

- `suggest` – structured suggestion artifact
- `pr-comment` – documentation suggestion posted as a PR comment
- `commit` – commit to a documentation branch

Human reviewers remain responsible for final acceptance.

---

### Acceptance Evidence

Acceptance is determined differently depending on delivery strategy.

| Strategy | Evidence of Acceptance |
|--------|--------|
| suggest | user marks suggestion accepted via CLI or UI |
| pr-comment | reviewer applies suggested patch or merges equivalent change |
| commit | commit merged into default branch |

Tracer records acceptance events for reporting purposes.

---

### 3. AI Usage Visibility

Tracer records spans representing AI tool usage events during development.

These spans provide approximate visibility into:

- model usage
- token counts
- estimated costs
- tool integrations

Tracer does **not claim to capture every internal AI model decision**.

Instead it records **observable tool interactions** where instrumentation
exists.

---

### 4. Change Summaries

Each CI execution generates a structured **Change Summary** artifact
describing:

- changed files
- associated documentation
- AI calls made by Tracer during generation
- suggested documentation updates

Change summaries provide traceability for documentation suggestions.

---

## Dashboard (v0.1)

The dashboard is implemented as a **static site**.

The dashboard reads generated JSON artifacts produced by the CLI or CI.

These artifacts include:

- span reports
- change summaries
- documentation status

The static dashboard may be hosted using:

- GitHub Pages
- local filesystem
- simple static hosting

v0.1 does **not require a persistent backend service**.

---

## Documentation Freshness

Tracer tracks documentation freshness using `doc-status.json`.

This file represents **canonical truth for the default branch only**.

Branch-specific documentation changes may temporarily diverge until
merged.

---

## AI Provider Choice

Tracer v0.1 uses Anthropic Claude Sonnet for documentation generation.

This provider was selected based on internal evaluation of code-reasoning
quality.

This choice may evolve as model ecosystems change.

---

## Success Metrics

Tracer v0.1 success is measured using:

- documentation suggestions accepted by reviewers
- reduced documentation drift
- visibility into development AI usage

Tracer does not claim to eliminate documentation drift entirely.

---