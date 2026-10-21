# Claude toolkit

> Ticket: `2026-10-20_claude-toolkit` · Source: the toolkit audit of 2026-10-20 (conversation)
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Goal

The toolkit (`CLAUDE.md` files, `.claude/rules/`, skills, agents, hooks) holds only what
demonstrably changes agent behaviour, costs as little context per session as possible, and turns
the lessons of the first two tickets into checks or single lines. This ticket lands the first wave,
the items the audit ranked urgent or always-loaded; later waves join it as new requirements once
the first is reviewed.

## Context

- **Toolkit today.** Root `CLAUDE.md` and seven workspace `CLAUDE.md`; 13 rules, 9 of them behind
  `paths:`; 6 user-invoked skills (`disable-model-invocation: true`, so they cost nothing per
  session); 5 agents; one `Stop` hook (`make-check.sh`) on `implementer`; husky `pre-commit` and
  `pre-push`; the `mattpocock-skills` plugin referenced by name. 1 315 lines in all.
- **What every session pays before the first message:** root `CLAUDE.md` plus the four rules
  without `paths:` (`sdd.md`, `tooling.md`, `pull-requests.md`, `commits.md`): 202 lines, about
  2 770 tokens. `pull-requests.md` matters once per ticket; `sdd.md › Toolkit layout` and the
  `tooling.md › New workspace` checklist only when `.claude/` or a workspace is edited;
  `tooling.md` restates what `settings.json › deny`, `.gitignore` and `docs/knowledge/tooling.md`
  already enforce or own.
- **`paths:` globs.** `claude-md.md` matches `docs/**`, so every ticket edit loads it. `**/*.ts`
  on six rules also matches `node_modules/**/*.d.ts` and `repos/effect`; kept, see D1.
- **The `Stop` contract** (code.claude.com/docs/en/hooks): only exit 2 blocks; any other non-zero
  code lets the stop proceed. `make-check.sh` exits 1 when `cd` fails, so a wrong
  `CLAUDE_PROJECT_DIR` releases `implementer` with the gate unrun.
- **Fixed point.** The clone has no local `main`; skills and agents that name `main` fail with
  "ambiguous argument" and were worked around by hand in every run
  (`chat-core/verification.md › Lessons`).
- **Facts re-verified on 2026-10-20** against the current Claude Code docs: rules load as the
  roadmap entry recorded (`paths:` on read or edit, descriptions of user-invoked skills never);
  `paths` is the only field read from a rule, and a frontmatter that fails to parse loads the rule
  unconditionally; `PrePermissionRequest` is named `PermissionRequest`; `claude plugin eval` does
  not load project skills; `/skill-doctor` reports usage, not quality.
- **Judged, not redone:** the Effect rule split, `use-cases.md`, `naming.md`, the layer
  `CLAUDE.md` rewrites, `/explain` and the rounds rule, all landed during `chat-core`. The audit
  found each line backed by a commit, a `Decision:` or a review finding, so they stay.
- **Rejected lessons.** "`implementer` greps before a doc states a fact" duplicates
  `claude-md.md › One author per fact`, and the review caught both cases. "Toolkit changes on their
  own branch" restates `sdd.md › One ticket = one branch`; the breach was a recorded decision. "A
  `commit-msg` hook for `commits.md`" is dropped by the user: a format gate on every commit taxes
  work done without a ticket, for 5 misses in 77 commits that the review already caught.

- **Ticket folder order** (roadmap entry 13, taken in on 2026-10-21). `docs/tickets/` lists
  `2026-10-17_chat-core` above the earlier `2026-10-17_template-bootstrap`. Renaming only the newer
  folder does not help, since `-` sorts before `_`. On `main` each ticket is one squash commit, so
  a folder's start time comes from its first commit on the teaching branch. An old `Refs:` path
  still resolves with `git show <sha>:<path>`, and `git log --follow` finds the rename.

## Scope

- The `Stop` hook blocks on its own failure.
- Skills and agents name the fixed point as `git merge-base HEAD origin/main`.
- The always-loaded set shrinks: `pull-requests.md` behind `paths:`, `sdd.md › Toolkit layout`
  moved into `claude-md.md`, `tooling.md` trimmed to what nothing else enforces.
- `claude-md.md` loads for the living docs and the toolkit, not for ticket artifacts.
- Roadmap: entry 2 absorbed by this ticket, entry 3 done, the deferred items moved to entry 12.
- Ticket folders are named `<YYYY-MM-DD-HHmm>_<slug>`; the six existing folders are renamed.
- `settings.json` asks only before an act that is hard to undo or seen outside the machine.

## Out of scope

- The second wave, settled after this one is reviewed (see Open questions): the single author of
  the import direction, the `ticket-plan` and `implementer` lines, `make lint-docs`, Biome guards
  for browser-safe layers and the pure domain, and the small cuts.
- `claude plugin eval`, `/skill-doctor`, plugin pinning, `skillOverrides`, agent `memory`,
  `SessionStart` and `PostToolUse` hooks: `template-handoff` (roadmap entry 12). No recorded
  mistake would have been prevented by any of them.
- Product code, and the SDD gates themselves.
- Rewriting `Refs:` in commits already pushed, and a `make` check on folder names.

## Requirements

### The gate

