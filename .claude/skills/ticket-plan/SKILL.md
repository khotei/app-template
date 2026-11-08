---
name: ticket-plan
description: "SDD 3/5: turn feature.md and architecture.md into a reviewed plan.md. Run only when the user asks for this phase"
argument-hint: "<ticket folder> [next]"
---

Write the implementation plan for the ticket at `$ARGUMENTS`: the **skeleton** of every step,
grouped in stages, and its first stage in full; given `next`, prepare the next stage. **The heavy
review is the skeleton and the first stage**: each later stage is checked when it is prepared.
Gates: `.claude/rules/sdd.md`. A stage is prepared by [stage.md](stage.md) beside this file, read
afresh each time.

A plan whose **Status** has no `### Stage` heading is in its old form: keep it in that form, and
stop `next` on it, saying so.

## The first plan

1. Read `feature.md` and `architecture.md`.
2. **Cut the skeleton** into **deliverables**, each a step, as `sdd.md › Gates` defines it: one
   outcome to observe, whole when it lands, its acceptance check red before and green after,
   `make check` green. Cut by what the system does, never by endpoint group or layer. Everything
   a step adds (a name, a type, a page) is used by that step's own code or test; no step leaves
   scaffolding a later step rewrites or removes, and a page or rule is written in the one step
   where its behaviour is complete. Lockfiles and snapshots are excluded from its size.
   Group the steps, in order, into **stages** of three; a stage of one, two or four states its
   reason in its heading. Each stage delivers one outcome and completes the requirements whose
   last step it holds. A ticket whose steps fit one stage is one stage, prepared at once, and has
   no stage boundary.
3. Write `plan.md` from `docs/tickets/_template/plan.md`: the **Status** table as the skeleton, a
   `### Stage <n>` heading per stage naming its outcome and the requirements it completes, and a
   row per step with its outcome, the `R…` and `D…` it serves and its size; a `## Stage <n>`
   section per stage, every one after the first as the template's "Not prepared" line; the
   coverage table, each requirement with its steps and the stage that completes it.
4. Run `stage.md` for stage 1.
5. Present the skeleton and stage 1, with the question round `stage.md` returned, if any, for one
   approval, and iterate until the user approves it. Commit it as `St1 (PLAN) Prepare stage 1`,
   so every stage's base is found by one subject. Next comes `/ticket-implement <ticket folder>`.

## `next`

1. Run the owner check of `/ticket-implement`'s step 1 on the tree, so the user's edits commit
   as an `OWNER` round, never inside a facts commit. Find the first stage that has a
   `### Stage design` but no `St<n> (PLAN) Prepare stage <n>`
   commit (`git log --grep`), and resume it at `stage.md › Does` step 2; else the first stage
   whose section reads "Not prepared". Stop and say so when a step of an earlier stage is not
   `done`, or when no stage is left.
2. Run `stage.md` for it.
3. With no question, `stage.md` has committed: name the stage's first step,
   `/ticket-implement <ticket folder> S<n>`. With a question round, present it and wait; on the
   user's answers, finish as `stage.md › Does` says.

Commit under the commit gate of `.claude/rules/sdd.md`.
