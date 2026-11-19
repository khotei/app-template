# One flow

Flow: lab · Base: 76c71ea595 · Worktree: /Users/v/lab/app-template/.claude/worktrees/one-flow
(N=50)

## Intent

The owner's order, 2026-11-18: review the lab and SDD, make them minimal and of the best quality
Claude offers, merge them into one flexible way with a micro and a macro scale, and include
agents in the flow.

The shape, from §1 of the panel's final design, which the owner took:

- **One skill, `/lab`, replaces seven:** the five `/ticket-*` skills, `lab` and `lab-review`.
  `review-brief` stays. The rules `sdd.md`, `lab.md` and `rounds.md`, the `verifier` and four
  templates go.
- **Two sizes, one build loop.** Micro: a branch alone, a plan of at most five lines, the owner's
  go once, then the pieces run through to one review. Macro: one `lab.md`, a Shape per step,
  built with the owner piece by piece, or by an `implementer` once the Shape is settled. Both
  build the same way: a red test first, green unit commits as rounds, a check the owner can
  repeat.
- **Review runs once per range, in fresh contexts:** Intent and Hunt on `opus high`, Rules on
  `sonnet medium`; a docs, config or move range gets Intent and Rules only; Design runs on
  request. A `hard` rule break is fixed, a `judgement` one becomes a `Later` line; a claimed bug
  is settled by its own red test; each review writes one yield line.
- **The `verifier` goes; its two recorded catches stay** with the branch review: Intent over the
  whole branch (an answer a caller sees, changed with no requirement asking, and a widened
  assertion), Hunt (a guard a re-export bypassed). Replay R3 holds this.
- **Numbers come from a script,** `make numbers`.

## Map

| Step | Goal, and how to see it | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | Baseline: today's toolkit measured before it changes · visible: L1's table of replays and the rebase probe | minimal | learn | in progress |
| L2 | The toolkit: one skill, its agents and `make numbers`; the five-phase cycle gone · visible: `make check`; `git grep` of each removed name outside `docs/tickets/` answers only the new record | minimal | build | in progress |
| L3 | The stops: a before → after pair in `stops.md` for each recorded owner stop whose before and after the record holds, each on the owner's OK · visible: `.claude/skills/lab/stops.md` | minimal | build | in progress |
| L4 | Acceptance: R1–R5 on the new toolkit beside L1's table; a case that got worse is fixed or its part reverted · visible: the table | right | learn | todo |
| L5 | Later: the items of the open list the owner picks | hard | build | todo |

## L1 — Baseline

### Shape

- The replays R2, R4 and R5, three runs each on today's toolkit (`refactor/design-audit`), with
  their grades, tokens and wall-clock; R1 and R3 graded against the record.
- `git rebase -x 'make check'` over `feat/shared-files`' commits in a clone with Docker running:
  a red commit means the main session needs a `make check` Stop hook.
- Roadmap entries 8, 25 and 29 marked done.

### Notes

[N:ai] Roadmap entries 8, 25 and 29 are already done on this base: `refactor/design-audit`'s
`docs(docs): Cut the roadmap's finished entries to rows` marked them and cut their sections
(`docs/knowledge/roadmap.md:42`, `:59`, `:62`), so L1 marks nothing.
[N:ai] The rebase probe, in a `git clone --local` under the session's scratch directory with
Docker running: `git rebase -x` over `feat/shared-files`' 34 commits, its L0.1 to its L3.3, the
exec running `make check` and logging each commit's exit code and time so that one red would
not stop the rest. All 34 exit 0, each with both the unit and the e2e suite run, 14–34 s a
commit, 630 s in all; the picks fast-forwarded, so no commit changed. The clone needed no `N`:
the e2e suites start their containers by testcontainers on free ports, and none was left after
the run. By the Shape's rule, no red commit: the main session needs no `make check` Stop hook.
[N:ai] The replays R1–R5 run apart, by other agents, on `refactor/design-audit` and on
`chore/one-flow`; their table lands in Output.

### Output

## L2 — The toolkit

### Shape

Five green units, in this order, which together are the design's edits:

