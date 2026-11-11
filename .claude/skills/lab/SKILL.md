---
name: lab
description: "The lab: you lead a small cycle through lab.md and the chat, the agent keeps its rails"
argument-hint: "[<lab>] <task>"
disable-model-invocation: true
---

Run the lab task in `$ARGUMENTS` here, in the main session, on the rails of
`.claude/rules/lab.md`. No `implementer` writes for the lab: the owner's stop has to reach the
one who writes, and a subagent does not see the chat.

## Every call

1. **Pick the lab:** a first word that is a slug picks `docs/tickets/*_<slug>/lab.md`; else the
   ticket of the current branch `<type>/<slug>`. When `git worktree list` shows the ticket
   branch in another tree, the lab lives there: read and work through that path. With no lab,
   name `/lab init <topic>` and stop; `init` itself skips this step and the next.
2. **Read** that `lab.md`, `.claude/rules/lab.md` and
   `.claude/skills/ticket-implement/design-examples.md`, each whole and afresh: the owner edits
   them between calls.
3. **Owner check:** at a session's first call, ask whose the changes `git status --short` shows
   are; later, a change this session did not make is the owner's. Commit the owner's as an
   `OWNER` round of the step they touch before writing anything.
4. **Markers in code:** `git grep -nE '\[(Q|A|R|DO|D|!)\]' -- ':!docs/tickets' ':!repos'`; move
   each comment's marker into its step's Notes with its `path:line`, then delete the comment.
5. **Run the task** below. After each write to `lab.md`, one chat line says what it wrote.

## Tasks

- **`init <topic> [worktree]`:** the slug is the topic in kebab case, the type (`feat`, `fix`,
  `refactor`, `chore`, `docs`) the kind of change, both named in the chat line. The folder is
  `docs/tickets/<now YYYY-MM-DD-HHmm, local time>_<slug>/`, the branch `<type>/<slug>` cut from
  `main`. Without `worktree`: `git switch -c <type>/<slug> main` in the main tree, once
  `git status --short` is empty. With it: `git worktree add -b <type>/<slug>
  .claude/worktrees/<slug> main`, then, inside it, `make worktree N=<n> NAME=<slug> KEEP=1` with
  the lowest `<n>` it accepts; from there on, this call included, work through that path, and
  the Flow line names it in full. Write `lab.md` from `docs/tickets/_template/lab.md` with the
  topic as its title, commit it as `L0.1 Start the lab`, and ask the owner for the Intent.
- **`step <goal>`:** ask "can you write the signature now?": no makes a `learn` step, yes a
  `build` step; in a mixed task the unknown parts come first, as learn steps. Its pass
  (`.claude/rules/sdd.md › Gates`) is `minimal` until the minimal feature has been played. Add
  the step's section from the template and its Map row. In an unfamiliar area, find the reference example
  (the library's docs, `repos/`), run it as is, write how into Reference, and propose the budget;
  the Budget line is written once the owner names it.
- **`answer`:** every open marker: an owner's marker with no `[A:ai]` or `[N:ai]` under it, a
  `[D]` not yet in Knowledge. `[!]` first, then `[Q]`, `[DO]`, `[D]`, and `[R]` last, sent out:
  - `[!]`, or a stop phrase: stop everything running and run the deletion audit of rail 3;
  - `[Q]`: an `[A:ai]` now, from the code and `repos/`, or turned into `[R]` with the reason;
  - `[DO]`: the piece, draft, Shape draft or example it asks for, as `implement` does;
  - `[D]`: its line in Knowledge, in the commit that settles it.
- **`research <q>`:** write `[R] <q>` into the step's Notes and spawn a `researcher` in the
  background, on `opus high`: the question as asked, stripped of the owner's guess at the answer,
  and the paths it concerns. At a key fork in an unfamiliar area, spawn a second on the same
  brief. Each answer lands as an `[A:ai]` with its sources, or in the chat, as the owner asked;
  where the two differ, show both and the run that would decide.
- **`implement [L<n>]`:** the step named, else the Map's step in progress. It needs the owner's
  Shape or contract; without one, ask, or draft the Shape on a `[DO]`. Before the first piece,
  ask the five questions aloud (rail 5); in an unfamiliar area, check the Reference ran and the
  Budget is named (rail 4). Then one piece at a time, each within rail 4:
  its test first (as `test` does), the body, `make check`, the round's commit
  (`.claude/rules/commits.md › A ticket's rounds`), its `[N:ai]` line in Pieces, and a `Later`
  line for each issue it noticed and left; show the owner the diff and wait for the word before
  the next. A learn step's draft runs in its own worktree: `git worktree add -b wt/<name>
  .claude/worktrees/<name> HEAD`, then, inside it, `make worktree N=<n> NAME=<name>`; it never
  commits onto the ticket branch.
- **`test [L<n>]`:** a test per contract of the step's Shape, at its Seam, in an existing
  `__tests__/` or `__e2e__/` folder, as `it.effect.fails` while the body is `Effect.die('todo')`;
  `make check`, the round's commit and its `[N:ai]` line.
- **`close [L<n>]`:** a step: a build step only after its visible check ran and `/lab-review`
  covered it (rail 7). Propose its Output, as the template says; on the owner's yes, collapse the
  step to its heading and Output, set its Map row `done`, add its accepted lines to Knowledge, and
  commit as an `OWNER` round. A learn step's draft worktree then goes, in a command of its own:
  `make reset` inside it, `git worktree remove --force`, `git branch -D wt/<name>`.
  Without an id, once every step is `done`, the whole lab: fill Numbers as below, propose which
  Knowledge outlives the lab and moves to `docs/knowledge/`, and commit as the next `L0.<round>`
  with `OWNER`. Each `Later` item still open is a question first: done as a step, a roadmap
  entry, or dropped. The PR waits for the owner's word.
- **Free text:** the owner's move, read as the marker it would be, a stop phrase among them.

## Numbers

Count each from git, quoting the command:

- **Time:** from the `L0.1` commit to the PR's opening (`gh pr view`), or to now.
- **Lines against budget:** per step, `git diff --shortstat` over its rounds beside its Budget.
- **Rework:** the lines the step's `OWNER` rounds change outside `lab.md`.
- **Stops by signal:** each stop is an `[N:ai] Stop (<signal>): <what went>` line in Notes,
  counted from `git log -p -- <lab.md>`; the signals are the owner's word and rail 3's.
- **Claims without a source:** the agent's "I assume" lines in that same history.
