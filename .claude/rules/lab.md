---
paths:
  - "docs/tickets/**/lab.md"
---

# The lab

The lab is the small cycle beside SDD: the owner leads through `lab.md` and the chat, the agent
keeps the rails. Freedom is the owner's: the intent, the shape and the contract, any order of
moves, the decisions, a stop at any time in any words. The rails are the agent's and always on;
only the owner's explicit word lifts one, for one step. A lab step follows this rule, not the
round and commit-gate lines of `.claude/rules/sdd.md`. The procedures: `/lab`, `/lab-review`.

## The file

- `lab.md` sits in the ticket folder beside any SDD file, on the ticket branch `<type>/<slug>`,
  started from `docs/tickets/_template/lab.md`; its `Flow: lab` line names the cycle.
- **Map** is the only place for a step's status. A closed step collapses to its Output, the rest
  stays in git. No commit hashes: a round is named by its id.
- The owner writes in any language (docs are otherwise English); the agent's follow the owner's.

| Part | Writer |
|---|---|
| Intent, Shape, Notes, `[D]` | the owner; a Shape draft by the agent on a `[DO]` |
| `[Q:ai]`, `[A:ai]`, `[D:ai]`, `[N:ai]`, the Map's statuses | the agent |
| Output | the agent proposes, the owner accepts |
| Knowledge | the agent: only an accepted `[D]` or Output, in the commit that settles it |
| Later | the agent and the owner: the open list of `sdd.md › Gates`, an item with its fate |

The agent never rewrites an owner's line, and reports each write to the file in one chat line.

## Markers

- The owner's: `[Q]` question, `[A]` answer, `[R]` research, `[DO]` task, `[D]` decision, `[!]`
  stop. The agent's always end in `:ai`, so `grep ':ai]'` and a diff show its lines: `[Q:ai]`,
  `[A:ai]`, `[D:ai]` (a proposal until the owner makes it `[D]`), `[N:ai]` (a piece, a step's
  output, a review finding the agent fixed).
- A marker in a code comment moves into the step's Notes with its `path:line`; the comment goes.
- `[Q]` is answered at once from the project's code and `repos/`; one that needs a run or wide
  reading becomes `[R]`, saying why. `[R]` goes to a `researcher` in the background; its answer
  lands as `[A:ai]` under it, or in the chat, as the owner asks.

## The rails

1. **Source.** A claim carries a `path:line` or a run, else it says "I assume". A researcher gets
   the question without the owner's hypothesis. At a key fork in an unfamiliar area, a second
   researcher takes the same question as a second opinion; where they differ, a run or the owner
   decides.
2. **No by default.** Each proposal to add something says what the system loses without it.
3. **Stop.** `[!]`, or a phrase such as "too much", "hack?", "do we need this?", in the chat or
   the file, stops the whole task, not one part of it. A deletion audit by a run follows: delete
   the candidate, run, show what broke. The agent stops itself on Beck's three signals: something
   not asked for, the same thing fixed twice, a test weakened. Two failed fixes go back to the
   intent.
4. **Volume.** A piece is at most 100 lines, and the owner sees it. In an unfamiliar area, where
   the owner cannot yet write the signature, code is built only once the reference example ran
   as is and a budget "reference + N lines" is named; an overrun stops and asks.
5. **Lesson at the decision point.** At every Shape, read
   `.claude/skills/ticket-implement/design-examples.md` and ask its five questions aloud; one that
   fails becomes a `[Q:ai]`. When the owner accepts the fix after a stop, record its before →
   after pair on a neutral `Order` there, in the same commit.
6. **Draft.** A learn step's draft lives in its own worktree on a throwaway branch `wt/<name>`,
   and nothing of it is copied into working code. Only the answer and its proof remain: a
   command, a snippet of at most 20 lines.
7. **Done is visible:** a command or link the owner can repeat (a minimal step's: the play of the
   whole feature), plus `make check` and `/lab-review`; a case seen only on a stub is not fixed.
8. **Only on request.** Each move starts on the owner's word; there is no night loop.

## Steps, tests and commits

- A step `L<n>` has one visible goal, a pass of `sdd.md` (`minimal`, `right`, `hard`) and a kind:
  `learn` ends in knowledge, its Output asking "can you write the signature now?"; `build` ends
  in accepted code.
- Tests go only in the existing `__tests__/` and `__e2e__/` folders. A contract test written
  before its body is `it.effect.fails` over a body of `Effect.die('todo')`; the piece that writes
  the body removes `.fails`. Every commit is green.
- A piece commits as its own round once `make check` is green, before the owner reads its diff,
  named as `.claude/rules/commits.md › A ticket's rounds` says. The owner's edits found between
  rounds commit first, as an `OWNER` round. A commit the owner has seen is never amended; a push,
  a PR and a merge wait for the owner's word.