1. `make numbers`: `.claude/skills/lab/numbers.sh`, `worktree.sh` moved into
   `.claude/skills/lab/`, and every `Makefile` hunk.
2. The one skill and its agents: `lab/SKILL.md`, `stops.md`, the three agents and the template,
   beside the old skills.
3. The record `One flow, sized at intake` in `docs/knowledge/decisions.md`, before the deletions,
   since the old record names the files they remove.
4. The five-phase cycle dropped: the deletions, the guide's rewrite and every pointer to what
   goes.
5. The ask list of `.claude/settings.json`: every force and delete form of `git push` asks, a
   plain push and `gh api` run.

Then `/lab review L2`; Rules also gets `mattpocock-skills:writing-for-agents`.

### Notes

[N:ai] L2.1–L2.5 are the five units; each state passed
`make doc-lint link-check sh-lint lint`. `stops.md` came in L2.2 with its questions alone; its
three seeded pairs are L3.1's. `/lab review L2` waits.

### Output

## L3 — The stops

### Shape

A before → after pair on an `Order` and one line why, for each recorded owner stop whose before
and after the record holds (lambda 2, reply-run 2, shared-files 4; telemetry's one was a budget),
each on the owner's OK. Three are seeded by the design.

### Notes

[N:ai] L3.1 writes the design's three seeded pairs into `stops.md`, each still on the owner's OK:
"One noun, and the path says what a delete means" (shared-files L0.3, the owner's stop on the
`/files` routes and the word File); "A use case writes only what its own actor owns" (lambda,
the rollback of piece 1, whose send still reserved the reply's id); "Reuse by a record that
names its source" (shared-files L0.15–L0.19: one table of links, then a copy of the bytes, gave
way to a record per use that names its source).
[N:ai] The other recorded stops, each with its before and after from the record; an accepted one
is written on an `Order` like the three.
[Q:ai] reply-run L2, the owner's stop "minimal working code base, without this massive checks":
before, a recovery after the commit (`failReply` with its `catchTag`, `Effect.uninterruptible`,
a log of the title send); after, a refused send dies with `500` and leaves the reply queued, as a
process that dies does. A pair "A failure after the commit is not recovered in place: it dies as
a crashed process would"?
[Q:ai] reply-run L2.2, the owner's stop "why we need this id?": before, `JobSender.send` takes
the caller's `{ id }` for a later `onFail`; after, the job keeps its own id, and only its body
`{ runId }` ties it to the Run. A pair "A job keeps its own id; what it works on is named in its
body"?
[Q:ai] shared-files L0.16, the bind to a chat, after the owner's answer to the audit's
duplicates: before, an attachment bound to a chat beside its binds to messages, so a chat read
it once per bind; after, a file hangs on a message and a
chat's files are its messages', as in Claude's Compliance API. Shared-files L3.1 later let a
chat hold an unsent upload, so this pair's after needs your wording. A pair "One bind per use;
a chat reads its files through what holds them"?
[Q:ai] lambda, the stopped researcher ("no need, just split it as planned"): a stop of a move,
with no shape before or after. I propose no pair.

### Output

## L4 — Acceptance

### Shape

R1–R5, three runs each on the new toolkit, beside L1's table. A case that got worse is fixed or
its part reverted: R2 worse brings back the old hunt brief; R3 worse brings back one `verifier`
at a macro's close; R4 no better deletes `stops.md`; R5 worse strengthens rail 2.

### Notes

### Output

## Knowledge

The owner's answers to the design's questions, 2026-11-18:

- [D] Build now on `refactor/design-audit`, which has not reached `main` yet; the merge waits for
  the owner.
- [D] A change request typed without `/lab` routes to the lab, by one line in `CLAUDE.md`.
- [D] A micro shows its plan and waits once for the owner's go.
- [D] The replays R1–R5 run before the merge.
- [D] The memories are rewritten at the lab's close.

## Numbers

## Later

- The ask patterns with a wildcard in the middle (`Bash(git push * --force*)`) are not tried
  against a live prompt — L2 — open
- After the merge, the main tree's uncommitted edit of `.claude/settings.json` is restored with
  `git restore .claude/settings.json` there, on the owner's word, before the pull — L2 — open
