# Monorepo setup — verification

> Ticket: `2026-10-16-1433_monorepo-setup` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

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

## 2026-10-16 — run 2

Branch `chore/monorepo-setup` at `ea3d4f3` against `main` at `67f3adc`. Fresh-context `verifier`
(probes in a scratch clone, working tree left clean), and `code-review` with one `reviewer` agent
per axis.

**Verdict:** fail. `make check` is green (87 files linted, 53 typechecked, 21 tests) and every
behaviour check passes, including the browser half of R21. R28 fails because the ticket-id check
added in S19d matches its own example in `docs/knowledge/tooling.md:167`; R35 and R36 fail on spec
and documentation text.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | a fresh `bun init -y` is byte-identical up to a newer transitive `undici-types` in `bun.lock` |
| R2 | pass (local) | one branch, one commit per step; `d5bb68a` and `c520ba4` edit only ticket docs; the squash is not yet observable |
| R3 | pass | `make check` exits 0 in clean checkouts at the layer ends `1ccd0ec`, `2245647`, `3c3e311` and at HEAD |
| R4 | not verifiable | no remote, no merge |
| R5–R8 | pass | workspaces, `packageManager`, named catalogs only, no `^`/`~`, pins equal the registry `latest` |
| R9 | pass (artifacts) | `biome.json` schema, `.husky/_`, `prepare: husky` |
| R10–R12 | pass | references equal declared deps; TS2322 probe fails `bun check`; `tsc -b` emits only into `node_modules/.cache/tsc` |
| R13 | pass | structure matches; no Effect import |
| R14, R14a, R15 | pass (gap) | 21 forbidden-edge probes fail with the rule message, 9 allowed edges pass; **gap:** `require()` passes Biome, and `require('@oblik/config')` in web client code passes everything |
| R16–R18 | pass | four variables, root `.env` read by `make dev-api` and `bun run dev`, one `ConfigError` lists all missing variables |
| R19, R20 | pass | hot `/health` edit with the same PID; `--watch` restart resets the `globalThis` counter and the old timer |
| R21 | pass | headless Chrome over CDP: DOM text changed, a `window` marker survived, no navigation |
| R22 | pass | inspector block printed; `Runtime.evaluate` ran in the api process |
| R23–R27 | pass | doc sections; 21 tests without `.env`; Biome style probes; hooks reject a type error, an `any` and a failing test |
| R28 | **fail** | jobs, matrix and commands match, but the `links` job's first step exits 1 on `docs/knowledge/tooling.md:167` ("such as `(D12)`"), so lychee never runs |
| R29–R31 | pass | one comment block per PR file; script split exact; `make help` lists 16 targets |
| R32, R33 | pass | a fresh `claude -p` lists the agents with their limits, 11 `mattpocock-skills:` skills and no `superpowers:` |
| R34 | pass | Seams in `architecture.md`; `Blocked by:` on all 26 steps |
| R35 | **fail (minor)** | behaviour holds, but the skill, rule and guide allow a lesson to be "a mechanical check", while R35 still says "one line in a named skill or rule" |
| R35a–R35d | pass | files and hook driven directly (exit 0 / 2 / 0); no live `/ticket-implement` run observed |
| R36 | **fail** | `.claude/rules/tooling.md` still names facts its knowledge doc owns (`:11`, `:13`, `:15`, `:20-21`, `:25-26`, `:30`, `:36-38`, `:45`) |
| R36a, R37–R40 | pass | map complete; 26 subjects in format with `Refs:`; no Cyrillic; stubs typecheck; README question map |

**Not verifiable:** the PR, the squash, a real CI run and the PR title (no remote); lychee itself
(substitute scan: 28 files, 38 links, 0 broken); the `debug.bun.sh` UI; live `/ticket-*` runs.

**Other findings:** following README's new-project steps (delete the ticket folder) breaks two
links, `README.md:32` and `docs/knowledge/architecture.md:5`; `architecture.md` D1 still says "22
step commits".

### Review

#### Standards

Hard violations:

