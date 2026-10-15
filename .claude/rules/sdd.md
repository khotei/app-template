# Spec-driven development

Every change of substance runs **feature → architecture → plan → implement → verify**, and every
artifact lives in this repository.

## Artifacts

`docs/tickets/<YYYY-MM-DD>_<slug>/`, created from `docs/tickets/_template/`:

| File | Holds |
|---|---|
| `feature.md` | goal, scope, out of scope, requirements `R1…` in EARS, acceptance per requirement |
| `architecture.md` | structure, contracts, data, decisions `D1…` with the rejected alternative, risks |
| `plan.md` | steps of ≤ ~400 changed lines, each with goal, files, test first, verify, `Status:` |
| `verification.md` | a verdict per requirement, plus proposed simplifications |

- Never write SDD artifacts anywhere else. Ignore the artifact paths that plugins suggest
  (`.scratch/`, `docs/superpowers/`, external trackers).
- `docs/knowledge/` holds living how-it-works docs. Update them in the commit that changes the
  behaviour they describe.

## Flow

| Command | Runs in | Agent | Writes |
|---|---|---|---|
| `/ticket:feature` | main session (grilling) | `researcher` for facts | `feature.md` |
| `/ticket:architecture` | main session | `researcher` for facts | `architecture.md` |
| `/ticket:plan` | main session | — | `plan.md`, reviewed by the user before any code |
| `/ticket:implement` | main session | `implementer`, one step at a time | code + `plan.md` status |
| `/ticket:verify` | main session | `verifier` | `verification.md` |

## Gates

- **Requirements are EARS only** (`WHEN … THE SYSTEM SHALL …`; also `WHILE`, `WHERE`, `IF … THEN`),
  never Given/When/Then.
- **The heavy review lands once, on the plan.** Steps then conform to it.
- **Test first** for every step with behaviour.
- **Approval gate:** after each step, stop and report the diff stat, the verification output and a
  proposed commit message. Commit or amend only after the user's explicit OK. Pushing, opening a PR
  or creating a remote needs its own OK.
- **One plan step = one commit**; a ticket = one branch = one squash-merged PR.
- A deviation from the plan is recorded in the same commit, in `plan.md` findings and, when it is a
  decision, in `architecture.md › Decisions`.

## Toolkit layout (the model gets these wrong)

- Commands are flat in `.claude/commands/` with literal-colon filenames (`ticket:plan.md` →
  `/ticket:plan`). Never nest them in subfolders.
- Tool boundaries live on the **agent** (`disallowedTools`), never on the command: `researcher`
  and `verifier` cannot edit files, so the command persists their output.
- Subagents cannot ask the user anything, so interactive phases (grilling, plan review, commit
  approval) run in the main session.
- Templates are `@`-referenced from `docs/tickets/_template/`, never inlined into a command.
