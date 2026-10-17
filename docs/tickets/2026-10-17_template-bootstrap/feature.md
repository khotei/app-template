# Template bootstrap

> Ticket: `2026-10-17_template-bootstrap` · Source: conversation (grilling on 2026-10-17)
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md) ·
> [roadmap](../../knowledge/roadmap.md)

## Goal

Move this tree into a new public repository, `khotei/app-template`, and make it the base every
later ticket of the [roadmap](../../knowledge/roadmap.md) starts from: three branches with the
history that teaches (`main`, `chore/monorepo-setup`, `chore/enterprise-template`), the scope
renamed from `@oblik` to `@app-template`, a roadmap and a glossary committed, and the SDD rules
extended with the roadmap and the branch model. Oblik+ stays what it is; the template is cut from
it and grows on its own.

## Context

- **Where the tree is.** `oblik` on branch `chore/effect-setup`, 15 commits ahead of `main`
  (`1bbdd1a`, the squashed scaffold). `origin` holds `main` and `chore/monorepo-setup`
  (`c0bc48f`), not `chore/effect-setup`. The working tree is clean; `make check` passes at `HEAD`.
- **`effect-setup` is half done.** `plan.md` has S1–S12 `done` and S13–S23 `todo`. The user
  decided not to finish it as a ticket: S1–S12 become the starting state of the template and the
  remaining requirements are re-homed into the roadmap's tickets
  ([roadmap › Re-homing](../../knowledge/roadmap.md#re-homing-effect-setup)).
- **What the rename touches.** `oblik` appears in 46 tracked files outside `repos/`,
  `docs/tickets/` and `bun.lock` (package names and `workspace:*` dependencies, Biome override
  messages, `Makefile`, `deployment/Pulumi.yaml`, the web `index.html` title, docs and rules), and
  44 times in `bun.lock`. `Oblik+` names the product in `CLAUDE.md`, `README.md`,
  `apps/web/src/index.html`, `deployment/Pulumi.yaml` and `.github/PULL_REQUEST_example.md`.
- **Repository facts (2026-10-17).** `gh` is logged in as `khotei` over SSH; `khotei/oblik` is
  private with default branch `main`. There is no `LICENSE`. `.claude/settings.json` asks before
  `gh repo create`, `git push`, `git checkout`, `git branch -d`.
- **Rules this ticket changes.** `.claude/rules/sdd.md` (where a future ticket lives before it
  starts), `.claude/rules/pull-requests.md` (the teaching branch), `.claude/skills/ticket-feature/`
  (reads the roadmap entry), `docs/knowledge/sdd.md` (explains both). The dependency map in
  `docs/knowledge/sdd.md` changes in one cell: `/ticket-feature` also writes
  `docs/knowledge/roadmap.md`. No skill gains or loses a plugin skill, agent or hook.
- **Terms** come from [docs/knowledge/glossary.md](../../knowledge/glossary.md), created by this
  ticket's grilling.

## Scope

- The GitHub repository: creation, description, topics, licence, template flag, merge settings.
- The three branches, with the SHAs of `main` and `chore/monorepo-setup` unchanged.
- The rename `@oblik` → `@app-template`, `oblik` → `app-template`, `Oblik+` → `App Template`, with the
  product line rewritten for a chat clone.
- `docs/knowledge/roadmap.md`, `docs/knowledge/glossary.md`, `README.md` and `CLAUDE.md` as a
  template's; `effect-setup` marked superseded.
- The SDD rules and the `ticket-feature` skill extended with the roadmap and the teaching branch.
- The first squash PR into `main` and the first `--no-ff` merge into `chore/enterprise-template`.
- Cleanup in `oblik`: the local `chore/effect-setup` branch deleted once the transfer is verified.

## Out of scope

- Any change of behaviour or dependency; `make check` passes before and after for the same reason.
- Finishing `effect-setup`'s S13–S23: re-homed by the roadmap.
- The rename script and the "new project" checklist: `template-handoff` (roadmap 12).
- The Claude toolkit beyond the three rule edits above: `claude-toolkit` (roadmap 2).
- Branch protection, CODEOWNERS, issue templates, GitHub Actions secrets.
- Touching `origin` of `oblik`: nothing is pushed there.

## Requirements

### Repository

- **R1** — WHEN the repository is created, THE SYSTEM SHALL create `khotei/app-template` as a
  **public** repository with the description *"Effect v4 modular monolith on Bun: a chat clone
  built as a template for enterprise projects"*, the topics `template`, `effect`, `bun`,
  `typescript`, `tanstack`, `pulumi`, `aws`, and a `LICENSE` file holding the MIT licence in the
  name of the git author of `main` (`Copyright (c) 2026 Vitalii Khotei`).
- **R2** — THE repository settings SHALL allow squash merging only (merge commits and rebase
  merging disabled), with the squash message set to *pull request title and description*, and
  SHALL delete head branches on merge, because the step history lives on the teaching branch.
- **R3** — THE repository SHALL be marked a *template repository*, so that "Use this template" with
  *Include all branches* reproduces the three branches.

### Branches

- **R4** — WHEN the branches are pushed, `main` and `chore/monorepo-setup` SHALL point at the same
  commits as in `oblik` (`1bbdd1a` and `c0bc48f`), and `chore/enterprise-template` SHALL contain
  the 15 commits of `chore/effect-setup` followed by this ticket's commits. No branch named
  `chore/effect-setup` SHALL exist in the new repository.
- **R5** — THE default branch SHALL be `main`.
- **R6** — WHEN this ticket's work is complete, it SHALL be merged into `main` through one squash
  PR from `chore/enterprise-template`, whose squash commit carries the S1–S12 state and the
  bootstrap together, and `chore/enterprise-template` SHALL then have `main` merged into it, so
  that the next ticket branch, cut from `main`, merges into the teaching branch with `main`'s
  squash as a common ancestor.
- **R7** — WHEN the push is verified (R4 holds and `make check` passes on a fresh clone of
  `chore/enterprise-template`), THE local branches `chore/effect-setup` and
  `backup/effect-setup-simplified` in `oblik` SHALL be deleted and the `template` remote removed,
  and `oblik` SHALL receive no other change and no push.

### Rename

- **R8** — WHEN the rename is done, no tracked file outside `docs/tickets/`, `repos/` and
  `bun.lock` SHALL contain `oblik` or `Oblik` in any case; workspace names SHALL be
  `@app-template/<workspace>`, and `workspace:*` dependencies, `.ts` import specifiers, Biome
  `noRestrictedImports` globs and messages SHALL follow; the within-workspace `#<workspace>/*`
  imports SHALL stay as they are; the root package SHALL be named `app-template`, and
  `bun install` SHALL regenerate `bun.lock` without network changes to versions.
- **R9** — WHEN the rename is done, `make check` SHALL pass, and `make dev-api` SHALL answer
  `curl localhost:3000/health` as before.
- **R10** — Biome override messages, the `Makefile` help, `deployment/Pulumi.yaml`'s description,
  the web `index.html` title and `.github/PULL_REQUEST_example.md` SHALL name App Template, and
  the layer `CLAUDE.md` files and `docs/knowledge/*.md` SHALL show `@app-template/…` in every import
  example. `docs/tickets/` is history and SHALL NOT be rewritten.

### Documents

- **R11** — `README.md` SHALL open with *App Template* and a one-paragraph description of the chat
  clone and its purpose as a template, keep the quick start, and add a *Branches* section (what
  `main`, `chore/monorepo-setup` and `chore/enterprise-template` hold) and a *Roadmap* row in the
  "Where to read next" table. The "Starting a new project" section SHALL point at the
  `template-handoff` roadmap entry instead of describing the procedure.
- **R12** — The root `CLAUDE.md` SHALL name App Template, describe the chat clone in one line, keep
  the map and the working rules, and stay within the `claude-md.md` budget.
- **R13** — `docs/knowledge/roadmap.md` SHALL exist as written in grilling: how a ticket flows,
  the ticket table with dependencies and status, one section per ticket with goal, scope, out of
  scope, inherited requirements, open questions and dated facts, the re-homing table for
  `effect-setup`, and cross-ticket facts. `docs/knowledge/glossary.md` SHALL exist with the terms
  Visitor, Chat, Message, Attachment, Placeholder and Assistant.
- **R14** — `docs/tickets/2026-10-16_effect-setup/plan.md` SHALL state at its top that the ticket
  is superseded at S12 and link the roadmap's re-homing table; `feature.md` of that ticket SHALL
  carry the same one-line note under its title. Nothing else in that folder changes.

### Rules and skills

- **R15** — `.claude/rules/sdd.md` SHALL state that a future ticket exists only as an entry in
  `docs/knowledge/roadmap.md` until its `/ticket-feature` runs, and that `/ticket-feature` starts
  from that entry when one exists. `.claude/skills/ticket-feature/SKILL.md` SHALL read the
  roadmap entry for its slug in step 1 and set the entry's status to a link to the ticket folder
  when `feature.md` is written.
- **R16** — `.claude/rules/pull-requests.md` SHALL describe the teaching branch: after a PR is
  squash-merged, the ticket branch is merged into `chore/enterprise-template` with `--no-ff`, then
  `main` is merged into it; and `docs/knowledge/sdd.md` SHALL explain why (readable steps next to a
  clean `main`) and show the branch picture.
- **R17** — All new and edited content in `.claude/`, `docs/`, `README.md` and `LICENSE` SHALL be
  in English.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | `gh repo view khotei/app-template --json visibility,description,repositoryTopics,licenseInfo` shows `PUBLIC`, the description, the seven topics and `MIT`; `LICENSE` names Vitalii Khotei. |
| R2 | `gh api repos/khotei/app-template` shows `allow_squash_merge: true`, `allow_merge_commit: false`, `allow_rebase_merge: false`, `squash_merge_commit_title: PR_TITLE`, `squash_merge_commit_message: PR_BODY`, `delete_branch_on_merge: true`. |
| R3 | `gh api repos/khotei/app-template --jq .is_template` prints `true`. |
| R4, R5 | `git ls-remote git@github.com:khotei/app-template` lists exactly `main` at `1bbdd1a…`, `chore/monorepo-setup` at `c0bc48f…`, `chore/enterprise-template`, and `HEAD` → `main`; `git log --oneline 1bbdd1a..chore/enterprise-template` begins with the 15 effect-setup commits. |
| R6 | After merge, `git log -1 main` is the squash with the PR body; `git merge-base main chore/enterprise-template` equals `main`'s tip. |
| R7 | In `oblik`: `git branch --list 'chore/effect-setup' 'backup/*'` is empty, `git remote` lists only `origin`, `git status` clean on `main`, `git log origin/main..main` empty. |
| R8 | `git grep -il oblik -- ':!docs/tickets' ':!repos' ':!bun.lock'` prints nothing; `grep -c '"@app-template/' bun.lock` is non-zero and `grep -c oblik bun.lock` is zero; `bun install --frozen-lockfile` succeeds. |
| R9 | `make check` passes; `make dev-api` then `curl -s localhost:3000/health` returns the same body as before the rename. |
| R10 | `git grep -n "Oblik+"` outside `docs/tickets/` prints nothing; `git grep -n "@oblik/" -- '*.md' ':!docs/tickets'` prints nothing. |
| R11, R12 | `README.md` and `CLAUDE.md` read as specified; `wc -l CLAUDE.md` ≤ 40; `lychee --offline` on the docs passes (CI `links`). |
| R13 | Both files exist; the roadmap's ticket table has 12 rows and the re-homing table maps R23–R40; the glossary has the six terms. |
| R14 | `head -5` of the two `effect-setup` files shows the superseded note; `git diff --stat` of that folder touches only those lines. |
| R15, R16 | The three rule and skill files contain the stated sentences; `docs/knowledge/sdd.md` shows the branch picture; the dependency map differs only in the `/ticket-feature` *Writes* cell. |
| R17 | No Cyrillic in the changed files: `git diff main --name-only \| xargs grep -lP '[\p{Cyrillic}]'` prints nothing. |

## Open questions

- **Merge mechanics of R6 and R16.** The teaching branch and `main` diverge (steps versus squash)
  after the first PR. Merging `main` into `chore/enterprise-template` right after each squash
  should record the squash as an ancestor and keep later `--no-ff` merges conflict-free, because
  both sides hold identical trees. `/ticket-architecture` rehearses the sequence in a scratch clone
  before it becomes the rule's text.
- **Order of the first PR and the rule edits.** The rule edits (R15, R16) land in this ticket's
  commits on the branch, so they are already in force when the second ticket starts; the question is
  only whether `pull-requests.md` describes the merge procedure before or after it was rehearsed.
