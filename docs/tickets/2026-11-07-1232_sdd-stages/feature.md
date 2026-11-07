# SDD in stages

> Ticket: `2026-11-07-1232_sdd-stages` · Source: conversation; [roadmap › sdd-stages](../../knowledge/roadmap.md#29-sdd-stages)
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

A ticket's plan details every step before the first one runs, and its architecture mixes the
shape of the system with the names and signatures inside it. The low level is written before the
facts that settle it (an API's real shape, an emulator's behaviour, what a probe shows), so it goes
stale: fresh implementers follow it literally, and the plan collects amendments step after step.
The owner pays for it in re-reads, and the heavy review of the plan reviews detail that will
change.

## Goal

The architecture holds only the high level for the whole ticket; the plan holds the whole ticket
as a skeleton of steps and their coverage. The low level, a stage design and the full detail of
its steps, is written one stage of about three steps at a time, after the facts those steps rest on
are checked, and each stage ends with a review of its steps together. The owner answers only where
a stage changes the architecture or the step list, or meets a choice worth their decision. Now,
because `lambda-processes` is about to be planned and rests on facts no one has run yet.

## Context

Gathered on 2026-11-07 by four agents, read only; the two figures quoted from files were checked
against them.

- **Audit of 21 tickets.** Late-step detail went stale in 6 of the 9 tickets with history: 4 to 8
  of the 10 steps after the third were edited after approval, mostly their files, goals and API
  names, with edits reaching up to 8 steps ahead (12 in one ticket). `chat-core` carries about 35
  "Amended in S…" notes because the plan named Effect APIs before they were checked (its
  `verification.md`, first lesson). What held: the step list and each step's outcome
  (`modular-monolith` landed all 23 original steps in order) and, in 18 of 21 tickets, the
  architecture's decisions. Most added steps came after verification (+20 in `modular-monolith`,
  +27 in `toolkit-quality`); stages would not change those. Small tickets did not drift.
- **Earlier lightening.** `lean-instructions` D15 already made a step pin only decided names,
  traps and a red-first check, leaving the rest to the implementer's search.
- **Outside.** Rolling-wave planning (detail near, coarse far, milestones and assumptions for the
  whole) is standard practice; its known failure is waves drifting from the original
  requirements. The one measured result on re-planning is on web navigation, not code
  (Plan-and-Act, ICML 2025: success 44 % → 54 %). Fowler's review of spec-driven tools (2025)
  doubts large up-front specs. Anthropic advises a persistent plan file and briefs with the
  decisions already made; Cognition warns that fresh-context workers make conflicting choices the
  architecture did not prescribe. No study compares stages with a full plan for coding agents.
- **An independent critic** rejected a first version (stages approved one by one, later steps as
  one-liners): 8–14 approvals per ticket, `loop` stopping every three steps, coverage as an
  unverifiable promise, scaffolding no reviewer can see. The requirements below answer each: the
  skeleton keeps every step's outcome, the owner is asked only on a change or a real choice, and
  coverage is checked at every stage.
- **The toolkit today** encodes the end-to-end plan in 14 places: the gate "the heavy review lands
  once, on the plan", the plan skill's cut, check and approval, the implement skill's stop, the
  plan template, and the process guide.

## Scope

- The architecture phase and its template: the high level only, with direction and assumptions.
- The plan phase and its template: the skeleton, stages, a stage design, the preparation of the
  next stage, its checks and when it asks the owner.
- The implement phase: the stage review and how the loop crosses a stage boundary.
- A review pass for a stage; the verification's per-stage table.
- The process guide, its dependency map and its terms; the gate rule within its size limit.

## Out of scope

- Rewriting existing or closed plans; `lambda-processes` and `telemetry-minimal` are the first to
  use stages.
- The feature phase, the step's own cycle (implementer, review passes, rounds, commit gate) and the
  verification beyond its per-stage table.
- Measuring the change automatically; the per-stage table gives the figures, read by hand.

## Requirements

### Architecture

- **R1** — WHEN a ticket's architecture is written, THE SYSTEM SHALL hold only its high level for
  the whole ticket: the seams, the contracts between modules and between steps, the irreversible
  decisions each with its rejected alternative, a direction for the design as recommendations,
  and the assumptions, each naming the stage that checks it.
- **R2** — WHEN the architecture phase questions the owner, THE SYSTEM SHALL ask about the high
  level only, recording each direction as a recommendation without a question round.

### The plan

- **R3** — WHEN a ticket's plan is written, THE SYSTEM SHALL list every step of the ticket as a
  skeleton (its outcome, the requirements and decisions it serves, its order and an estimated
  size), grouped into stages, with a coverage table that maps every requirement to at least one
  step.
- **R4** — THE SYSTEM SHALL make a stage three steps by default, and one to four where the plan
  states the reason in the stage's heading.
- **R5** — WHEN a ticket's plan is first written, THE SYSTEM SHALL also prepare its first stage
  and present the skeleton and that stage for one approval.

### A stage

- **R6** — WHEN a stage is prepared, THE SYSTEM SHALL first check the facts its steps rest on,
  running a probe for any fact only a run can show, then write the stage design (the names,
  signatures, files and the choices it makes from the direction, each with the option it set aside
  and the fact behind it) and its steps in full detail.
