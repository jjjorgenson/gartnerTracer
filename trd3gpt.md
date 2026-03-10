# Tracer Technical Requirements Document (TRD3GPT)
Build-Readiness Edition

This document incorporates the build-readiness clarifications requested after
review of the v2 GPT-cleaned documents. These additions define execution
contracts, validation rules, artifact lifecycle, CI integration, and security
constraints without changing product scope.

This document is intended to raise build confidence from ~83% to ~95%.

---

# 1. System Overview

Tracer is a CLI and CI tool that:

1. Detects when code changes may affect documentation
2. Generates suggested documentation updates
3. Records observable AI tool usage
4. Produces structured artifacts for auditing and dashboards

Tracer does **not require a hosted backend service** in v0.1.

System architecture:

Developer Tools / CI
        ↓
     Tracer CLI
        ↓
   JSON Artifacts
        ↓
 Static Dashboard

---

# 2. Execution Lifecycle

Tracer execution follows the exact sequence below.

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

---

# 3. Exit Codes

Tracer uses the following exit codes.

| Code | Meaning |
|-----|--------|
| 0 | success |
| 1 | runtime failure |
| 2 | invalid config or manifest |
| 3 | AI provider failure |
| 4 | delivery failure |
| 9 | no matched docs |

Exit code 9 allows CI systems to detect “nothing to do”.

---

# 4. Prompt Construction

Tracer uses a canonical prompt structure.

## Prompt Sections

1. Repository metadata
2. Target document metadata
3. Changed file summary
4. Relevant code diff
5. Current document content
6. Update instructions

---

# 5. Token Budget Strategy

Tracer does **not enforce a fixed global token cap**.

Instead it uses configurable limits.

Configurable values:


TRACER_MAX_PROMPT_TOKENS (default 120k)
TRACER_DIFF_TOKEN_LIMIT (default 20k per doc)


Prompt construction strategy:

1. filter diff to mapped files
2. truncate large diffs using head/tail strategy
3. reduce document context if needed
4. retry construction if prompt exceeds token limits

Tracer attempts to construct prompts compatible with the current model's
maximum context window.

---

# 6. Diff → Document Resolution

Manifest resolution algorithm:

1. collect changed files
2. match files against manifest globs
3. apply precedence rules
4. dedupe document targets
5. rank docs by number of contributing files
6. process top N docs

---

# 7. Mapping Precedence

When multiple mappings match a file:

1. exact path match wins
2. narrower glob wins
3. later manifest entry overrides earlier
4. unresolved ties include both mappings

---

# 8. Max Fan-Out Protection

To prevent runaway costs:


TRACER_MAX_DOCS_PER_RUN = 10


If more than 10 docs match:

- rank by number of matching files
- process the top 10
- record skipped docs in ChangeSummary warnings

---

# 9. Output Validation

Tracer validates AI output before delivery.

## Hard Reject Conditions

Reject output if:

- empty response
- unparseable format
- >2x original document size
- >40% content deletion
- malformed markdown
- diff cannot be applied

Rejected outputs are stored in `spans-rejected.jsonl`.

---

# 10. Soft Warnings

Tracer still delivers suggestions but records warnings if:

- >5 sections modified
- token usage unusually large
- document rewritten instead of updated

---

# 11. Artifact Layout

Artifacts are stored in `.tracer`.


.tracer/
spans.jsonl
spans-rejected.jsonl
doc-status.json
change-summaries/
doc-updates/
suggestions/


---

# 12. Artifact Retention

Default retention:

| Artifact | Limit |
|--------|-------|
| spans.jsonl | rotate at 10MB |
| rejected spans | rotate at 5MB |
| change summaries | last 200 commits |
| doc updates | last 200 commits |
| suggestions | last 200 commits |

---

# 13. Acceptance Evidence

Acceptance depends on delivery strategy.

## suggest

Accepted when user runs:


tracer accept <artifact>


Rejected via:


tracer reject <artifact>


---

## pr-comment

Accepted when equivalent documentation changes appear in merged branch.

Equivalent means:

- identical suggested hash OR
- similarity ≥ 0.90

---

## commit

Accepted when documentation commit merges into default branch.

---

# 14. Canonical Truth

`doc-status.json` represents canonical truth for the **default branch only**.

Branch-local suggestions do not affect canonical state until merged.

---

# 15. Span Logging

Tracer records observable AI tool interactions.

Example span:


{
"tool": "cursor",
"eventType": "ai_call",
"model": "claude-sonnet",
"inputTokens": 900,
"outputTokens": 300,
"latencyMs": 420
}


Tracer logs **tool interactions**, not internal model reasoning.

---

# 16. Correlation Strategy

Tracer correlates spans with commits using:

1. commitHash (when available)
2. session identifiers
3. time windows

Correlation is best-effort.

---

# 17. Security Rules

Span logs must **never include**:

- prompt text
- code diffs
- document contents

Only metadata and hashes are stored.

Optional logging of prompts requires explicit config.

---

# 18. CI Integration

Required environment variables:


TRACER_PROVIDER
TRACER_PROVIDER_API_KEY
TRACER_MANIFEST_PATH


Optional:


TRACER_MAX_DOCS_PER_RUN
TRACER_MAX_PROMPT_TOKENS
TRACER_OUTPUT_DIR
TRACER_DELIVERY_STRATEGY


---

# 19. GitHub Action Flow

CI pipeline:

1. checkout repository
2. install tracer
3. run `tracer agent`
4. upload `.tracer/change-summaries`
5. upload `.tracer/doc-updates`
6. upload `.tracer/doc-status.json`
7. publish dashboard artifacts

---

# 20. Dashboard Data Contract

The v0.1 dashboard is static.

It reads JSON artifacts only.


dashboard-data/
doc-status.json
change-summaries/
reports/


No backend service required.

---

# 21. Failure Philosophy

Tracer prioritizes developer workflow safety.

Failures:

- never block commits
- never break developer tools
- fail open where possible

---

# 22. Testing Requirements

Recommended tests:

Unit tests

- mapping precedence
- validation rules
- artifact rotation

Integration tests

- PR with no matched docs
- PR affecting >10 docs
- duplicate runs dedupe correctly
- malformed AI output rejection

---

# End of TRD3GPT