# Toolkit reading

> Ticket: `2026-10-21-1347_toolkit-reading` · Source: [roadmap entry 14](../../knowledge/roadmap.md#14-toolkit-reading)
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Goal

The second wave of the `claude-toolkit` audit. `implementer` reads the part of the ticket its step
needs instead of whole files; the import direction has one author for agents and one for humans;
`/ticket-plan` presents only paths, APIs and literals that were checked against the tree and the
rules. Each item answers a cost or a mistake measured in `chat-core`.

## Context

- **What `implementer` reads.** In `chat-core` the three ticket files measured ≈99k tokens
  (`plan.md` 53k, `architecture.md` 32k, `feature.md` 13k; 2.4 characters per token, calibrated on
  `/context`). From the transcripts, the 23 `implementer` runs read a median ≈34k tokens of ticket
  text per step (max ≈65k) and read `architecture.md` whole 14 times. A step with the full text of
  the `R…` and `D…` it cites holds 2.8–8.3k (S17 2.8k, S3 4.4k, S10b 8.3k); `architecture.md ›
  Seams` adds ≈1.4k. No instruction asks for whole-file reads: `ticket-implement` passes the folder
  and the step id only, and the agent chose to read everything. Step headings (`#### S<n>`) and
  item leads (`- **R<n>** —`, `- **D<n> — …**`) are stable, so `grep -n` locates them.
- **What `reviewer` reads.** A median ≈2.2k tokens of ticket text per run (96 runs); whole files
  only twice, both in the branch review. A reading rule there would save under the 20% the user
  set for a cut made for tokens alone.
- **The import direction** is stated in eight places: `biome.json` (11 overrides), root
  `CLAUDE.md:18-19`, `.claude/rules/naming.md:22-25`, seven layer `CLAUDE.md`,
  `docs/knowledge/architecture.md:27-70`, `README.md:70-71`, `.github/PULL_REQUEST_TEMPLATE.md:20-21`
  and `.github/PULL_REQUEST_example.md:27`. Biome rejected 10 of 10 forbidden workspace imports in a
  probe. Root `CLAUDE.md`, `naming.md` and `README.md` already drift: "`apps` → `http-api`" admits
  `worker`, which Biome and `architecture.md:27-28` forbid. A layer's `CLAUDE.md` loads only when
  Claude reads or edits a file in that directory (code.claude.com/docs/en/memory).
  `docs/knowledge/tooling.md:232` explains a Biome message and already links `architecture.md`.
- **Plan amendments.** `chat-core/plan.md` carries 52 *Amended in* notes (the roadmap's 49 is not
  reproducible); 24 repeat one amendment elsewhere in the plan. Of the 29 independent causes, 4 are
  a path, API or dependency the plan named wrongly (a `researcher` check would have caught each),
  4 a literal that broke a rule (one of them, `packages/api-client` importing `http-api`, against a
  rule that predates the plan; the other three rules landed mid-ticket), 9 review or user feedback,
  12 discoveries during implementation. `/ticket-plan` spawns no agent today
  (`docs/knowledge/sdd.md` dependency map).
- **Facts re-verified on 2026-10-21.** The always-loaded project set is 140 lines, ≈2.9k tokens
  (4.5k by `/context` before `claude-toolkit`). Rewording four rules saved 11% and was dropped
  (`b4a86c8`).

## Scope

- A reading rule in `implementer.md`.
- One author per audience for the import direction; every other place links
  `docs/knowledge/architecture.md`.
- Two checks in `/ticket-plan` before the plan is presented, and the dependency map in
  `docs/knowledge/sdd.md` updated to match.
- Roadmap entry 14 linked to this folder.

## Out of scope

- **A reading rule in `reviewer.md`:** its median read is ≈2.2k tokens, below the 20% threshold.
- **An excerpt pasted into the prompt, one file per step, or a `make` target that cuts a step:**
  the rule in `implementer.md` reaches the same reads without changing the template or
  `ticket-implement`'s "pointers only".
- **Measuring the rule by replaying a `chat-core` step:** dropped by the user; the rule is checked
  by its text.
- **Biome guards for `node:`/`bun:` imports and `Bun`/`process`/`globalThis` in the browser-facing
  layers, and `Date`/`crypto`/`fetch` in `domain`:** dropped by the user. The code holds no
  violation today; one landed in `monorepo-setup` (`crypto.randomUUID()` in `domain`), and
  `architecture.md:204-206` records the gap.
- **`implementer` greps for what a new or sharpened rule line forbids:** dropped by the user,
  though `chat-core` shows four cases (16 `yield*` sites left after `51d0f00`).
- **`make lint-docs` on lines over 100 characters:** dropped by the user; 11 wrappable lines in the
  living docs.
- **Trimming the layer `CLAUDE.md` lines on imports:** they load only in their directory and give
  the why before Biome fails.
- **Glossary entries:** `docs/knowledge/glossary.md` holds the chat domain; toolkit terms live in
  `docs/knowledge/sdd.md`.

## Requirements

### Reading

- **R1** — WHEN `implementer` starts a step, THE SYSTEM SHALL have it read the step from
  `plan.md`, the `R…` and `D…` the step cites and the Seam its *Test first* names, and open any
  other part of the ticket only when the step touches a contract or decision those parts do not
  quote.

### The import direction

- **R2** — THE SYSTEM SHALL state the import direction between workspaces only in `biome.json`
  (for agents), `docs/knowledge/architecture.md` (for humans) and each layer's own `CLAUDE.md` (its
  own boundary); WHERE root `CLAUDE.md`, `.claude/rules/naming.md`, `README.md` or a `.github` PR
  template refers to it, THE SYSTEM SHALL link `docs/knowledge/architecture.md` instead of
  restating the chain.

