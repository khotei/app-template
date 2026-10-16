# Monorepo setup — verification

> Ticket: `2026-10-15_monorepo-setup` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-10-16 — run 1

Branch `chore/monorepo-setup` at `3c3e311` against `main` at `67f3adc`. Fresh-context `verifier`,
and `code-review` with one `reviewer` agent per axis.

**Verdict:** fail. `make check` is green and every behaviour check passes. R34, R36 and R40 fail
on documentation content, and R3/R4 describe `template/*` branches that the user dropped after
the run started (single branch with full history, squash into `main` through the PR).

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | `67f3adc` equals a fresh `bun init -y` up to the directory name |
| R2 | pass | 20 steps map to one commit each; `d5bb68a` and `c520ba4` are re-planning commits with no step |
| R3 | fail | `template/claude` was never cut, yet S18b is `done` with that gate; the template strategy is now dropped |
| R4 | fail | as R3; `template/monorepo` and `template/tooling` passed `make check` in clean clones before they were deleted |
| R5–R8 | pass | workspaces, `packageManager`, `tools`/`runtime` catalogs, no `^`/`~`, no `catalog:`, pins equal `bun info` |
| R9 | pass | `bun init` verified; `biome init` and `husky init` consistent with their artifacts |
| R10–R12 | pass | every workspace extends the base; `bun check` fails on a TS2322 probe; `tsc -b` emits only into `node_modules/.cache/tsc` |
| R13 | pass | the `example` slice matches the structure; no Effect import |
| R14, R14a, R15 | pass | 15 layer probes, relative-path, import-order and web-client probes, each with its rule message |
| R16–R18 | pass | four variables read and listed; `make dev-api` and `bun run dev` read the root `.env`; one `ConfigError` names every variable |
| R19 | pass | `/health` edit served live, PID unchanged |
| R20 | pass | `globalThis` counter reset to 1, old timer gone, PID unchanged |
| R21 | pass (server side) | bundle hash changed on edit, `Reloaded in 1ms`; the browser tab itself not observed |
| R22 | pass | inspector block printed; a protocol client evaluated code in the api process |
| R23–R27 | pass | doc sections present; 20 tests without `.env`; Biome style probes; hooks reject a type error, an `any` and a failing test |
| R28 | pass (local) | jobs, matrix and commands match; a real CI run not observable (no remote) |
| R29 | pass | both PR files exist; one comment block each |
| R30, R31 | pass | script split exact; GNU Make 3.81; `make help` lists all 16 targets |
| R32, R33 | pass | files, flags, `enabledPlugins`, templates; no `GLOSSARY.md`, `CONTEXT.md`, `docs/adr` |
| R34 | fail | templates have Seams and `Blocked by`, but this ticket's `architecture.md` has no Seams section and S0–S15, S19 have no `Blocked by:` |
| R35–R35d | pass (files) | read-only agents deny `Edit`, `Write`, `NotebookEdit`, `Agent`; hook exits 0 / 2 / 0 on green / red / `BLOCKED:` |
| R36 | fail | `.claude/rules/tooling.md:22-24,45-47` restate `docs/knowledge/tooling.md` |
| R36a | pass | every plugin skill, agent and hook in the skill and agent files is in the map |
| R37 | pass | 22 commits match the format, each with `Refs:` |
| R38, R39 | pass | no Cyrillic in `.claude`, `docs`, `README`, `CLAUDE.md`; `deployment` stubs typecheck |
| R40 | fail (minor) | the README maps reader questions to documents, not layers; S18a redefined it without updating `feature.md` |

**Not verifiable:** the PR, CI runs and lychee itself (no remote, lychee not installed: a substitute
scan found 0 broken links); the browser half of R21; the `debug.bun.sh` web UI; live `/ticket-*`
runs inside the verifier (they were observed during S16 and S17 instead).

### Review

#### Standards

Hard violations:

