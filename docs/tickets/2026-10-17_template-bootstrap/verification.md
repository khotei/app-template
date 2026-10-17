# Template bootstrap — verification

> Ticket: `2026-10-17_template-bootstrap` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-10-17 — run 1

**Verdict:** fail — the pre-merge scope passes (R3–R5, R7–R17, and R1 and R2 apart from one
clause each); R1's licence, R2's delete-on-merge and R6 can only hold after S8, and two plan
literals contradict the rules (Spec c1, c2).

Run between S6 and S7 in `~/lab/app-template` on `chore/enterprise-template` at `aa4cf0f`, fixed
point `origin/main` (`1bbdd1a`). S4–S6 ran but are still `todo` in `plan.md`; S7 records them.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | fail (licence only) | `gh repo view khotei/app-template --json …`: `PUBLIC`, the description, the seven topics, but `"licenseInfo":null`; `gh api repos/khotei/app-template/license` is 404. `LICENSE` (MIT, `Copyright (c) 2026 Vitalii Khotei`) is on the branch, but `git ls-tree origin/main -- LICENSE` is empty: GitHub detects a licence on the default branch only, so it appears at S8. S4's *Verify* ("MIT") and D2 assumed it at the push. |
| R2 | partial, pending S8 | `gh api repos/khotei/app-template`: `allow_squash_merge:true`, `allow_merge_commit:false`, `allow_rebase_merge:false`, `squash_merge_commit_title:"PR_TITLE"`, `squash_merge_commit_message:"PR_BODY"`; `delete_branch_on_merge:false`, deferred to S8 step 4 by design. |
| R3 | pass (flag) | `"is_template":true`. *Include all branches* is checked by hand in S8. |
| R4 | pass | `git ls-remote origin`: `HEAD`, `main` = `1bbdd1a`, `chore/monorepo-setup` = `c0bc48f`, `chore/enterprise-template` = `aa4cf0f`; no `chore/effect-setup`, no tags. `git log --reverse 1bbdd1a..chore/enterprise-template`: the 15 `effect-setup` commits (`f77ff02` … `654bda9`), then this ticket's 6 (`7bc90c6` … `aa4cf0f`). |
| R5 | pass | `git ls-remote --symref origin HEAD` → `refs/heads/main`; `default_branch:"main"`. |
| R6 | not verifiable, pending S8 | `git merge-base origin/main chore/enterprise-template` = `1bbdd1a`; no PR or merge yet. |
| R7 | pass | In `~/lab/oblik`: `git branch --list 'chore/effect-setup' 'backup/*'` empty; `git remote -v` names only `origin`; clean on `main`; `git log origin/main..main` empty; `git ls-remote origin` equals `origin-before.txt`; no `remote.template.*` or `branch.chore/effect-setup.*` config. |
| R8 | pass | `git grep -il oblik -- ':!docs/tickets' ':!repos' ':!bun.lock'` empty; `bun.lock`: 0 `oblik`, 43 `"@app-template/`; `bun install --frozen-lockfile` → no changes; 14 workspaces named `@app-template/<ws>`; no `#<ws>/` import changed; the filtered `bun.lock` diff is 14 moved blank lines. |
| R9 | pass | `make check`: Biome on 81 files, `tsc -b`, 26 tests in 5 files. `make dev-api` → `curl localhost:3000/health` = `{"status":"ok"}` (200), equal to `health-before.json`. |
| R10 | pass | `git grep -n 'Oblik+' -- ':!docs/tickets'` and `git grep -n '@oblik/' -- '*.md' ':!docs/tickets'` empty; `apps/web/src/index.html:6`, `deployment/Pulumi.yaml:2-3`, `.github/PULL_REQUEST_example.md:42`, `make help` header, `biome.json:286,290,322`. Older tickets change only by R14's four lines. |
| R11 | pass | `README.md:1-7` title and one paragraph, `:9-24` Quick start, `:33` Roadmap row, `:38-47` *Branches*, `:49-53` points at `#12-template-handoff`. `lychee --offline` on README, `docs/**`, `.claude/**`: 0 errors. |
| R12 | pass | `git diff 654bda9 HEAD -- CLAUDE.md` changes lines 1 and 3 only; `wc -l CLAUDE.md` = 28. |
| R13 | pass | `docs/knowledge/roadmap.md`: *How a ticket flows* (`:13`), 12-row ticket table (`:36-49`), sections 1–12, re-homing table (`:289-303`), *Facts* (`:305`); `docs/knowledge/glossary.md:9-32` defines six terms. Ticket 1's status is still *in feature*; S7 sets it. |
| R14 | pass | Line 3 of both `docs/tickets/2026-10-16_effect-setup/{feature,plan}.md` is the superseded note; `git diff --stat 654bda9 HEAD` on that folder: 2 files, 4 insertions. |
| R15 | pass | `.claude/rules/sdd.md:21-23`; `.claude/skills/ticket-feature/SKILL.md` lines 18, 29-33, 38-39. See Spec c1: the dependency map is unchanged as R15 asks, but that contradicts `sdd.md`. |
| R16 | pass | `.claude/rules/pull-requests.md:19-23`; `docs/knowledge/sdd.md › Roadmap and the teaching branch` (why, `gitGraph`, commands); dependency map identical to `654bda9`. |
| R17 | pass | `perl -CSD -ne 'print "$ARGV\n" if /\p{Cyrillic}/'` over every changed file outside `repos/`: nothing (probe string caught). Over all tracked files outside `repos/`: nothing. |

