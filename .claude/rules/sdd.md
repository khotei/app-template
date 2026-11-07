---
paths:
  - "docs/tickets/**"
  - "docs/knowledge/roadmap.md"
  - ".claude/skills/**"
---

# Spec-driven development

Every change of substance runs **feature → architecture → plan → implement → verify** through the
`/ticket-*` skills. The procedures live in the skills; this file holds the constraints they share.

## Artifacts

`docs/tickets/<YYYY-MM-DD-HHmm>_<slug>/`, started from `docs/tickets/_template/`:

| File | Holds | Written by |
|---|---|---|
| `feature.md` | problem, goal, scope, out of scope, requirements `R…` in EARS, acceptance per requirement | `/ticket-feature` |
| `architecture.md` | structure, contracts, **Seams**, decisions `D…` with the rejected alternative, risks | `/ticket-architecture` |
| `plan.md` | a status table; steps with `Delivers:`, `Blocked by:`, test first, verify, `Status:`, findings; a coverage table | `/ticket-plan`, `/ticket-implement` |
| `verification.md` | verdict per requirement, review, simplifications, **Lessons** | `/ticket-verify` |

- **A ticket that has not started exists only as an entry in `docs/knowledge/roadmap.md`.**
  `/ticket-feature <slug>` starts from that entry when one exists and replaces its status with a
  link to the ticket folder.
- `docs/knowledge/` holds the living how-it-works docs. Update them in the commit that changes the
  behaviour they describe.

## Gates

- **Requirements are EARS** (`WHEN … THE SYSTEM SHALL …`; also `WHILE`, `WHERE`, `IF … THEN`).
- **Tests sit at the Seams** agreed in `architecture.md`; a step's *Test first* names one.
- **The heavy review lands once, on the plan.** Steps then conform to it.
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
  commits once the user has confirmed it in its skill; a stage preparation with no question
  commits without the user's OK. Pushing, opening a PR, merging and creating a remote always wait
  for the user's OK.
- **Deviations are recorded** by the step's `PLAN` round: `plan.md` findings, and
  `architecture.md › Decisions` when it is a decision. `feature.md`, when it changes what a
  requirement asks, and the record in `docs/knowledge/decisions.md` of a decision that adds or
  changes a binding rule land in the round itself.
