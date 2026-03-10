# AutoDocs UI Reference (from demo screenshots)

Reference captured from AutoDocs demo for aligning Tracer’s dashboard and flows. Dark theme, orange accents, “AutoDocs” BETA branding.

---

## Layout

- **Left sidebar:** Nav + footer status
- **Top bar:** Search, Sync, Connect Repo (primary)
- **Main area:** Page content (dashboard, timeline, agent log, settings, etc.)

---

## Navigation (sidebar)

| Section        | Items                          | Notes                    |
|----------------|---------------------------------|--------------------------|
| **OVERVIEW**   | Dashboard, GitHub               | GitHub shows badge (e.g. 3) |
| **DOCUMENTATION** | Wiki (e.g. 24), Timeline    | Wiki = page count        |
| **SYSTEM**     | Agent Log (LIVE), Settings      | Agent Log = live stream  |
| **Footer**     | Agent Active – watching N repos  | Green status             |

---

## Top bar (global)

- **Search:** “Search docs, merges…” placeholder, `/` shortcut
- **Sync:** Refresh icon
- **Connect Repo:** Orange primary button, “+ Connect Repo”

---

## Dashboard

- **Metric row (4 cards):**
  - DOCS UPDATED (e.g. 148, “▲ 12 this week”)
  - PENDING MERGES (e.g. 3, “▼ 2 from yesterday”)
  - WIKI PAGES (e.g. 24, “▲ 4 new pages”)
  - AGENT ACTIONS (e.g. 67, “▲ 23 today”)
- **Recent Activity:** Chronological list; “View all →”
  - PR merge (e.g. “PR #287 merged into main – Add OAuth2 flow…”), author, time
  - Agent update (e.g. “Agent updated `authentication.md` – added OAuth2 section…”)
  - New wiki page, agent-flagged for review (warning icon)
- **Quick Actions:**
  - Browse Wiki (e.g. “24 pages – last updated 1m ago”)
  - Full Resync – “Regenerate all docs from current codebase”
  - Agent Logs – “67 actions today – 0 failures”
  - Manage Repos – “3 repositories connected”

---

## Auto-Generated Wiki

- **Concept:** "AutoDocs creates a full wiki from your code, similar to Confluence or Notion, but completely automated." "Every page is generated and kept up to date by the agent." "Structured documentation built from your actual codebase."
- **Left nav:** Nested hierarchy (e.g. Getting Started → Introduction, Quick Start, Installation, Configuration; API Reference → Authentication, Users Endpoint, Payments Endpoint, Webhooks, Rate Limiting; Architecture; Guides). "Search wiki pages..." at top.
- **Main content:** Page title, "Updated by Agent", "Last updated: 1 min ago", "v14 - 6 revisions". Rendered markdown: API endpoints (e.g. `PATCH /v2/users/:id` with Body JSON), Event Types, Retry Policy, etc.
- **Right sidebar:**
  - **PAGE INFO:** Created, Author (AutoDocs Agent), Words, Links to N pages
  - **VERSION HISTORY:** v14, v13, v12... with change description (e.g. "Added OAuth2 to Key features") and time
  - **RELATED MERGES:** Link to PR #287 OAuth2 flow

---

## Merge Timeline

- **Title:** “Merge Timeline”, breadcrumb “documentation / timeline”
- **Content:** Vertical timeline of merged PRs (purple dot per PR)
- **Per PR card:**
  - Time (e.g. “Today, 8:15 AM”)
  - “PR #N merged – &lt;short description&gt;”
  - Author, files merged, +lines -lines, branch/repo
  - Tags: which docs updated/created (e.g. `dashboard-components.md updated`, `i18n-guide.md created`) – clickable
- **Copy:** “Your dashboard gives a real-time view of every project.”

---

## Connect flow

### 1. Connect to GitHub

- Title: “Connect to GitHub”
- Subtitle: “Authorize AutoDocs to access your organization’s repositories.”
- Card: GitHub logo, “Authorize AutoDocs”, “AutoDocs by Acme Engineering wants to access your GitHub account”
- **Primary:** Green “Authorize with GitHub” button
- **Permissions:** Read repo contents, Read, Write webhooks (checkmarks)
- Hint: “Pick which repos to document and set the right permissions.”

### 2. Select a Repository

- Title: “Select a Repository”
- Subtitle: “Choose which repository AutoDocs should monitor for merges.”
- List of repos (radio select), e.g.:
  - `acme-eng/mobile-app` – React Native, 412 commits, TypeScript
  - `acme-eng/infrastructure` – Terraform & K8s, HCL
  - `acme-eng/design-system` – Shared UI, 267 commits, TypeScript
  - `acme-eng/analytics-service` – Event tracking, 156 commits, Python
- Footer: “Access control keeps your codebase secure…”, **Continue**

---

## Repo / onboarding settings (toggles)

- **Generate wiki pages** when new modules detected – on
- **Install webhook** for real-time merge events – on
- **Commit docs back to repo** (e.g. to `docs/` folder) – configurable (user can turn off)
- **Run initial full scan** to generate baseline docs – on

---

## Agent Log

- **Title:** “Agent Log”, breadcrumb “system / agent log”
- **Content:** Chronological, live-style feed
- **Entry format:**
  - Icon: ✓ success or ✗ failure
  - Title (e.g. “Updated authentication.md – added OAuth2 section”)
  - Meta: “platform-api triggered by PR #287”, “1 min ago”
- **Expandable:** Click to show diff-style view of doc change (file path, sections, +new in green, endpoints list)
- **Types:** “Updated X”, “Detected merge: PR #N into main”, “Failed to update X – requires review”

---

## Settings

- **Sub-nav:** General, Watched Paths, Agent Behavior, Tokens & Auth, Notifications
- **General Settings:** “Configure how AutoDocs operates across your repositories.”
  - **Auto-update on merge** – toggle (on): “Automatically trigger documentation updates when a PR is merged into the default branch.”
  - **Default branch** – dropdown: “main”
  - **Documentation style** – dropdown: “Technical – concise and precise”
  - **Include code examples** – toggle (on): “Auto-generate code snippets in documentation from source code.”
  - **Wiki language** – dropdown: “English”

---

## Tracer alignment notes

- **Dashboard:** Same idea as TRD “reporting surface” – metrics, recent activity, quick actions; Tracer can use “Docs updated”, “Change summaries”, “Agent runs”, “Pending suggestions”.
- **Timeline:** Mirrors “per-commit change summary” + which docs affected; Tracer has ChangeSummary + DocUpdate, can show “PR/commit → docs updated/created”.
- **Agent Log:** Same as “audit trail” / live log of agent actions; Tracer can show span-like events + doc update outcomes (success/fail, diff preview).
- **Connect Repo:** Tracer is GitHub Actions + manifest first; “Connect Repo” could map to “add repo to Tracer” (webhook or Actions setup) and manifest/scoped paths.
- **Settings:** Map to Tracer manifest + CI env (default branch, style, commit vs suggest-only, etc.).
- **Auto-wiki:** Tracer v1 Docs page = flat list of tracked docs + link to repo. Full auto-wiki (hierarchical nav, version history, rendered content, related merges) is a future consideration; Prd2gpt says we don't replace documentation platforms.
