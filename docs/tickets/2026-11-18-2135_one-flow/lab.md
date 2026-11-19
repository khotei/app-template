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
| L2 | The toolkit: one skill, its agents and `make numbers`; the five-phase cycle gone · visible: `make check`; `git grep` of each removed name outside `docs/tickets/` answers only the new record and the guide | minimal | build | in progress |
| L3 | The stops: a before → after pair in `stops.md` for each recorded owner stop whose before and after the record holds, each on the owner's OK · visible: `.claude/skills/lab/stops.md` | minimal | build | in progress |
| L4 | Acceptance: R1–R5 on the new toolkit beside L1's table; a case that got worse is fixed or its part reverted · visible: the table | right | learn | in progress |
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
[N:ai] The baseline runs are the Old column of L4's table: R2, R4 and R5 three times each on
76c71ea595; R1 and R3 graded against the record.

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
[N:ai] Three verifiers of the workflow read L2 against the design, the replays and live runs, in
place of `/lab review L2`'s passes. Their findings, fixed as L2.6–L2.19 (REVIEW) and L4.1: the
implementer's gate was inert in auto mode and let a "No such file" red through in manual mode; a
`BLOCKED:` report went back to the agent; the ask list missed `--mirror`, `--prune`, `-uf` and a
push to `main`, and its `:*` refspec pattern matched nothing; a micro had no fix form, no home for
its notes and no clean cut; a `claimed` bug could be rejected on argument; a lab cut from another
branch reviewed and counted from `main`; the Hunt's yield dropped out of Numbers; the guard-probe
lessons went with `guard-probes.md`; a spawned agent started outside the lab's tree; the marker
search found the skill itself; the roadmap row was marked by no move; the record and the guide
claimed more than the replays showed; and smaller leftovers. Rejected: rail 8's wording for a
push to `main`, since the ask list holds it; `gh api` on the ask list, which the owner's own edit
dropped; a troubleshooting row for auto mode, moot once the gate holds there; the template's
smaller repeats of the skill, which guide each new `lab.md`.
[Q:ai] Do these verifiers stand for `/lab review L2`, or does it run over L2.1–L2.19?

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

[N:ai] The replays, each in its own `git clone --local`, `claude -p --model opus`, stdin closed;
old is `refactor/design-audit` at 76c71ea595, new this branch at L1.1 (bc02bb18e2), and R4 again
at L4.1. Times are the transcript's first to last timestamp, R4's the JSON's `duration_ms` (no
subagents); costs are per run.

| # | Passes when | Old | New | Grade |
|---|---|---|---|---|
| R1 | micro #24: lines within ±30% of +67 −10, no ticket file, no gate red that was green | the record: +67 −10 and a 74-line `plan.md` | 3 of 3: +64–65 −10, no file under `docs/`, each sized micro and waited once for the go; $2.11–2.62, 314–478 s | pass |
| R2 | the hunt names the Binary `traceparent` at least as often as old | 0 of 3; $2.03–2.38, 333–392 s | 3 of 3, Intent too; $3.38–4.20, 453–943 s | pass |
| R3 | Intent names `{id}` → `{ids}` and the race's 500 with its widened assertion, 2 of 3 | the record: one verifier run named all three | 2 of 3, the third missed the widened assertion; the Hunt named the manifest gap 0 of 3; $4.24–5.09, 878–1049 s | pass |
| R4 | no second noun, link table or copy of bytes in 2 of 3, fewer faults than old | 3 faults: a link table in each run, one noun in each; $0.68–1.13, 268–391 s | 6 faults: a second noun and a link table in each, `stops.md` never read; $0.54–0.69, 126–145 s | worse |
| R4 at L4.1 | the same | | 0 faults in 3 of 3: one noun, a record naming its source, the bytes once; `stops.md` read in each; $0.66–0.80, 100–135 s | pass |
| R5 | "cap the read of an error body" goes to `Later` or to deleting its cause, never into a fix, 2 of 3 | 0 of 3: two put a timeout into the fix, one never raised it; $2.87–4.38, 8–10 min | 3 of 3 to `Later`, two recommending to delete the cause; $2.56–2.73, 10–10.5 min | pass |

[N:ai] R4 got worse because `stops.md` went unread, not because of what it says: the old runs read
their examples, the "One noun" stop among them, on every call. L4.1 moved the read to every move
that drafts a Shape or a design, and R4 passed.
[D:ai] Keep `stops.md`: the Shape's "R4 no better deletes `stops.md`" assumed a file read and
ignored, while R4 measured it unread; read, it took the faults from 6 to 0. It goes when a replay
shows it read and changing nothing.
[N:ai] The Intent's "Replay R3 holds this" holds for the first catch only; the second, a guard an
import gets past, now rests on the guard-probe line of `.claude/rules/tooling.md` (L2.13), with no
replay.
[N:ai] R5 new-2's code round, red in its after-check's e2e while six runs shared the machine,
passed `make test-e2e` alone: 110 of 110. The replay check's pattern could not match
`[test-e2e]`; it is fixed in the scratch scripts.
[N:ai] The implementer's gate, live in this worktree in auto mode: a probe agent whose
frontmatter wires the hook on SubagentHandback to deny once handed back twice, "pong" denied and
"pong2" delivered. The replays cannot show it: an untrusted clone runs no frontmatter hook.

### Output

## Knowledge

The design's five questions, answered by the workflow's orchestrator on the owner's word to
proceed, 2026-11-18; each is the owner's `[D]` once the owner confirms it:

- [D:ai] Build now on `refactor/design-audit`, which has not reached `main` yet; the merge waits
  for the owner.
- [D:ai] A change request typed without `/lab` routes to the lab, by one line in `CLAUDE.md`.
- [D:ai] A micro shows its plan and waits once for the owner's go.
- [D:ai] The replays R1–R5 run before the merge.
- [D:ai] The memories are rewritten at the lab's close.

## Numbers

## Later

- The ask patterns with a wildcard in the middle (`Bash(git push * --force*)`) are not tried
  against a live prompt — L2 — done in L2.7: tried in a headless session, which also showed
  `Bash(git push * :*)` matching nothing
- R1, R2, R3 and R5 ran before L2.6–L2.19 changed the skill again; only R4 ran after — L4 —
  open
- After the merge, the main tree's uncommitted edit of `.claude/settings.json` is restored with
  `git restore .claude/settings.json` there, on the owner's word, before the pull — L2 — open