- **R7** — WHEN a stage is prepared, THE SYSTEM SHALL run the plan's check over the stage's steps,
  and SHALL fail it when a requirement maps to no step of the skeleton or the stage.
- **R8** — IF preparing a stage changes the architecture or the step list, or chooses between
  options a reviewer could question, that change visible behaviour or that cost much to undo, THEN
  THE SYSTEM SHALL put them to the owner as a question round, each with options and a
  recommendation, and wait; it SHALL make every other choice itself and record it in the stage
  design.
- **R9** — IF a stage's choice is used beyond its stage, THEN THE SYSTEM SHALL raise it to an
  architecture decision under R8.
- **R10** — WHEN the last step of a stage lands, THE SYSTEM SHALL review the stage's changes
  together against the architecture and the skeleton (conformance, scaffolding a later step would
  rewrite, coverage, recorded choices) and record the findings in the plan.
- **R11** — WHILE the implementation runs as a loop, WHEN a stage ends, THE SYSTEM SHALL review it
  and prepare the next stage without stopping, stopping only where R8 asks the owner or where the
  loop already stops.
- **R12** — WHEN a stage ends outside a loop, THE SYSTEM SHALL name the command that prepares the
  next stage.
- **R13** — WHEN a stage's preparation needs no answer from the owner, THE SYSTEM SHALL commit it
  without the owner's OK, its commit stating what the stage review found and what changed.

### Reach

- **R14** — WHERE a ticket's steps fit one stage, THE SYSTEM SHALL plan and run it as before,
  without a stage review.
- **R15** — THE SYSTEM SHALL apply stages to plans written after this ticket lands, and leave
  existing plans in their form.
- **R16** — WHEN a ticket is verified, THE SYSTEM SHALL report per stage the deviations that
  changed a step's outcome or order apart from those that changed only details, the edits made to
  later steps, and whether the loop stopped there.

### The guide

- **R17** — THE SYSTEM SHALL describe the stage, the skeleton, the stage design, the direction and
  the new loop in the process guide, update its dependency map, and define these terms there
  rather than in the domain glossary, keeping the name of the existing Design review pass apart.
- **R18** — THE SYSTEM SHALL keep every instruction file within its size limit.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | Run the architecture phase on a sample ticket in a scratch clone: its document has seams, contracts, decisions with rejected alternatives, a direction and assumptions naming stages, and no function signature or file list. |
| R2 | In that run, the questions put to the owner concern seams, contracts or irreversible decisions only; each direction appears as a recommendation. |
| R3 | Run the plan phase on the sample: every step of the ticket has an outcome, its requirements, its place and a size, under a stage heading; the coverage table names a step for every requirement. |
| R4 | In that plan, stages hold three steps, and any of another size carries its reason in the heading. |
| R5 | The first run presents the skeleton and a fully detailed first stage, and asks once. |
| R6 | Prepare the next stage after the first lands: a fact check precedes it (a probe where a run is needed), then a stage design with choices, set-aside options and facts, then full steps. |
| R7 | Remove a requirement's only step from a sample skeleton and prepare a stage: the check fails naming that requirement. |
| R8 | Prepare a stage whose facts force a choice between two shapes of a contract: the owner gets a question round and nothing commits; a stage with only naming choices commits with them recorded. |
| R9 | Mark a stage choice as used by a later stage: preparation asks the owner to raise it to a decision. |
| R10 | After a stage's last step, the plan holds a stage review covering conformance, scaffolding, coverage and recorded choices. |
| R11 | Run the loop across a stage boundary on the sample: it reviews, prepares and continues; with a choice under R8 pending, it stops with the questions. |
| R12 | Run one step that ends a stage without the loop: the output names the command for the next stage. |
| R13 | `git log` after an unattended stage preparation: one commit, no owner's OK asked, its body naming the review's findings and the changes. |
| R14 | Plan a three-step sample ticket: one stage, no stage review, the same flow as before. |
| R15 | Open a closed ticket's plan after the change: unchanged; the process guide says stages apply to new plans. |
| R16 | Verify the sample: the verification holds one row per stage with the three figures. |
| R17 | Read the process guide: the terms are defined there, the loop diagram shows stages, the dependency map matches the skills' files; the glossary has no process terms. |
| R18 | `make doc-lint` passes. |

## Open questions

For `/ticket-architecture`.

### Q1 — How does the loop prepare the next stage?

- **Why it matters:** R11 has the implement phase run the plan phase's preparation without
  stopping.
- **Options:** A — the implement skill calls the plan skill's `next` mode through the Skill tool;
  B — the preparation lives in a file beside the plan skill that both skills read.
- **Recommendation:** A if a skill can run another in the main session without losing the loop's
  state, else B; a researcher checks it.

### Q2 — Does the plan skill keep its size?

- **Why it matters:** the skill grows by the skeleton, the stage, the preparation and R8's rule.
- **Options:** A — all in the skill; B — the stage preparation in a file beside it, as the probe
  procedure already is.
- **Recommendation:** B, so a first plan and a stage preparation each read what they need.

### Q3 — Where do the stage review's findings and the per-stage table live?

- **Options:** A — the stage review under its stage in the plan, the per-stage table in the
  verification; B — both in the plan.
- **Recommendation:** A: the plan holds what steps did, the verification what the ticket measured.
