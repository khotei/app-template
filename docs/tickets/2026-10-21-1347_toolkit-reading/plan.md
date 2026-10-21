# Toolkit reading — plan

> Ticket: `2026-10-21-1347_toolkit-reading` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- Branch `chore/toolkit-reading`; one commit per step, after the user's OK (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.
- The three steps are independent; the order below is the default.

## Steps

#### S1 — `implementer` reads the step, not the ticket

- **Goal:** `implementer` reads its step, the `R…` and `D…` it cites and the Seam its *Test first*
  names, and opens the rest of the ticket only when the step touches a contract or decision those
  parts do not quote; its report says nothing about it (R1, D2).
- **Blocked by:** none.
- **Files:** `.claude/agents/implementer.md` (a **Read the step** bullet under *Disciplines*, worded
  as `architecture.md › Contracts` sketches it).
- **Test first:** config only. Seam: `git grep` over `.claude/agents/implementer.md`;
  `git grep -n 'Read the step' -- .claude/agents/implementer.md` is empty before the change.
- **Verify:**
  - `git grep -n 'Read the step' -- .claude/agents/implementer.md` prints one line;
  - the bullet names `plan.md`, `R…`, `D…`, the Seam, `grep -n`, offset and limit, and when to open
    the rest;
  - `git grep -niE 'read (the )?(whole|entire|all of)' -- .claude/agents/implementer.md .claude/skills/ticket-implement`
    is empty;
  - the *Report* section is unchanged (`git diff` shows no line under `## Report`);
  - `make check` is green.
- **Status:** todo

#### S2 — `/ticket-plan` checks the plan with `researcher`

- **Goal:** after the plan is written and before it is presented, `/ticket-plan` spawns
  `researcher` once with an **Exists** list (existing paths, APIs, flags, dependencies; paths the
  plan creates left out) and a **Conforms** list (each literal with the workspace it lands in,
  checked against `.claude/rules/*.md` and that workspace's `CLAUDE.md`); every `wrong` and every
  broken rule is fixed in `plan.md` before presenting, and `plan.md` records no check. The
  dependency map follows (R3, R4, R5, D1, D4).
- **Blocked by:** none.
- **Files:**
  - `.claude/skills/ticket-plan/SKILL.md`: a **Check** step between "Write `plan.md`" and the
    coverage table or presentation, renumbering the steps after it;
  - `docs/knowledge/sdd.md`: the `/ticket-plan` row of the dependency map lists `researcher` in the
    agents column; the diagram gains `plan --> researcher`.
- **Test first:** config only. Seams: `.claude/skills/ticket-plan/SKILL.md` read in order, and
  `docs/knowledge/sdd.md › Dependency map`; `git grep -n researcher -- .claude/skills/ticket-plan`
  is empty before the change.
- **Verify:**
  - `grep -nE '^[0-9]+\. ' .claude/skills/ticket-plan/SKILL.md` lists the check after the writing
    step and before the presentation step;
  - the check names both lists, one `researcher` call, the fix before presenting, and no record in
    `plan.md`;
  - `grep -n '^| `/ticket-plan`' docs/knowledge/sdd.md` shows `researcher` in the agents column;
  - `grep -n 'plan --> researcher' docs/knowledge/sdd.md` prints one line;
  - `make check` is green.
- **Status:** todo

#### S3 — the import direction is linked, not restated

- **Goal:** root `CLAUDE.md`, `.claude/rules/naming.md`, `README.md` and both `.github` PR files
  link `docs/knowledge/architecture.md › Dependency rules` instead of restating the chain; the two
  import checkboxes of each PR file become one (R2, D3).
- **Blocked by:** none.
- **Files:**
  - `CLAUDE.md`: lines 18–20 become the pointer line from `architecture.md › Contracts`;
  - `.claude/rules/naming.md`: *Across workspaces* keeps `@app-template/<workspace>[/<entity>]` and
    a link; the chain and the `packages/*` sentence go;
  - `README.md`: *Layers import only downwards* links instead of listing the chain;
  - `.github/PULL_REQUEST_TEMPLATE.md`: lines 20–21 become one checkbox, "Imports follow
    docs/knowledge/architecture.md › Dependency rules", with the box's right edge kept aligned;
  - `.github/PULL_REQUEST_example.md`: line 27 the same, ticked. Line 58 is prose in an example
    PR body and stays.
- **Test first:** config only. Seam: the chain `git grep`, red before the change:
  `git grep -nE 'application.{1,8}infrastructure.{1,8}domain|apps.{1,8}http-api' -- ':!docs/tickets' ':!repos'`
  lists `CLAUDE.md`, `naming.md`, `README.md` and the PR template besides `architecture.md`.
- **Verify:**
  - the chain `git grep` above lists only `docs/knowledge/architecture.md`;
  - `git grep -n 'architecture.md#dependency-rules' -- CLAUDE.md .claude/rules/naming.md README.md`
    prints one line per file, and `grep -n '^### Dependency rules' docs/knowledge/architecture.md`
    confirms the anchor;
  - `git grep -n 'Dependency rules' -- .github` prints one line per PR file;
  - `wc -l < CLAUDE.md` ≤ 40, and `cat CLAUDE.md $(grep -L '^paths:' .claude/rules/*.md) | wc -l`
    ≤ 140;
  - `make check` is green.
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S1 |
| R2 | S3 |
| R3 | S2 |
| R4 | S2 |
| R5 | S2 |
| R6 | landed in the working tree with `feature.md`; committed with the ticket docs |