### The plan

- **R3** — WHEN `/ticket-plan` names an existing file path, API or dependency in a step, THE
  SYSTEM SHALL have the `researcher` agent confirm it, in one call for the whole plan, before the
  plan is presented; a path the plan itself creates is exempt.
- **R4** — WHEN `/ticket-plan` fixes a literal in a step (a name, signature, path or message), THE
  SYSTEM SHALL check it against the current `.claude/rules/*.md` and the `CLAUDE.md` of the
  workspace it lands in before the plan is presented.
- **R5** — WHEN the skills or agents `/ticket-plan` uses change, THE SYSTEM SHALL update the
  `/ticket-plan` row of the dependency map in `docs/knowledge/sdd.md` in the same commit.

### The record

- **R6** — WHEN this ticket starts, THE SYSTEM SHALL set roadmap entry 14's status to a link to
  this folder.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | `.claude/agents/implementer.md` names the step, the cited `R…` and `D…`, and the Seam as what it reads first, and states when it opens the rest; `git grep -niE 'read (the )?(whole\|entire\|all of)' -- .claude/agents/implementer.md .claude/skills/ticket-implement` is empty |
| R2 | `git grep -nE 'application.{1,8}infrastructure.{1,8}domain\|apps.{1,8}http-api' -- ':!docs/tickets' ':!repos'` lists only `docs/knowledge/architecture.md`; root `CLAUDE.md`, `naming.md`, `README.md` and both `.github` PR files link `architecture.md` |
| R3 | `.claude/skills/ticket-plan/SKILL.md` spawns `researcher` once for the plan's existing paths, APIs and dependencies before the presentation step |
| R4 | `.claude/skills/ticket-plan/SKILL.md` checks every literal a step fixes against `.claude/rules/*.md` and the target workspace's `CLAUDE.md` before the presentation step |
| R5 | the `/ticket-plan` row in `docs/knowledge/sdd.md` lists `researcher` under agents, and the commit that changes `ticket-plan` also changes that row |
| R6 | `docs/knowledge/roadmap.md`: table row 14 and entry 14's **Status** link `docs/tickets/2026-10-21-1347_toolkit-reading/` |

## Open questions

- Who checks the literals in R4: the main session while writing the plan, or the same
  `researcher` call as R3 with the rules in its brief. For `/ticket-architecture`.
- Whether R1's "only when" needs a named trigger (a file in the step that `architecture.md ›
  Structure` describes) or stays a judgement. For `/ticket-architecture`.
