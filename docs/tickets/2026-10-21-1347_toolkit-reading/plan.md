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

- **Goal:** `implementer` reads first its step, the `R…` and `D…` it cites, the Seam it tests at
  and the `architecture.md › Contracts` entries for its files, and opens the rest of the ticket
  when the step touches a contract or decision those parts do not quote; its report says nothing
  about it (R1, D2, D5).
- **Blocked by:** none.
- **Files:** `.claude/agents/implementer.md` (a **Read the step** bullet under *Disciplines*, worded
  as `architecture.md › Contracts` sketches it).
- **Test first:** config only. Seam: `git grep` over `.claude/agents/implementer.md`;
  `git grep -n 'Read the step' -- .claude/agents/implementer.md` is empty before the change.
- **Verify:**
  - `git grep -n 'Read the step' -- .claude/agents/implementer.md` prints one line;
  - the bullet names `plan.md`, `R…`, `D…`, the Seam, `architecture.md › Contracts`, `grep -n`,
    offset and limit, and when to open the rest;
  - `git grep -niE 'read (the )?(whole|entire|all of)' -- .claude/agents/implementer.md .claude/skills/ticket-implement`
    is empty;
  - the *Report* section is unchanged (`git diff` shows no line under `## Report`);
  - `make check` is green.
- **Findings:**
  - S1.1 review: "it cites" read as `architecture.md` citing; now "the step cites". "the Seam its
    *Test first* names" repeated the `tdd` bullet; now "the Seam it tests at".
  - S1.2, on the user's question whether the rule lowers quality: the `Contracts` entries for the
    step's files are read up front, and "only when" stays "when"; R1 amended, D5 added.
  - Left as is: `Contracts` entries are keyed by interface, so "for its files" relies on the agent
    matching them through `Structure`.
- **Status:** done

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
- **Findings:**
  - The check sits before the coverage table, so the table maps the corrected steps;
    `architecture.md › Contracts` now says "before the plan is presented" instead of a step number.
  - Left as is on the user's approval: the step does not say what happens to items `researcher`
    reports as `Unverified` (`architecture.md › Risks` expects a check by hand); `researcher.md`
    still describes "one concrete question" while the brief sends two lists (D1).
- **Status:** done

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
- **Findings:**
  - `naming.md` shortens the link text to `architecture.md › Dependency rules`, so its `../../`
    path fits the line; the other files keep the full path.
  - S3.2: README's "Biome rejects the rest" lost its antecedent once the chain went. S3.3: its
    replacement "any import the matrix forbids" overclaimed, since `architecture.md › Known gaps`
    lists forms that pass every guard; README now says "most" and links Known gaps.
  - The always-loaded set stays at exactly 140 lines: the pointer line takes the chain's three.
- **Status:** done

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S1 |
| R2 | S3 |
| R3 | S2 |
| R4 | S2 |
| R5 | S2 |
| R6 | landed in the working tree with `feature.md`; committed with the ticket docs |
