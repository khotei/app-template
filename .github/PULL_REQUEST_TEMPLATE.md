<!--
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  HOW TO USE THIS TEMPLATE — everything in THIS comment is review-only and │
  │  is STRIPPED from the squashed commit. Text OUTSIDE comments survives.    │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  This repo squash-merges with "Pull request title and description", so:  │
  │    • PR TITLE       -> commit SUBJECT                                     │
  │    • PR DESCRIPTION -> commit BODY  (everything below, comments stripped) │
  │                                                                          │
  │  TITLE the PR as a commits.md subject line:                              │
  │    <gitmoji> <type>(<scope>): <subject>                                   │
  │    imperative · Capitalised · ≤50 chars · no trailing period             │
  │    e.g.  :sparkles: feat(roster-import): Add roster CSV import            │
  │  Scope = ticket slug or area (api, domain, …).                           │
  │  Format owned by .claude/rules/commits.md — see .claude/rules/pull-requests.md.
  │                                                                          │
  │  ── Author self-check (tick before requesting review) ──                 │
  │  [ ] Title is a commits.md subject (gitmoji + type(scope) + imperative ≤50)
  │  [ ] `make check` passes (Biome + bun check + vitest)                    │
  │  [ ] Imports only go down: apps -> application -> infrastructure -> domain│
  │  [ ] domain imports no workspace; web client imports only api-client, ui │
  │  [ ] Inside a workspace: #<workspace>/… imports, no relative paths       │
  │  [ ] New dependency pinned in catalogs.tools or catalogs.runtime         │
  │  [ ] Ticket docs (feature / architecture / plan) and docs/knowledge/     │
  │      updated if behaviour or conventions changed                         │
  │                                                                          │
  │  ── How to test ──                                                       │
  │  Steps a reviewer runs locally to verify the change.                     │
  │                                                                          │
  │  ── Screenshots / notes for reviewers ──                                 │
  │  UI diffs, scratch context — useful for review, noise in git history.    │
  └──────────────────────────────────────────────────────────────────────────┘
-->

## Summary

WHAT this PR changes and WHY, in 2–3 sentences wrapped ~72 chars.
Understandable on its own — not a restatement of the ticket title.

## What changed

- Tight bullets of the notable changes.
- One line each; the diff carries the detail.

## How it works

Short note on the mechanism. Keep a diagram only if it earns its place.

<details><summary>Architecture / flow diagram (optional)</summary>

```mermaid
graph TD
  a[caller] --> b[thing this PR adds]
```

</details>

## Decisions

Decision: One paragraph per non-obvious choice — a trade-off made, an
alternative rejected, or a downstream implication. This is the highest-
value section for the next developer and the next AI agent reading
`git log`. Add more `Decision:` paragraphs as needed; drop the section
only if the change is genuinely trivial/mechanical.

## Refs

Refs: docs/tickets/<YYYY-MM-DD>_<slug>/
