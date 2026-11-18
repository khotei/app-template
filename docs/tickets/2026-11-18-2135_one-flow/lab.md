# One flow

Flow: lab · Worktree: /Users/v/lab/app-template/.claude/worktrees/one-flow (N=50)

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
| L2 | The toolkit: one skill, its agents and `make numbers`; the five-phase cycle gone · visible: `make check`; `git grep` of each removed name outside `docs/tickets/` answers only the new record | minimal | build | todo |
| L3 | The stops: a before → after pair in `stops.md` for each recorded owner stop whose before and after the record holds, each on the owner's OK · visible: `.claude/skills/lab/stops.md` | minimal | build | todo |
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

### Output

## L3 — The stops

### Shape

A before → after pair on an `Order` and one line why, for each recorded owner stop whose before
and after the record holds (lambda 2, reply-run 2, shared-files 4; telemetry's one was a budget),
each on the owner's OK. Three are seeded by the design.

### Notes

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