1. **Ports declared in infrastructure.** `infrastructure/example/example.{queue,storage,llm}.ts`
   declare their own interfaces, against `infrastructure/CLAUDE.md` ("An adapter returns the
   domain port type") and `domain/CLAUDE.md` ("Ports live in `<entity>.service.ts`"). The worker
   handler takes `ExampleJob` from infrastructure.
2. **`build` used for wiring.** `buildLayer` (`apps/{api,worker}/src/layer.ts`) wires
   dependencies, which `naming.md` reserves for `create<Thing>`; milder in `buildRoutes`,
   `buildPrompt`, `buildObjectKey`, `buildResourceName`, `buildTags`.
3. **Facts restated in always-loaded files.** `CLAUDE.md` repeats `sdd.md` (artifact paths, the
   approval gate) and `tooling.md` (the `make check` gate); `apps/CLAUDE.md:13` repeats the
   dev-mode rule it also links to.
4. **Comment repeats `CLAUDE.md`:** `domain/shared/error.ts:1`.
5. **Ticket ids outside the ticket:** `(D25)` and `(D19)` in `biome.json` messages, `(D28)` in
   `.claude/hooks/make-check.sh:2`, `(D25)` in `docs/knowledge/tooling.md`. A new project deletes
   the ticket, so they point nowhere.

Judgement calls: `crypto.randomUUID()` inside the domain's `buildExample`; `createExample` naming
a use case with the factory verb; `outbox.repository.ts` holds no adapter and an unbranded id;
`ConfigError` lacks a `<Problem>`; `852adb2` is typed `feat` for tooling configuration.

Smells: seven copies of `{ name, tags }` in `deployment/aws/*.ts` (Duplicated Code, Data Clumps);
`createSharedDbClient` and `ExampleService.save` only delegate (Middle Man); an unchecked
`as ExampleId` cast and `statusByTag` keyed by `string` (Primitive Obsession). Unused stubs are
endorsed by the layer rules, so Speculative Generality is suppressed.

#### Spec

Missing or partial: R34 (no Seams, missing `Blocked by`), R40 (no layer map), R2 (two
re-planning commits match no step).

Scope creep: `.claude/settings.json` allows `git add *` and `git restore *` without a prompt,
while the spec allows read-only git; `git restore` discards work.

Looks wrong:

1. **R36:** `.claude/rules/tooling.md` restates the dev-mode and catalog facts.
2. **R35:** the read-only agents keep `Bash`, so the shell can still edit; the requirement says
   they "SHALL NOT be able to edit files".
3. **R35c:** the `BLOCKED:` escape reads `last_assistant_message`, verified only with crafted
   input.
4. **R29 vs R37:** the PR example's title uses `:tada:`, which `commits.md` reserves for the
   initial commit.
5. **Stale spec lines** contradict R32, R35d and D15: `feature.md:27` and `:54` (vendored copies,
   "5 commands"), `architecture.md:483` (vendored skills); `architecture.md:290` calls the queue
   "imported nowhere", yet the worker uses it.

### Simplifications

1. `deployment/aws/*.ts`: one helper for `{ name, tags }` replaces seven copies.
2. `infrastructure/shared/db.client.ts`: drop `createSharedDbClient`; call `createDbClient`.
3. `apps/api/src/http.ts`: key `statusByTag` by the union of error tags, so a new error is a type
   error until mapped.

### Lessons

| Lesson | Evidence | Proposed change | Applied |
|---|---|---|---|
| A decision taken mid-ticket was not carried back into `feature.md` | R34, R40 redefined in S18a, stale vendoring lines | `.claude/rules/sdd.md › Gates`: a deviation that changes a requirement edits `feature.md` in the same commit | yes, S19d |
| Ticket ids leaked into config, hooks and docs | `biome.json`, `make-check.sh`, `tooling.md`; S11, S16, S18a | a check: CI fails on `\((D\|R\|Q)[0-9]+\)` outside `docs/tickets/` | yes, S19d |
| Rules were written before the docs they link to, then never trimmed | R36 failure; `CLAUDE.md` restatements; S14, S15, S18a | `/ticket-plan`: a step that writes a `docs/knowledge/` page also trims the rules that link to it | yes, S19d |
| A layer gate was marked done before it ran | S18b `done` without `template/claude` | `/ticket-implement` step 5: a step with a gate is `done` only after the gate ran | yes, S19d |
| Periodic, codebase-wide review has no home | user question after the run | `docs/knowledge/sdd.md`: a short "Periodically" section for `/mattpocock-skills:improve-codebase-architecture` and `/mattpocock-skills:retro`, with the glossary path override | yes, S19d |
