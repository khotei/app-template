---
name: lab
description: "Build a change with the owner in the loop: micro on a branch alone, macro with a lab.md in docs/tickets/"
argument-hint: "[<lab>] [init <topic> | step <goal> | implement [L<n>] | run L<n> | research <q> | review [L<n> | all] [design] | close [L<n>] | <your move>]"
disable-model-invocation: true
---

Run the move in `$ARGUMENTS` here, in the main session. The owner leads: the intent, the shape,
the decisions, the order of moves, a stop at any time in any words. You keep the rails; only the
owner's explicit word lifts one, for one step.

## The rails

1. **The owner's edits first.** Before you write anything, read `git status --short`. At the
   session's first move, ask whose the changes are; later, a change this session did not make is
   the owner's. Commit the owner's as an `OWNER` round of the step they touch.
2. **No by default.** A proposal to add something says what the system loses without it. No
   timeout, cap, retry or guard that the intent or a `Later` item the owner picked does not name.
   When a review finds an edge case in code this branch wrote, first try deleting its cause.
3. **Stop.** `[!]`, or a phrase such as "too much", "hack?", "do we need this?", stops the whole
   move; then show by a run what goes: delete the candidate, run, show what broke. Stop yourself
   on something not asked for, the same thing fixed twice, or a test weakened; after two failed
   fixes, go back to the intent. Each stop is a line `[N:ai] Stop (<signal>): <what went>` in the
   step's Notes.
4. **Red, then green.** A behaviour is first a failing test through the interface the Shape
   names, in an existing `__tests__/` or `__e2e__/` folder (`it.effect.fails` over
   `Effect.die('todo')` while the body is missing). A check is first seen failing on the break it
   is meant to catch.
5. **Small, honest commits.** A piece is what the owner reads at one sitting, about 100 lines of
   code with its tests apart; a step past ~400 splits. Each unit commits once `make check` is
   green, before the owner reads it (`.claude/rules/commits.md`). A commit the owner has seen is
   never amended or squashed: revert it while it is the branch's last, else fix forward. The
   owner's "don't commit" holds until their next "commit", which covers only what exists then.
6. **Facts are yours, decisions the owner's.** Answer a question from the code and `repos/`, or
   send it to a `researcher`; ask the owner only to decide. A claim carries its `path:line` or its
   run, else says "I assume".
7. **Done is visible:** a command or link the owner can repeat, `make check` green, and the
   step's review settled; a case seen only on a stub is not fixed.
8. **On the owner's word.** Each move starts on it; a PR and a merge wait for it.

## Passes and `Later`

A feature runs in three passes, each on the owner's word: **minimal**, the whole feature in its
smallest form, sliced vertically, played end to end from a script the owner can repeat;
**right**, its design adjusted to what the play showed; **hard**, the items of `Later` the owner
picks. `Later` is the open list of edge cases, error paths, hardening, open questions and
optimisations: whoever notices one writes it there at once with its `path:line`. Never deferred:
a security hole, a loss of stored data, an irreversible contract. Before the PR, each item is
done, moved to the roadmap's `Later`, or dropped on the owner's word.

## Micro or macro

When no lab holds the change, size it once and say which in one line; the owner's word overrides:

