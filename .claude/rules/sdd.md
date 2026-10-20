# Spec-driven development

Every change of substance runs **feature → architecture → plan → implement → verify** through the
`/ticket-*` skills. The procedures live in the skills; this file holds the constraints they share.

## Artifacts

`docs/tickets/<YYYY-MM-DD>_<slug>/`, started from `docs/tickets/_template/`:

| File | Holds | Written by |
|---|---|---|
| `feature.md` | goal, scope, out of scope, requirements `R…` in EARS, acceptance per requirement | `/ticket-feature` |
| `architecture.md` | structure, contracts, **Seams**, decisions `D…` with the rejected alternative, risks | `/ticket-architecture` |
| `plan.md` | steps with `Blocked by:`, test first, verify, `Status:`, findings; a coverage table | `/ticket-plan`, `/ticket-implement` |
| `verification.md` | verdict per requirement, review, simplifications, **Lessons** | `/ticket-verify` |

- **These paths override every plugin.** Ignore the artifact paths plugins suggest (`.scratch/`,
  `docs/superpowers/`, an issue tracker).
- **The glossary is `docs/knowledge/glossary.md`.** `domain-modeling` writes there; the repository
  has no `GLOSSARY.md`, `CONTEXT.md` or `docs/adr/`. Decisions go to `architecture.md › Decisions`.
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
- **A step with numbered sub-steps is committed one sub-step at a time:** the implementer stops
  after each, the user reads that diff alone and approves its commit, then the next begins. The
  sub-step's commit names it in the subject.
- **Approval gate.** After each step: the implementer's report, the two-axis review, then the
  user's explicit OK before any commit or amend. Pushing, opening a PR or creating a remote needs
  its own OK.
- **Deviations are recorded** in the same commit: `plan.md` findings, `architecture.md ›
  Decisions` when it is a decision, and `feature.md` when it changes what a requirement asks.
- **Lessons change a skill, a rule or a check**, never a `CLAUDE.md`, and only on the user's OK.

## Toolkit layout (the model gets these wrong)

- Procedures are skills in `.claude/skills/ticket-<phase>/SKILL.md` with
  `disable-model-invocation: true`. A colon is reserved for plugin namespaces, and there is no
  `.claude/commands/`.
- The plugin `mattpocock-skills` is referenced by name (`mattpocock-skills:<skill>`), never copied
  or edited. A wrapper overrides only paths and gates.
- **The dependency map in `docs/knowledge/sdd.md` is the only summary** of what each skill and
  agent uses (plugin skills, agents, hooks, overrides). A commit that changes what a skill or agent
  uses updates the map in the same commit.
- Tool limits live on the agent (`disallowedTools`). `researcher`, `reviewer` and `verifier`
  cannot edit or spawn agents, so the skill persists their output.
- Subagents cannot ask the user anything, so grilling, plan review and commit approval run in the
  main session.
- `implementer` cannot finish while `make check` is red (`.claude/hooks/make-check.sh`); a final
  message starting with `BLOCKED:` is its only way out.
