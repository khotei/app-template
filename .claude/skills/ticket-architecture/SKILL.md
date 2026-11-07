---
name: ticket-architecture
description: "SDD 2/5: design a ticket into architecture.md with Seams and Decisions. Run only when the user asks for this phase"
argument-hint: "<ticket folder>"
---

Design the ticket at `$ARGUMENTS` into its `architecture.md`: where the change lives, the Seams
where tests observe it, and every non-obvious decision. Gates: `.claude/rules/sdd.md`.

## Steps

1. Read `feature.md`, `docs/knowledge/architecture.md`, the glossary, and the `CLAUDE.md` of
   every workspace the change touches. Each open question of `feature.md` is settled here: its
   `Answer` names the `D…` or `R…` it became.
2. Call the Skill tool with `mattpocock-skills:codebase-design` for the vocabulary (module,
   interface, depth, seam, adapter), and with `mattpocock-skills:grilling` for the high level
   only: the seams, the contracts and the irreversible decisions. A choice a stage can still make
   or undo is a direction, written as a recommendation and never put to the user. Facts go to the
   `researcher` agent, on the default model and effort `opus high`; when a decision depends on
   behaviour, run an experiment. You may choose `fable` over this default where you judge the
   answer will be better for it, chiefly where it settles a design and nothing after it re-checks
   it, and name it in the status.
3. Write `architecture.md` from `docs/tickets/_template/architecture.md`, the high level of the
   whole ticket only: no file list and no function signature, which the plan's steps hold.
   - overview with a diagram, structure by module and workspace, contracts and data between
     modules and between steps. Each entry states its decision and the invariant it keeps, and
     links the config or file that holds a rule instead of copying it: a copied config, tree or
     key drifts with the next change;
   - **Seams**: each public interface tests will use, with one line on what it catches and what it
     misses. `tdd` later writes tests only at these seams, so the user confirms them here;
   - **Decisions** `D1…`: each with its why, the cost accepted, how it is reversed, and the
     rejected alternative. A choice earns a decision when it is hard to reverse, surprising
     without context, and a real trade-off. These replace ADRs. A decision that binds beyond the
     ticket names the record of `docs/knowledge/decisions.md` it adds or changes, for the step
     that lands it;
   - **Direction**: each choice a stage can still make or undo, as a recommendation over the
     option it beats, with the stage that settles it;
   - **Assumptions** `A1…`: each fact the design takes as true unchecked, with the stage that
     checks it (the first whose work rests on it), whether by a read or a probe, and the Seam,
     contract or decision it changes if false;
   - risks, each with what it would cause and what contains it.
4. Present it. The step is done when the user approves the Seams and the Decisions; the
   Direction is shown as written, not asked. Next comes `/ticket-plan <ticket folder>`.

Commit under the commit gate of `.claude/rules/sdd.md`.
