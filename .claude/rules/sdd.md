---
paths:
  - "docs/tickets/**"
  - "docs/knowledge/roadmap.md"
  - ".claude/skills/**"
---

# Spec-driven development

Every change of substance runs **feature → architecture → plan → implement → verify** through the
`/ticket-*` skills; a direct task runs without a ticket
([which change is which](../../docs/knowledge/sdd.md#when-to-run-which-cycle)). The procedures
live in the skills; this file holds the constraints they share. A lab step (`lab.md`) follows
`.claude/rules/lab.md` instead of the round and commit-gate lines below.

## Artifacts

`docs/tickets/<YYYY-MM-DD-HHmm>_<slug>/`, started from `docs/tickets/_template/`:

| File | Holds | Written by |
|---|---|---|
| `feature.md` | problem, goal, scope, out of scope, requirements `R…` in EARS, acceptance per requirement | `/ticket-feature` |
| `architecture.md` | the high level: structure, contracts, **Seams**, direction, assumptions, decisions `D…` with the rejected alternative, risks | `/ticket-architecture` |
| `plan.md` | the skeleton (a status table split by stage); per stage its design, its steps with `Delivers:`, `Blocked by:`, test first, verify, `Status:`, findings, and its Stage review; a coverage table | `/ticket-plan`, `/ticket-implement` |
| `verification.md` | verdict per requirement, review, simplifications, **Lessons** | `/ticket-verify` |

- **A ticket that has not started exists only as an entry in `docs/knowledge/roadmap.md`.**
  `/ticket-feature <slug>` starts from that entry when one exists and replaces its status with a
  link to the ticket folder.
- `docs/knowledge/` holds the living how-it-works docs. Update them in the commit that changes the
  behaviour they describe.

## Gates

- **Requirements are EARS** (`WHEN … THE SYSTEM SHALL …`; also `WHILE`, `WHERE`, `IF … THEN`).
- **Minimal, then right, then hard:** three passes, each on the user's word. *Minimal* is the
  whole feature with only what it needs to work, in vertical slices, the first the thinnest end
  to end: it runs, the user plays it from a script they can repeat and reads how it works at once.
  Minimal in code, never in quality: every rule and review holds, and the design extends without
  a rewrite. *Right* adjusts its decisions, design and architecture to what the play showed.
  *Hard* takes items from `Later`, the open list of edge cases, error paths, hardening, open
  questions and optimisations: whoever notices one, planning or building, writes it there at once
  with its `path:line`, a review's finding too unless the feature does not run without it. The
  last stage or step of a plan or lab is `Later` itself, so the list stays in sight. Never
  deferred: a security hole, a loss of stored data, an irreversible contract. Before the PR each
  item is done, moved to the roadmap's `Later`, or dropped on the user's word
  ([why](../../docs/knowledge/sdd.md#minimal-right-hard)).
- **Tests sit at the Seams** agreed in `architecture.md`; a step's *Test first* names one.
- **The heavy review lands on the skeleton and the first stage;** each later stage is checked when
  it is prepared and reviewed when it closes, and steps conform to their stage
  ([why](../../docs/knowledge/decisions.md#plans-in-stages)).
- **A plan step is a deliverable:** one outcome a person or a test can observe, whole when it
  lands, with an acceptance check red before it and green after. It is ≤ ~400 changed lines of
  code and tests (its docs counted apart) and fits one fresh session. A ticket is one branch
  `<type>/<slug>` and one squash-merged PR, so no commit between two steps reaches `main`.
- **A step lands in rounds, one commit each,** named as `commits.md › A ticket's rounds` says. A
  round commits once `make check` is green, before the user reads it, so each diff is read alone,
  and the step's passes review its committed rounds. The user's own edits, found between rounds,
  commit first as an `OWNER` round; an edit during a live round is not one, so the user says stop
  first. No commit the user has seen is amended or squashed before the PR: a rejected round is
  reverted by a new commit only while it is the branch's last, and fixed forward by a new round
  once later work rests on it. `plan.md` is edited only at the step's close, a `PLAN` round.
- **The commit gate, for every commit of a ticket.** A round commits when ready; the gate decides
  whether a ready step closes. At its first step of a session, `/ticket-implement` asks once
  whether a ready step closes without the user's OK or waits for it, and holds the answer for the
  session. Started with `loop`, it does not ask: the loop waives the OK between its steps, not the
  OK for a push, a PR or a merge. A step is ready when the passes `/ticket-implement` names for it
  ran, their fixes are in and `make check` is green, a round when `make check` is green; a
  finding left to the user's choice waits for the user either way. Any other ticket artifact
  commits once the user has confirmed it in its skill, but three commit without the user's OK: a
  stage's facts, which land before its triage; a stage preparation with no question; and a stage
  verification's section when no failure in it needs a requirement changed, so a loop crosses a
  due verification. Pushing, opening a PR, merging and creating a remote always wait for the
  user's OK.
- **Deviations are recorded** by the step's `PLAN` round: `plan.md` findings, and
  `architecture.md › Decisions` when it is a decision. `feature.md`, when it changes what a
  requirement asks, and the record in `docs/knowledge/decisions.md` of a decision that adds or
  changes a binding rule land in the round itself.