1. **The ticket-id check fails on its own docs** (`ci.yml:104` vs `docs/knowledge/tooling.md:167`).
2. **`build` outside the domain.** `naming.md › Symbols` reserves `build`/`ensure` for pure domain
   operations; `buildPrompt`, `buildObjectKey`, `buildResourceName`, `buildTags` and the new
   `buildResource` (S19c) use it in infrastructure and deployment.

Judgement calls, carried over from run 1: `outbox.repository.ts` holds no adapter and an unbranded
id; `crypto.randomUUID()` inside the domain's `buildExample` against "no ambient state";
`ConfigError` lacks a `<Problem>`; `ea3d4f3` is typed `ci` while 7 of its 8 files are docs and rules.

Smells: `env` and `issues` travel through every reader in `packages/config/load.ts` (Data Clumps);
`application/example/example.service.test.ts` rebuilds the Map repository while
`create.use-case.test.ts` uses `mock()` (Duplicated Code, two fake styles); `example.{llm,storage}.ts`
pass client fields through (Middle Man); the deployment stage is a bare `string` (Primitive
Obsession).

#### Spec

1. **R28:** the `links` job is red at HEAD (as above).
2. **R2, R4:** `feature.md:45` still promises "three frozen template branches".
3. **R28, R35 drift:** the id check is in neither R28 nor `architecture.md › Hooks and CI`; the
   "mechanical check" lesson is in neither R35 nor D34; `blocked: <gate>` is in no requirement.
4. **R35c wording:** `implementer.md` declares `Stop:`, while `plan.md` and `docs/knowledge/sdd.md`
   say `SubagentStop`; behaviour is right (frontmatter `Stop` runs as `SubagentStop`).
5. **Settings summary:** `architecture.md:79` says "git read", but `git add *` is allowed.

### Simplifications

1. `.github/workflows/ci.yml`: move the id grep into a Makefile target that `make check` runs, so
   the hook and pre-commit catch what only CI caught.
2. `README.md:32`, `docs/knowledge/architecture.md:5`: name the ticket as text, not a link, so a
   new project that deletes it keeps a green link check.
3. `biome.json`: enable `noCommonJs` to close the `require()` gap.

### Lessons

| Lesson | Evidence | Proposed change | Applied |
|---|---|---|---|
| A gate that runs only in CI escapes `make check`, the implementer's hook and pre-commit, so a step reports green while CI is red | S19d reported the id check green after a later edit broke it; lychee is likewise only substituted locally (S18a, S19a) | a check: `make check` runs every offline CI gate (the id grep now) | no |
| A step that changes what a requirement asks still leaves `feature.md` behind, even with the S19d rule | R35 and R28 drift (S19d), `feature.md:45` (S19a) | `/ticket-implement`: the Spec axis also asks whether the diff changes what a quoted `R…` asks, and then requires the `feature.md` edit | no |

## 2026-10-16 — run 3

Branch `chore/monorepo-setup` at `7f323a4` against `main` at `67f3adc`. Fresh-context `verifier`
(probes in a scratch clone, working tree left clean), and `code-review` with one `reviewer` agent
per axis.

