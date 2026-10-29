---
name: ticket-architecture
description: "SDD 2/5: design a ticket into architecture.md with Seams and Decisions"
argument-hint: "<ticket folder>"
disable-model-invocation: true
---

Design the ticket at `$ARGUMENTS` into its `architecture.md`: where the change lives, the Seams
where tests observe it, and every non-obvious decision. Gates: `.claude/rules/sdd.md`.

## Steps

1. Read `feature.md`, `docs/knowledge/architecture.md`, the glossary, and the `CLAUDE.md` of
   every workspace the change touches. Each open question of `feature.md` is settled here: its
   `Answer` names the `D…` or `R…` it became.
2. Call the Skill tool with `mattpocock-skills:codebase-design` for the vocabulary (module,
   interface, depth, seam, adapter), and with `mattpocock-skills:grilling` for the decisions.
   Facts go to the `researcher` agent; when a decision depends on behaviour, run an experiment.
3. Write `architecture.md` from `docs/tickets/_template/architecture.md`:
   - overview with a diagram, structure, contracts and data;
   - **Seams**: each public interface tests will use, with one line on what it catches and what it
     misses. `tdd` later writes tests only at these seams, so the user confirms them here;
   - **Decisions** `D1…`: each with its why, the cost accepted, how it is reversed, and the
     rejected alternative. A choice earns a decision when it is hard to reverse, surprising
     without context, and a real trade-off. These replace ADRs;
   - risks, each with what it would cause and what contains it.
4. Present it. The step is done when the user approves the Seams and the Decisions; next comes
   `/ticket-plan <ticket folder>`.

Commit only on the user's explicit OK.