**Not verifiable:** R6, R1's licence and R2's delete-on-merge until S8; R3's *Include all
branches* without creating a repository (S8, by hand); R7's order (clone `make check` before the
deletions) only by timestamps (16:28 vs 16:30); CI on GitHub, which runs only on a push to `main`
or a PR (the `links` job passed locally).

Side notes from the verifier: `~/lab/oblik` keeps `stash@{2026-10-17 12:10:18}: On
chore/effect-setup: S14 removal + Docker ticket edits`, older than this ticket, the last trace of
the deleted branch; keeping it is the user's call. The `bun` dev process outlived `make dev-api`
and was stopped by hand.

### Review

#### Standards

Fixed point `origin/main`, diff without `repos/` and `bun.lock`. Translated from the reviewer's
report; bracketed notes are the verification's.

**Hard violations**

1. **Docs name the deleted `apps/*/src/layer.ts`** (effect-setup, `16b4986`): `apps/CLAUDE.md:5-7`
   calls `layer.ts` the composition root that "later becomes an Effect Layer";
   `apps/CLAUDE.md:13` describes mapping `_tag` to HTTP statuses, though `statusByTag` is gone;
   `.claude/rules/naming.md:18` names `src/layer.ts` as the composition root. Breaks
   `claude-md.md › Hard limits` (only the currently binding constraint) and `sdd.md › Artifacts`
   (living docs updated in the same commit).
2. **`docs/knowledge/architecture.md:98-102, 124-145` is stale.** The *In transition* box leans on
   effect-setup "until the ticket rewrites them", and `aa4cf0f` closed that ticket; *The Effect
   seam* still says "The code is plain TypeScript". Breaks `sdd.md › Artifacts`.
3. **CI runs tests outside `make`:** `.github/workflows/ci.yml:95` `run: bun run test`, while
   Typecheck uses `make typecheck`. `tooling.md › Commands`. [Downgraded to a judgement call:
   `docs/knowledge/tooling.md:201` documents the CI `test` job as `bun run test`.]
4. **Commit bodies wider than 72 columns:** `4c8f9cb` (one line), `7bc90c6` (six lines, up to
   77). `commits.md › Format`. [These commits are history on the branch; the squash body is
   written fresh in S8.]

**Judgement calls**

5. Layer constant casing: `naming.md:56` says constants are `camelCase`, but
   `ExampleRepositoryMemory`, `QueueClientMemory`, `QueueClientSqlite`, `LanguageModelStub`,
   `MinimumLogLevelFromConfig` are PascalCase while `layerPersisted` (`packages/queue/queue.ts:91`)
   is camelCase. `naming.md` needs a Layer line.
6. Error names: `QueueError` (`packages/queue/queue.ts:25`) has no `<Problem>`, `AttemptFailed`
   (`:41`) no `Error` suffix; `naming.md › Symbols`.
7. TSDoc restating the type: `packages/queue/queue.ts:90`; `comments.md › Gate A`.
8. Possible Speculative Generality: catalog pin `"@effect/platform-bun": "4.0.5"`
   (`package.json:34`) declared by no workspace; `tooling.md › Dependencies`.
9. Possible Speculative Generality: `QueueClientSqlite` (`infrastructure/shared/queue.client.ts:7`)
   and `LanguageModelStub` (`packages/llm/client.ts:6`) have no importer yet; their consumers are
   roadmap tickets.
10. Possible Duplicated Code: `Effect.runSync(Effect.provide(X, X.layer))` in the three `main.ts`;
    `ApiConfig` and `WebConfig` differ only by variable name (`packages/config/config.ts:3-13`);
    the `15 seconds` / `5 seconds` defaults appear in `config.ts`, `.env.example` and
    `queue.test.ts:88-91`.
11. Unexplained keep-alive `setInterval(() => {}, maxTimerDelayMs)` in
    `apps/worker/src/main.ts:10`; `comments.md › Gate A` allows a one-line gotcha comment.
12. The subtree commit `9bedf0d` does not follow `commits.md`; `git subtree` generates it, so the
    exception could be stated in `commits.md` or by `vendor-effect`.

Ownership: effect-setup — 1–3, 5–11 (2 became false when `aa4cf0f` closed effect-setup);
template-bootstrap — 4; both — 12.

#### Spec

Translated from the reviewer's report.

R8, R10–R12 and R14–R17 are implemented; R1–R7 are S4–S8, pending by design, and the diff does
not contradict them except as below.