**Verdict:** fail (one partial). The verifier passes every requirement observable before the merge,
and `make check` is green (`ids`, 87 files linted, 53 typechecked, 22 tests). The Spec axis shows
R28 is partial: `make ids` catches `(D12)` but not a list such as `(D12, R3, Q70)` or a range such
as `(Q60–Q63)`, and the `Makefile`'s own help line carries such a list outside `docs/tickets/`.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | a fresh `bun init -y` differs only in the directory name and a newer transitive `undici-types` |
| R2 | pass (local) | 29 commits: 27 map one-to-one to S1–S19g, 2 re-planning docs commits; the squash is not yet observable |
| R3 | pass | `make check` exits 0 in clean clones at `1ccd0ec`, `2245647`, `3c3e311` |
| R4 | not verifiable | no remote, no merge |
| R5–R13 | pass | catalogs, exact pins equal to `latest`, references equal deps, TS2322 probes, `tsc -b` output only in the cache, structure, no Effect |
| R14, R15 | pass (gap) | 22 forbidden edges fail, 10 allowed pass; `require()` now fails with `noCommonJs`; **gap:** a type-only `import('@oblik/config')` in web client code passes (erased from the bundle) |
| R14a | pass (gap) | relative paths fail in all 7 workspace types; **gap:** a self-reference `@oblik/application/…` inside `application/` passes (no code uses one) |
| R16–R22 | pass | root `.env`, one `ConfigError`, `--hot` with the same PID, `--watch` restart, HMR without a reload in headless Chrome, inspector `Runtime.evaluate` |
| R23–R27 | pass | doc sections; 22 tests without `.env`; Biome style probes; hooks reject a type error, an `any` and a failing push |
| R28 | **partial** | workflow parses and every CI command exits 0 locally; a `(D99)` probe fails `make ids` and `make check`; lists and ranges of ids pass (Spec axis) |
| R29–R31 | pass | one comment block per PR file; scripts split; `make help` lists all 17 targets |
| R32–R36a | pass | agents and plugins as discovered by a fresh `claude -p`; Seams and `Blocked by:` on 29/29 steps; Lessons may be checks; `tooling.md` rule holds imperatives only; map complete |
| R37–R40 | pass | 29 subjects in format with `Refs:`; no Cyrillic; stubs typecheck; README quick start works in a fresh clone; deleting the ticket keeps links and `make ids` green |

**Not verifiable:** the PR, the squash, a real CI run and lychee itself (substitute scan: 0 broken,
also with the ticket deleted, and a planted broken link is caught); the `debug.bun.sh` UI; live
`/ticket-*` runs.

### Review

#### Standards

Hard violations: `issuesOf` in `packages/config/load.test.ts:13` is not verb-first;
`pollIntervalMs = 1_000` in `apps/worker/src/main.ts:5` lacks `as const`; `d838377` is typed `ci`
and bundles three changes (as Q82, left for the squash).

Judgement calls: `aa72463`, `bd09b81` and `7b9c57c` exceed ~400 lines; the `.client` row in
`naming.md` still names `infrastructure/shared`; carried over: `outbox.repository.ts`,
`randomUUID` in `buildId`, `createExample` for a use case, `ConfigError` without `<Problem>`;
`render` is not a listed verb; web has two `main.ts` files.

Smells: the same mocked repository in both `application` tests, with differing `selectById`
signatures (Duplicated Code, new in S19g); `ExampleService.save` and the llm/storage adapters only
delegate (Middle Man); `env`/`issues` in `load.ts` (Data Clumps); an unchecked `as ExampleId` and a
`string` stage (Primitive Obsession).

#### Spec

1. **R28 (hard):** the id pattern misses lists and ranges; `Makefile:39` is the live example.
2. **Deviations not recorded:** `architecture.md:442` still defines `check` without `ids`;
   `noCommonJs` is not in D10's guards; the `.github/PULL_REQUEST_example.md` exemption is in
   neither R28 nor `architecture.md`.
3. **Stale statuses:** S10 and S13 still say `template/*` "cut at this commit".
4. **R2, R4:** pending the PR, as expected.

### Simplifications

1. `application/example/*.test.ts`: one shared fake repository instead of two diverging copies.
2. `Makefile`: drop the `.github/PULL_REQUEST_example.md` exemption, which matches nothing.

### Lessons

| Lesson | Evidence | Proposed change | Applied |
|---|---|---|---|
| A new check is proven red on one form only, so its own docs or other forms slip past | S19d (its example tripped it), S19f (lists and ranges pass) | `/ticket-implement`: a step that adds a check proves it red on every form its requirement names, and green on the check's own docs | yes, S19h (in `implementer.md`, which runs the step) |
| Agents spawned from a long session see the rules as they were when it started | the verifier and both reviewers in runs 2 and 3 found stale rules in context | `/ticket-verify`: run it in a new session after rule edits, or tell each agent to read rules from disk | yes, S19h |
