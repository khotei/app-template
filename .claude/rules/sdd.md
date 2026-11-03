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
- **One plan step = one commit**, of ≤ ~400 changed lines, fitting one fresh session. A ticket is
  one branch `<type>/<slug>` and one squash-merged PR.
- **A step lands in rounds, one commit each.** The implementer's pass is round `S<n>.1`; what
  stands commits first, under the commit gate; any fix, the user's or the main session's, then
  lands as `S<n>.2`, so each diff is read alone. The commit body opens with the round id and what
  it changed; `plan.md` is edited only at the last round.
- **The commit gate, for every commit or amend of a ticket.** At its first step of a session,
  `/ticket-implement` asks once whether each ready step commits without the user's OK or waits
  for it, and holds the answer for the session; it covers the step's rounds too. A step is ready
  when the passes `/ticket-implement` names for it ran, their fixes are in and `make check` is
  green, a round when `make check` is green; a finding left to the user's choice waits for the
  user either way. Any other ticket artifact commits once the user has confirmed it in its skill.
  Pushing, opening a PR, merging and creating a remote always wait for the user's OK.
- **Deviations are recorded** in the same commit: `plan.md` findings, `architecture.md ›
  Decisions` when it is a decision, and `feature.md` when it changes what a requirement asks.
  A decision that adds or changes a binding rule also adds or rewrites its record in
  `docs/knowledge/decisions.md`, in the same commit.