- **R1** — IF `make-check.sh` cannot enter `CLAUDE_PROJECT_DIR`, THEN THE SYSTEM SHALL block the
  stop with exit code 2 and a message on stderr that names the cause.
- **R2** — WHERE a skill or agent names the fixed point of a ticket branch, THE SYSTEM SHALL name
  it as `git merge-base HEAD origin/main`, never as a bare `main`.

### What a session loads

- **R3** — WHEN a session starts, THE SYSTEM SHALL load at most 140 lines of root `CLAUDE.md` and
  rules without `paths:`; `pull-requests.md` SHALL load only for `.github/**`; the constraints of
  `sdd.md › Toolkit layout` SHALL live in `claude-md.md`; `tooling.md` SHALL state nothing that
  `settings.json › deny`, `.gitignore` or `docs/knowledge/tooling.md` already enforces or owns.
- **R4** — WHEN Claude edits a file under `docs/tickets/`, THE SYSTEM SHALL not load
  `claude-md.md`.

### The record

- **R5** — WHEN this ticket starts, THE SYSTEM SHALL link roadmap entry 2 to this folder, mark
  entry 3 done, and list the deferred toolkit items under entry 12. WHEN it takes in a later
  roadmap entry, THE SYSTEM SHALL link that entry to this folder.

### The ticket folders

- **R6** — WHEN `/ticket-feature` creates a ticket folder, THE SYSTEM SHALL name it
  `docs/tickets/<YYYY-MM-DD-HHmm>_<slug>/` with the local start time, so `ls docs/tickets` lists
  tickets in the order they started; every existing folder SHALL carry the time of its first
  commit on the teaching branch, and no tracked file SHALL name a folder by its old name.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | `echo '{}' \| CLAUDE_PROJECT_DIR=/nonexistent sh .claude/hooks/make-check.sh; echo $?` prints a message naming the directory and `2` |
| R2 | `git grep -nE -e '(^\|[^a-z/._<-])main([^a-z_-]\|$)' --and --not -e 'main session' --and --not -e 'no local .main.' -- .claude/skills .claude/agents` is empty; `git grep -n 'merge-base HEAD origin/main' -- .claude` lists `ticket-verify`, `verifier` and `explain` |
| R3 | `cat CLAUDE.md $(grep -L '^paths:' .claude/rules/*.md) \| wc -l` ≤ 140; `grep -c '^paths:' .claude/rules/pull-requests.md` is 1; `grep -n 'Toolkit layout' .claude/rules/sdd.md` is empty and `grep -n 'disable-model-invocation' .claude/rules/claude-md.md` is not; `grep -nE 'no-verify\|npm\|bun test\|tsc -b emits\|New workspace\|Double-quote' .claude/rules/tooling.md` is empty |
| R4 | the frontmatter of `claude-md.md` lists `docs/knowledge/**`, not `docs/**`; `claude --debug` shows no frontmatter parse error for `.claude/rules/*.md` |
| R5 | `docs/knowledge/roadmap.md`: the table row 2 links this folder, row 3 reads `done`, entry 12's Scope names evals, `/skill-doctor`, pinning, `skillOverrides`, agent memory and the extra hooks; row 13 links this folder |
| R6 | `ls docs/tickets` lists `2026-10-16-1433_monorepo-setup`, `2026-10-16-1607_effect-setup`, `2026-10-17-1508_template-bootstrap`, `2026-10-17-1748_chat-core`, `2026-10-19-1448_aws-local`, `2026-10-20-2313_claude-toolkit`, `_template` in this order; `git grep -nE '2026-10-(15_monorepo-setup\|16_effect-setup\|17_template-bootstrap\|17_chat-core\|19_aws-local\|20_claude-toolkit)' -- ':!docs/tickets/*claude-toolkit/'` and `git grep -n '<YYYY-MM-DD>_'` are empty |

## Open questions

Settled with the user after the first wave is reviewed; each accepted one becomes a requirement
here and a step in `plan.md`:

- The import direction has five authors (`biome.json`, root `CLAUDE.md`, `naming.md`, seven
  workspace `CLAUDE.md`, `architecture.md`): keep one for agents, or leave the cheap on-directory
  lines?
- `ticket-plan`: a step names a file or an API only after `researcher` confirmed it, and every
  literal the plan fixes is checked against the rules (49 *Amended in* notes in `chat-core`).
- `implementer`: a rule line added or sharpened comes with a `git grep` for what it forbids.
- `make lint-docs` on lines over 100 characters in the living docs; whether `docs/tickets/` is in.
- Biome guards for `node:`/`bun:` imports and `Bun`/`process` globals in the browser-facing layers,
  and `Date`/`crypto`/`fetch` in `domain`: no recorded agent mistake, but a hand grep in every
  verification.
- Agents read their step, not the whole ticket: in `chat-core` the implementer and both
  reviewers each read about 60k tokens of `feature.md`, `architecture.md` and `plan.md` per step,
  where the step and the `R…` and `D…` it cites hold 1–2k. A reading rule in `implementer` and
  `reviewer`, or one file per step: settled in the second wave.
- Small cuts: `sdd.md` round ids `S11.1` → `<step>.1`; the `http-api/CLAUDE.md` Layout line;
  three `effect-schema.md` lines that restate `domain/CLAUDE.md`; four `sdd.md` lines that restate
  `CLAUDE.md`; a `deny` on `--no-verify` instead of a rule line.