- **Micro** fits one session: at most ~400 changed lines of code and tests; no new dependency, and
  no new table, route or message that another process reads; every choice in it already settled
  by the owner's words or the code; a signature the owner can write now. Moving code within a
  module is micro. No ticket folder: once `git status --short` is empty, cut `<type>/<slug>` from
  `main`, say the plan in at most five lines (the pieces, each one's test and visible check) and
  wait for the go. Then build the pieces through to the end without waiting between them, here or
  handed to an `implementer` as `run` does; the owner's request stands for Intent and Shape and is
  quoted in the first commit's body. Then `review all`, and show the diff's stat, the review and
  `make numbers`; its `Later` lines, `[D:ai]` blocks and stops go into that report, and the PR
  carries the review's yield, `make numbers` and the open `Later` lines. A subject carries the
  area as its scope and, past the first pass, opens with its source alone
  (`(REVIEW) Read the row first`); a fix's body opens
  `Fixes "<the fixed commit's subject>": <what was wrong>`, never a hash.
- **Macro** is everything else: `init`. A micro that breaks a condition midway stops, says which,
  and becomes macro on its branch, its commits so far standing as `L1`.

## Every move

1. **Pick the lab:** a first word that is a slug picks `docs/tickets/*_<slug>/lab.md`; else the
   lab of the current branch `<type>/<slug>`. When `git worktree list` shows that branch in
   another tree, work through that path. With no lab and no `init`, size the change.
2. **Rail 1.**
3. **Read** `lab.md` whole at the session's first move and after a compaction; later, the step's
   section and the diff of each `OWNER` round rail 1 made.
4. **Markers in code:** `git grep -nE '\[(Q|A|R|DO|D|!)\]' -- ':!docs/tickets' ':!repos'`; move
   each into its step's Notes with its `path:line`, and delete the comment.
5. **The move**, below. After each write to `lab.md`, one chat line says what it wrote.

## The file

`docs/tickets/<YYYY-MM-DD-HHmm>_<slug>/lab.md`, from `docs/tickets/_template/lab.md`. The owner
writes the Intent, each Shape and each `[D]`, in any language; you never rewrite an owner's line.
The Map is the only place for a step's status. A closed step keeps only its Output; the rest
stays in git, each round named by its id, never by a hash. Markers: the owner's `[Q]` question,
`[A]` answer, `[R]` research, `[DO]` task, `[D]` decision, `[!]` stop; yours end in `:ai`:
`[Q:ai]`, `[A:ai]`, `[D:ai]` (a proposal until the owner makes it `[D]`), `[N:ai]` (a note).

## Moves

- **`init <topic> [worktree]`:** the slug is the topic in kebab case, the type (`feat`, `fix`,
  `refactor`, `chore`, `docs`) the kind of change. Cut `<type>/<slug>` from `main` once
  `git status --short` is empty (a micro's branch stays as it is); with `worktree`,
  `git worktree add -b <type>/<slug> .claude/worktrees/<slug> main`, then
  `make worktree N=<n> NAME=<slug> KEEP=1` inside it, and work through that path from then on.
  A roadmap entry of the slug seeds the Intent: a `researcher` re-checks its dated facts, and its
  status becomes a link to the folder. Write `lab.md`, commit it as `L0.1 Start the lab`, and ask
  for the Intent. While the Intent leaves the first step's goal open, grill with
  `mattpocock-skills:grilling` until each Map row has a goal the owner can see.
- **`step <goal>`:** ask "can you write the signature now?": no makes a `learn` step, yes a
  `build` step; in a mixed goal the unknown parts come first. Its pass is `minimal` until the
  whole feature has been played. In an unfamiliar area, run the reference example (the library's
  docs, `repos/`) as is, write how into the step's Reference, and propose a budget of reference +
  N lines; an overrun stops and asks. A bug's step starts from one command that shows it failing,
  found by phases 1 and 2 of `mattpocock-skills:diagnosing-bugs`; that command is its visible
  check.
- **Your move, or none:** a phrase is the marker it would be. With none, answer each open marker,
  in this order: `[!]` by rail 3; `[Q]` as an `[A:ai]` now, or as an `[R]` saying why it needs a
  run or wide reading; `[DO]` as `implement` does; `[D]` as its line in Knowledge, in the commit
  that settles it; `[R]` as `research` does.
- **`research <q>`:** `[R] <q>` in the step's Notes, and a `researcher` in the background on
  `opus high`, given the question without the owner's guess and the paths it concerns. At a key
  fork in an unfamiliar area, a second on the same brief; where they differ, show both and the
  run that would decide. Each answer lands as an `[A:ai]` with its sources.
- **`implement [L<n>]`:** the step named, else the Map's step in progress. It needs the owner's
  Shape; without one, ask, or draft it on a `[DO]`. At every Shape, read [stops.md](stops.md)
  and ask its questions aloud; one that fails becomes a `[Q:ai]`. A learn step's draft lives in
  its own worktree (`git worktree add -b wt/<name> .claude/worktrees/<name> HEAD`, then
  `make worktree N=<n> NAME=<name>` inside it) and never reaches the ticket branch; only its
  answer and proof come back, a command or a snippet of at most 20 lines. A build step goes one
  piece at a time: its test (rail 4), its body, its rounds, a `Later` line for each issue it
  leaves; show the diff and wait for the word.
- **`run L<n>`:** a build step whose Shape the owner has settled goes to an `implementer`, on
  `opus high` (`opus medium` for a move, rename or config step), given the folder, the step id,
  its first round's id and, in a worktree, the order to read rules from that tree. First tell the
  owner in a few lines what the step will produce: each file or rule it changes, and how. A
  report that starts with `BLOCKED:` goes to the owner as a question, its red unit left in the
  tree. After any other, `make check` is green, `git log` since its start lists exactly the
  reported rounds and the tree is clean, else send it back. Then `review`, its fixes sent to the
  same `implementer` as one fix pass; then propose the Output and present the step, its rounds,
  findings and duration. Several settled steps run unattended only on the owner's word, as a
  workflow that gives each step to an `implementer` this way.
- **`review [L<n> | all] [design]`:** as **Review** says.
- **`close [L<n>]`:** a build step closes once its visible check ran and its review is settled.
  Propose its Output, and for each stop whose fix the owner accepted, its before → after pair for
  [stops.md](stops.md). On the owner's yes, collapse the step to its heading and Output, set its
  Map row `done`, add its accepted lines to Knowledge and the pairs to `stops.md`, and commit it as
  the step's next round, with no source: a close is no rework. A learn step's worktree then goes:
  `make reset` inside it, `git worktree remove --force`, `git branch -D wt/<name>`. The whole lab,
  once every step is `done`: run every Map row's visible check and show the output, `review all`,
  fill Numbers from `make numbers SLUG=<slug>` (`RANGE=<Base>..HEAD` when `lab.md` names a Base),
  each step's budget beside its lines, propose what of Knowledge moves to `docs/knowledge/` (terms
  to the glossary, a binding rule to a record of `docs/knowledge/decisions.md`), ask each open
  `Later` item's fate, mark the slug's roadmap row done with a link to the folder and cut its
  entry's section, propose the lessons, and commit as the next `L0` round. The PR waits for the
  owner's word (`.claude/rules/pull-requests.md`).

Each spawn names its model and effort; choose `fable` instead where a wrong answer would pass
every later check, and say so.

## Review

One round per step or branch, in fresh contexts; no pass runs again unless the owner asks.

1. Rail 1; commit your own open piece; `make check` green.
2. **The range** is `git diff <base> <end>`: for `L<n>`, from the parent of the step's oldest
   round to its newest, both found by the subject search of **Rounds**; for `all` and a micro
   change, from the Base `lab.md` names, else `git merge-base main HEAD`, to `HEAD`.
3. **A `reviewer` per pass, in parallel**, each brief naming its pass, the range, its sources, the
   word limit of 400 and the findings already rejected on this range, and nothing else. A range
   of docs, config or moves alone gets Intent and Rules, and Hunt too when it changes a guard (a
   lint config or plugin, a manifest's `exports` or dependencies, a permission list, a hook).
   - **Intent**, on `opus high`: the step's goal, Shape and Knowledge (for `all`, the Intent, the
     Map and Knowledge; for a micro change, the owner's request quoted), the range's files and
     their callers;
   - **Hunt**, on `opus high`: the range's files, their callers and, for a test fake, the adapter
     it stands in for;
   - **Rules**, on `sonnet medium`: the output of `make review-rules BASE=<base>` pasted as is,
     and the `CLAUDE.md` of each touched workspace; on an instruction file, also
     `mattpocock-skills:writing-for-agents`;
   - **Design**, only given `design`, on `opus high`: the range's files and their callers,
     [stops.md](stops.md), `.claude/rules/deep-modules.md`, `docs/knowledge/architecture.md`
     and the records of `docs/knowledge/decisions.md` that bind those files.
4. **Decide** on each finding as its report states it:
   - it breaks the intent, or is of a kind never deferred: fix it, a behaviour one test first; a
     test that stays green refutes it, so drop it and say so, quoting the test;
   - a rule finding marked `hard`: fix it; marked `judgement`: a `Later` line, or rejected;
   - its fix changes the shape (a signature, a module, a type, what a test asserts), and every
     Design candidate: a `[D:ai]` in Notes with its `path:line`, its scenario, `shown` or
     `claimed` as the report marks it, and what the system loses without it;
   - the feature runs without it: a `Later` line; any other: rejected, with one reason. A
     `claimed` bug is rejected only by a run: its input as a test that stays green, quoted.

   Each fix is its own `REVIEW` round, rail 2 first; a fix that adds a test helper, a fake or a
   wrapper is replaced by a plainer test. After `run`, the fixes go to its `implementer`.
5. **Report:** the `REVIEW` rounds; each `[D:ai]` as one block (what is wrong, what it leads to,
   the options with their cost, your recommendation, the question); the rejected findings. Then
   the yield, as a line in the step's Notes, or the micro's PR body:
   `[N:ai] Review L<n>: Intent <found>/<rejected>, Hunt <f>/<r>, Rules <f>/<r>`, then
   `, Design <f>/<r>` when it ran; a refuted finding counts as rejected.

## Rounds

- **The id** opens the subject: `L<step>.<round>` (`L2.3 Refuse a duplicate order`); `L0` is the
  lab itself, its start and its close. Past the first pass a source follows: `(OWNER)` the
  owner's word or edit, `(REVIEW)` a review's finding. A fix's body opens
  `Fixes L<n>.<r>: <what was wrong>`; a revert's subject names each round it reverts.
- **A step's rounds**, by subject:
  `git log -E --grep='^:[a-z0-9_-]+: [a-z]+\([^)]*\): (L[0-9]+\+)*L2(\+L[0-9]+)*[. ]'` finds
  `L2.1` and `L1+L2`, not `L21`.

## Lessons

A lesson is a mistake that recurred in this lab (a stop, a `REVIEW` round, a rejected finding).
A product one becomes a pair in [stops.md](stops.md); a toolkit one proposes a check, or a line
that replaces one it names. Apply each on the owner's OK.