**(a) Missing or partial:** nothing beyond S7's pending work (`roadmap.md:38` still *in feature*;
R15: "set the entry's status to a link to the ticket folder").

**(b) Not asked for:**

- The `make help` header (`Makefile:9`): R10 asks that the help "SHALL name App Template", but it
  named no product before, and *Out of scope* excludes "Any change of behaviour". Recorded in S2's
  findings; literalism rather than creep.
- The `researcher` re-check of dated facts in `/ticket-feature` steps 1 and 3 goes beyond R15
  ("read the roadmap entry … set the entry's status"). Recorded in S1's findings and
  `architecture.md › Rule and skill text`.

**(c) Implemented, but looks wrong:**

1. **The dependency map is stale, and the spec demands it.** `feature.md:35-36` says "The
   dependency map … does not change" and R15/R16 accept on "byte-identical", but
   `/ticket-feature` now writes `docs/knowledge/roadmap.md`, and its *Writes* cell
   (`docs/knowledge/sdd.md:57`) lists only `feature.md` and `glossary.md`. `.claude/rules/sdd.md`:
   "A commit that changes what a skill or agent uses updates the map in the same commit."
2. **The PR title pairs `:memo:` with `chore`.** `architecture.md:86` and `plan.md:230`:
   `:memo: chore(template-bootstrap): …`; `commits.md › Vocabulary` pairs `:memo:` only with
   `docs`. The title becomes `main`'s commit subject, and the squash carries effect-setup's code,
   so fix it before S8.
3. **R2 vs R16.** With *delete head branches on merge*, the teaching-branch procedure
   (`pull-requests.md:19`, `docs/knowledge/sdd.md:170`, `git merge --no-ff <type>/<slug>` after the
   squash) works only from a local copy of the ticket branch — the reliance D8 rejects. Name the
   local branch as the source, or fetch before the merge.
4. **`architecture.md:44-46` reads as if the `Context.Service` keys were not touched**; they were
   renamed, as R8 requires and S2's findings record. Rephrase.

Summary: Standards — 12 findings (4 rule breaches, one downgraded), worst: rules and
`apps/CLAUDE.md` still name the deleted `src/layer.ts`. Spec — 4 findings in (c), worst: the
dependency map left stale by a requirement that contradicts `sdd.md`.

### Simplifications

1. Delete the stale lines that name `src/layer.ts` and the `_tag` mapping
   (`apps/CLAUDE.md:5-7,13`, `.claude/rules/naming.md:18`), and replace the *In transition* box and
   *The Effect seam* in `docs/knowledge/architecture.md:98-145` with a pointer to the roadmap
   ticket that rewrites them. Gain: the model stops looking for a file that does not exist.
2. Add `/ticket-feature`'s `docs/knowledge/roadmap.md` to the map's *Writes* cell
   (`docs/knowledge/sdd.md:57`), and correct `feature.md`'s "does not change" and R15/R16's
   acceptance to match. One line plus the spec text.
3. Retitle the PR in `architecture.md:86` and `plan.md:230` with a pair from `commits.md`.
4. Drop the unused catalog pin `@effect/platform-bun` (`package.json:34`) until a workspace
   declares it. *Dropped:* `chat-core` consumes it through `BunRuntime`, so it would only be added
   back.

### Lessons

| Lesson | Evidence | Proposed change | Applied |
|---|---|---|---|
| The spec and plan fixed literals that broke a rule or could not hold yet | `feature.md:35-36` "map does not change" vs `sdd.md`; `architecture.md:86`/`plan.md:230` `:memo: chore` vs `commits.md`; S4 *Verify* expects MIT before `LICENSE` is on `main` | `.claude/skills/ticket-plan/SKILL.md` step 3: "Check every literal the plan fixes (titles, 'unchanged' claims, expected outputs) against `.claude/rules/*` and against what exists at that step." | moved to [`claude-toolkit`](../../knowledge/roadmap.md#2-claude-toolkit) |
| A fact restated in a second doc | S1 review (roadmap-entry fact written three times), S3 review (README restated the teaching-branch mechanism) | `.claude/agents/implementer.md › Disciplines`: "Before a doc states a fact, `git grep` for it; if another doc owns it, link it (`claude-md.md › One author per fact`)." | moved to [`claude-toolkit`](../../knowledge/roadmap.md#2-claude-toolkit) |
| The English-only check was missing or not portable | S1 *Verify* used `grep -lP` (absent on macOS); S2 had none; S3 and S7 patched in `perl` | A `make english` target in `make check`, beside `ids`: `perl -CSD` `\p{Cyrillic}` over `git ls-files` minus `repos/`. | rejected by the user: review catches it |
| Commit bodies over 72 columns | `4c8f9cb`, `7bc90c6` | A `.husky/commit-msg` hook that fails on a body line over 72 columns (URLs and trailers exempt). | moved to [`claude-toolkit`](../../knowledge/roadmap.md#2-claude-toolkit) |
