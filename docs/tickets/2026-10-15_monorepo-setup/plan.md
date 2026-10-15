# Monorepo setup — plan

> Ticket: `2026-10-15_monorepo-setup` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- **Bootstrap.** This ticket creates `/ticket:implement` and `/ticket:verify` itself, so the plan runs in the main session. The steps that come after S16 may use the new commands.
- **Approval gate.** After implementing and verifying a step, stop and report. Commit, or amend, only after the user has reviewed the step and explicitly allowed the commit.
- **One step, one commit** on `chore/monorepo-setup`. The commit format follows R37: `<gitmoji> <type>(monorepo-setup): <Subject>`, plus `Decision:` lines where a choice is non-obvious, and `Refs: docs/tickets/2026-10-15_monorepo-setup/` last. Before committing, set the step's `Status:` to `done` in this file.
- **Test first** wherever a step has behaviour: write the test, watch it fail, then implement. Config-only steps are verified by their **Verify** commands instead.
- **Layer gates.** At the end of each layer, run the gate commands and cut the `template/<layer>` branch at the last commit of that layer (R3, R4). Never rewrite a template branch after it is cut.
- **Versions.** Re-check every pinned version with `npm view <pkg> version` at S2. If a newer stable version exists, pin it and update `feature.md › Context` (R8).
- **Size.** Each step stays at or under ~400 changed lines, not counting `bun.lock`. If a step grows past that, split it and keep the numbering, e.g. `S7a`, `S7b`.
- **Prerequisite for S13 and S19.** A GitHub repository (remote `origin`) must exist. Creating it and pushing to it are outward-facing actions, so ask the user before doing either.

## Steps

### Layer 0 — `main`

#### S0 — Initial commit with `bun init`

- **Goal:** `main` starts with exactly the output of `bun init -y` (R1, R9).
- **Do:**
  1. `git init -b main`
  2. `bun init -y`
  3. `git add` only the files that `bun init` created. `docs/` stays untracked.
  4. Commit: `:tada: chore: Initial commit`.
  5. `git switch -c chore/monorepo-setup`
- **Verify:** `git show --stat HEAD` lists only the `bun init` files (`package.json`, `tsconfig.json`, `index.ts`, `README.md`, `CLAUDE.md`, `.gitignore`, `bun.lock`).
- **Status:** done — `67f3adc`. `bun init` 1.4.3 also ran `bun install` (typescript 7.0.2, @types/bun 1.4.3).

### Layer 1 — `monorepo` → `template/monorepo`

#### S1 — Commit the ticket docs

- **Goal:** the ticket's documents are tracked from the first branch commit (R2, D18).
- **Files:** `docs/tickets/2026-10-15_monorepo-setup/{feature,architecture,plan}.md`.
- **Commit:** `:memo: docs(monorepo-setup): Add ticket docs`.
- **Status:** done

#### S2 — Root workspace, catalog, TypeScript base

- **Goal:**
  - a root workspace with exact catalog pins (R5–R8);
  - a shared TypeScript base and a references root (R10, R12).
- **Files:**
  - `package.json` (`name`, `private`, `type`, `packageManager`, `workspaces`, `catalog`, `devDependencies` via `catalog:runtime`; no scripts yet);
  - `bunfig.toml` (`exact = true`, `linker = "isolated"`);
  - `tsconfig.base.json`, `tsconfig.json` (`files: []`, empty `references`);
  - `.gitignore` (`.env`, `node_modules`, `node_modules/.cache`, `coverage`, `.claude/settings.local.json`; the last is ignored only by the author's global git config, not by the template);
  - delete `index.ts` and the `CLAUDE.md` created by `bun init` (a root `CLAUDE.md` comes back in S15).
- **Verify:**
  - `bun install` succeeds;
  - `grep -E '"[\^~]' package.json` finds nothing;
  - `npm view` matches every catalog entry;
  - `bun check` and `tsc -b` report TS18002 (empty `files` and no references yet). Without any `.ts` file, every form of `bun check` fails ("Nothing to check"), so the typecheck gate goes green from S3 onwards.
- **Status:** done
- **Findings:**
  - Bun rejects explicit workspace paths that do not exist yet (`error: Workspace not found "infrastructure"`). S2 therefore declares only the globs `packages/*` and `apps/*`. Each layer step appends its own path: S3 `domain`, S5 `infrastructure`, S6 `application`, S9 `deployment`.
  - Named catalogs only (D20): `catalogs.runtime` holds the dependencies installed so far, `@types/bun` and `typescript`. There is no default `catalog`. `@biomejs/biome` arrives in S11 and `husky` in S12.
  - Verified: Bun accepts empty namespaces and rejects a reference to an unknown one (`there is no catalog named "missing"`). `bun add -d --catalog=runtime <pkg>@<ver>` writes the version into the namespace, but it also reformats `package.json` with a 1-space indent, which S11 normalises.

#### S3 — `@oblik/domain`

- **Goal:** the domain workspace with shared primitives and the `example` slice: model, errors, port, and the pure `buildExample` (R13, D5).
- **Test first:** `domain/example/example.service.test.ts`.
  - `buildExample` returns a branded id, a trimmed name and the given `createdAt`.
  - It throws `ExampleNameInvalidError` for an empty or blank name.
- **Files:**
  - root `package.json`: append `"domain"` to `workspaces`;
  - `domain/{package.json,tsconfig.json}`;
  - `domain/shared/{id,error}.ts`;
  - `domain/example/example.{model,error,service}.ts`;
  - a reference added to the root `tsconfig.json`.
- **Verify:** `bun test domain` is green, and `bun check` exits 0.
- **Status:** done
- **Findings:** each entity folder and `shared/` get a barrel `index.ts`, which makes the subpath import `@oblik/domain/example` (Q4) possible. Imports inside a workspace are extensionless.

#### S4 — `packages/*` clients and config

- **Goal:**
  - typed config loading from the environment (R16, R18);
  - agnostic client stubs;
  - `api-client` and `ui`.
- **Test first:** `packages/config/load.test.ts`.
  - A valid env returns a typed `Config`.
  - When `API_PORT` is missing and `LOG_LEVEL` is invalid, a single `ConfigError` is thrown, and its `issues` name both variables.
  - Tests pass the env explicitly and never read `.env` (R25).
- **Files:**
  - `packages/config/{package.json,tsconfig.json,config.ts,load.ts,index.ts}`;
  - `packages/{db,storage,queue,llm}/{package.json,tsconfig.json,client.ts}` (stubs taking explicit options, with no internal dependencies; D22);
  - `packages/api-client/{…,index.ts}` (`createApiClient(baseUrl).getHealth()`);
  - `packages/ui/{…,index.ts}`;
  - `.env.example` (read variables first, then commented placeholders);
  - root `tsconfig.json` references.
- **Verify:** `bun test packages` is green, and `bun check` exits 0.
- **Status:** done
- **Findings:**
  - Clients do not depend on `@oblik/config`, because `Config` has no service fields yet (D22).
  - `.env` values: strings are double-quoted and numbers stay bare. Bun strips the quotes, which was verified with `--env-file`.

#### S5 — `@oblik/infrastructure`

- **Goal:** domain ports implemented on top of the clients (R13). The only working adapter is an in-memory `ExampleRepository`; everything else is an export-only stub.
- **Files:**
  - root `package.json`: append `"infrastructure"` to `workspaces`;
  - `infrastructure/{package.json,tsconfig.json}` (deps: `@oblik/domain`, `@oblik/{db,storage,queue,llm}`; `@oblik/config` is added once `Config` has service fields, see D22);
  - `infrastructure/shared/{db.client,outbox.repository}.ts`;
  - `infrastructure/example/example.{repository,storage,queue,llm}.ts`.
- **Verify:** `bun check` exits 0. A one-off REPL check confirms that `upsert` followed by `selectById` round-trips; no test file is required by the feature.
- **Status:** done
- **Findings:**
  - `@oblik/config` is not a dependency yet, because `Config` has no service fields (D22). `createSharedDbClient` takes `url` explicitly.
  - D9 verified: an undeclared workspace import fails at runtime and in `bun check` under the isolated linker.

#### S6 — `@oblik/application`

- **Goal:** an application service plus a use case that composes it. The workspace depends only on `@oblik/domain` (R13, D6).
- **Test first:** `application/example/create.use-case.test.ts`, using a fake `ExampleRepository` built with `mock()` from `bun:test`.
  - The use case builds an example with the injected `now`, saves it once, and returns it.
  - An invalid name propagates `ExampleNameInvalidError`, and `save` is never called.
- **Files:**
  - root `package.json`: append `"application"` to `workspaces`;
  - `application/{package.json,tsconfig.json}`;
  - `application/example/{example.service,create.use-case,index}.ts`, plus `example.service.test.ts`.
- **Verify:** `bun test application` is green, and `bun check` exits 0.
- **Status:** done
- **Findings:**
  - Added `example.service.test.ts` beyond the plan, so `ExampleNotFoundError` is covered.
  - `expect(promise).rejects` must be awaited in `bun test`; otherwise the assertion is silently skipped.
  - Mutation checks confirmed the tests fail on a missing not-found throw and on a double save.
  - D6 verified: importing `@oblik/infrastructure` from `application` fails `bun check` (TS2307).

#### S7 — `@oblik/api`

- **Goal:**
  - a runnable `Bun.serve` with `/health` and `/examples` (R19, R22, R24);
  - `layer.ts` as the composition root (D17);
  - root `.env` loading through `--env-file` (R17, R30).
- **Test first:** `apps/api/src/http.test.ts`. It runs `Bun.serve({ port: 0, routes: buildRoutes(buildLayer()) })` and checks:
  - `GET /health` → `{ status: 'ok' }`;
  - `POST /examples` followed by `GET /examples/:id` round-trips;
  - an unknown id → 404.
- **Files:**
  - `apps/api/{package.json,tsconfig.json}` (scripts `dev`, `debug`, `start`, as in architecture.md › Environment);
  - `apps/api/src/{main,http,layer}.ts`.
- **Verify:**
  - `bun test apps/api` is green;
  - `cd apps/api && bun run dev` serves on `API_PORT` taken from the root `.env`;
  - **R19 (manual):** `curl /health`, edit the response text, `curl` again → the text has changed and `pgrep -f apps/api` shows the same PID;
  - **R22 (manual):** `bun run debug` prints the inspector URL;
  - **V1:** with `.env` removed, record how `--env-file` behaves in `docs/knowledge/tooling.md` (written in S18).
- **Status:** done
- **Findings:**
  - `buildLayer()` takes no `Config` yet, for the same reason as D22.
  - Domain errors map to HTTP statuses by `_tag`: 404 for not found, 422 for an invalid name, 400 for a malformed body.
  - R17, R19 and R22 were verified manually. Under `--hot` the PID stays the same, but module state is rebuilt, so in-memory examples are lost on reload; only `globalThis` survives.
  - V1: Bun silently ignores a missing `--env-file`, and `loadConfig` then reports the missing variables. Variables exported in the shell work, so CI needs no `.env`.

#### S8 — `@oblik/worker` and `@oblik/web`

- **Goal:**
  - the worker: a polling stub that restarts on change (R20);
  - the web app: a Bun fullstack server with HMR that uses only `api-client` and `ui` (R15, R21);
  - debug scripts for both (R22).
- **Files:**
  - `apps/worker/{package.json,tsconfig.json}`;
  - `apps/worker/src/{main,layer}.ts`, `apps/worker/src/handlers/example.handler.ts`;
  - `apps/web/{package.json,tsconfig.json}` (adds `DOM` to `lib`; deps: only `@oblik/api-client`, `@oblik/ui`, `@oblik/config`).

    `@oblik/config` is needed for `WEB_PORT`, and only `src/main.ts` may import it (D19). Record a `Decision:` line in the commit.
  - `apps/web/src/{main.ts,index.html}`, plus `app/`, `features/example/` and `shared/`.
- **Verify:**
  - `bun check` exits 0;
  - **R20 (manual):** while `bun run dev` runs in `apps/worker`, edit the handler → a restart log appears;
  - **R21 (manual):** while `bun run dev` runs in `apps/web`, edit the client code → the browser updates without a refresh, and the page shows the api health fetched through `api-client`.
- **Status:** todo

#### S9 — `@oblik/deployment` stubs

- **Goal:** stub files only. No `@pulumi/*`, and everything typechecks (R39).
- **Files:**
  - root `package.json`: append `"deployment"` to `workspaces`;
  - `deployment/{package.json,tsconfig.json,Pulumi.yaml}`;
  - `deployment/local/{docker-compose.yml,README.md}`;
  - `deployment/aws/{index,config,database,storage,queue,api,worker,web,iam}.ts`;
  - `deployment/shared/{naming,tags}.ts`.
- **Verify:** `bun check` exits 0 and reports the `deployment` project.
- **Status:** todo

#### S10 — Makefile

- **Goal:** the root Makefile as the human interface, compatible with GNU Make 3.81 (R30, R31). The root `package.json` gains only `test` for now; `prepare`, `lint` and `format` arrive with their tools.
- **Files:** `Makefile` with these targets:
  - `help` (default), `setup`;
  - `dev`, `dev-{api,worker,web}`, `debug-{api,worker,web}`;
  - `typecheck`, `test`, `clean`, `outdated`;
  - `check`, which for now runs `typecheck` and `test`; `lint` and `fmt` are added in S11.
- **Verify:**
  - `make help` lists every target;
  - `make setup` creates `.env` from `.env.example`;
  - `make dev` starts all three apps in parallel;
  - `make check` is green;
  - `mv .env .env.bak && bun test` passes (R25).
- **Layer gate:**
  - `make check` is green, and `git status` is clean after `tsc -b` (R12);
  - then cut the template branch: `git branch template/monorepo`.
- **Status:** todo

### Layer 2 — `tooling` → `template/tooling`

#### S11 — Biome and layer guards

- **Goal:**
  - a single root Biome config in kotodama style (R26);
  - the layer-boundary rules (R14, R15, D10);
  - the scripts `lint` and `format`.
- **Do:**
  1. `bunx biome init`;
  2. adapt the generated config following architecture.md › Biome;
  3. write one `noRestrictedImports` override per row of the dependency-rules table — resolve **V2**, the exact option shape, first;
  4. `bun run format` across the repo.
- **Files:**
  - `biome.json`;
  - root `package.json`, adding the scripts `lint` and `format`; `bun add -d --catalog=runtime @biomejs/biome@<ver>`;
  - `Makefile`, adding `lint` and `fmt` and adding `lint` to `check`.
- **Verify:**
  - `make lint` is green;
  - **R14/R15 negative checks:** temporarily add `import '@oblik/infrastructure'` in `domain/` and `import '@oblik/config'` in `apps/web/src/app/`. `make lint` must fail on both with the override's message, and `@oblik/config` in `apps/web/src/main.ts` must pass (D19). Revert both changes.
- **Status:** todo

#### S12 — Husky hooks

- **Goal:** `pre-commit` runs `bun check` and staged Biome; `pre-push` runs `bun test` (R27, R9).
- **Do:** `bunx husky init`, then replace the generated hook.
- **Files:**
  - `.husky/pre-commit`: `bun check`, then `bunx biome check --staged --no-errors-on-unmatched`;
  - `.husky/pre-push`: `bun test`;
  - root `package.json`, adding the `prepare: husky` script; `bun add -d --catalog=runtime husky@<ver>`.
- **Verify:**
  - a commit containing a type error is rejected;
  - a commit containing a lint error in a staged file is rejected;
  - a push with a failing test is rejected. Test this against a throwaway local bare remote so nothing is pushed outward.
- **Status:** todo

#### S13 — `.github`: PR templates and CI

- **Goal:** the PR template, a worked example and CI, adapted from kotodama-core (R28, R29).
- **Files:**
  - `.github/PULL_REQUEST_TEMPLATE.md`;
  - `.github/PULL_REQUEST_example.md`, rewritten around this ticket;
  - `.github/workflows/ci.yml` with:
    - the jobs `static`, `test` and `links`;
    - triggers: `pull_request` and `push` to `[main, 'template/*']`;
    - a matrix of the version pinned via `bun-version-file: package.json` and `latest` (non-blocking);
    - `lychee --offline` on `README.md`, `docs/**/*.md` and `.claude/**/*.md`.
- **Verify:**
  - `ci.yml` is valid YAML;
  - every step command runs locally: `bun install --frozen-lockfile && bunx biome ci && bun check && bun test`;
  - **V3:** confirm that the `isolated` linker causes no failures in the local runs of S11–S13.

    If it does, switch to `hoisted` and record a `Decision:`.
  - After the remote exists (ask first): push the branch and confirm all three jobs pass.
- **Layer gate:** `make check` is green, then `git branch template/tooling`. After the remote exists, push it and confirm CI is green (R4).
- **Status:** todo

### Layer 3 — `claude` → `template/claude`

#### S14 — `.claude/rules` and settings

- **Goal:** seven rules adapted from kotodama-core, plus project permissions (R32, R34, R36–R38).
- **Files:** `.claude/rules/{claude-md,comments,naming,commits,pull-requests,tooling,sdd}.md` and `.claude/settings.json`.
  - Apply the adaptations listed in architecture.md › `.claude` adaptation.
  - `sdd.md` states the approval gate (D21): no commit or amend of a step without the user's explicit OK.
  - `tooling.md` states the `.env` convention: string values double-quoted, numbers bare (R16).
  - `tooling.md` states the catalog rule (D20): versions only in `catalogs.<namespace>`, never the unnamed `catalog:`. A new lock-step family gets its own namespace. Every other dependency goes to `runtime`.
  - `tooling.md` holds imperatives only, ≤ ~80 lines, and links to `docs/knowledge/tooling.md`. That link resolves after S18; lychee runs in CI on the PR, which by then includes S18.
- **Verify:**
  - every rule is ≤ ~80 lines;
  - `grep -ri notion .claude/rules` finds nothing;
  - all content is in English.
- **Status:** todo

#### S15 — `CLAUDE.md` files

- **Goal:** a root `CLAUDE.md` and one per layer (R32, R33).
- **Files:**
  - root `CLAUDE.md`, ≤ ~40 lines: a one-line project summary, links to the layer map and the SDD flow, and the rule "SDD artifacts live only in `docs/tickets/`; ignore artifact paths that plugins suggest";
  - `{domain,application,infrastructure,packages,apps,deployment}/CLAUDE.md`, each covering allowed imports, file role suffixes and that layer's verbs.
- **Verify:** `wc -l` keeps every file ≤ ~40 lines, and each layer's file matches its row in the dependency-rules table.
- **Status:** todo

#### S16 — Agents and commands

- **Goal:** three agents and five flat commands (R32, R35, R35a, D14, D21).
- **Files:**
  - `.claude/agents/{researcher,implementer,verifier}.md`. `researcher` and `verifier` set `disallowedTools: Edit, Write, NotebookEdit`; no agent sets `model:`.
  - `.claude/commands/ticket:{feature,architecture,plan,implement,verify}.md`. Each command takes the ticket path, `@`-includes the matching `docs/tickets/_template/*`, and persists the agent output (for example, verify writes `verification.md`).
  - `implementer.md` stops after verifying a step and returns a summary: the diff stat, the verification output, and a proposed commit message. It never runs `git commit`. `ticket:implement.md` shows that summary and commits only after the user explicitly approves (D21).
- **Verify:**
  - the frontmatter of each agent is correct;
  - the commands appear in Claude Code's `/` menu;
  - a dry run of `/ticket:implement` stops before committing.
- **Status:** todo

#### S17 — Vendored skills

- **Goal:** reduced copies of `grilling`, `codebase-design` and `tdd`, with paths rewritten to `docs/tickets/` (R32, D15).
- **Files:** `.claude/skills/{grilling,codebase-design,tdd}/SKILL.md`. The frontmatter records the upstream repo and version (`mattpocock/skills`, main @ commit).
- **Verify:**
  - `grep -r "\.scratch\|docs/superpowers" .claude/` finds nothing;
  - the skills appear in Claude Code's skill list.
- **Status:** todo

#### S18 — Docs: templates, knowledge, README

- **Goal:**
  - ticket templates (R33, R34);
  - the starter knowledge docs (R23, R36);
  - `README.md` (R40).
- **Files:**
  - `docs/tickets/_template/{feature,architecture,plan,verification}.md`;
  - `docs/knowledge/tooling.md`, covering scripts and Makefile, `--hot` vs `--watch`, `--dev` not existing, debug, `.env` plus the V1 finding, the catalog namespaces (D20) and upgrades, references plus the `tsc -b` cache;
  - `docs/knowledge/architecture.md`, covering layers, dependency rules and the Effect seam;
  - `docs/knowledge/sdd.md`, covering `/ticket:*` usage, starting a project from a template, and deleting this ticket's docs when doing so;
  - `README.md`, replacing the one from `bun init`.
- **Verify:**
  - `lychee --offline README.md docs .claude` passes;
  - `make check` is green.
- **Layer gate:** `git branch template/claude`.
- **Status:** todo

### Wrap-up

#### S19 — Verify, PR, merge

- **Goal:** an independent verification, then one squash-merged PR (R2, R4).
- **Do:**
  1. Run `/ticket:verify`. It writes `verification.md`, with a verdict for each requirement R1–R40 and proposed simplifications.
  2. If the verdict lists simplifications or failures, fix them in new steps `S19a…`, re-run `/ticket:verify`, and repeat until the verdict is pass.

     These fixes land **after** the template branches are cut. Templates are never rewritten (D1). If a fix matters for a template, cut a new versioned template branch, and only after asking the user.
  3. Commit `verification.md`.
  4. After asking the user: push the branch, open the PR from the template, and squash-merge it once CI is green.
  5. After asking the user: push `template/{monorepo,tooling,claude}`.
- **Verify:**
  - `git log main --oneline` shows two commits: the `bun init` commit and the squash;
  - all three template branches exist on the remote with green CI.
- **Status:** todo

## Requirement coverage

| Req | Steps | Req | Steps |
|---|---|---|---|
| R1 | S0 | R21 | S8 |
| R2 | S1, S19 | R22 | S7, S8 |
| R3 | S10, S13, S18 (gates) | R23 | S18 |
| R4 | gates, S19 | R24 | S3, S6, S7 |
| R5–R8 | S2 | R25 | S4, S10 |
| R9 | S0, S11, S12 | R26 | S11 |
| R10 | S2–S9 | R27 | S12 |
| R11 | S3–S9 | R28–R29 | S13 |
| R12 | S2, S10 | R30 | S7, S8, S10–S12 |
| R13 | S3–S9 | R31 | S10 |
| R14 | S3–S9 (deps), S11 (lint) | R32 | S14–S17 |
| R15 | S8, S11 | R33 | S15, S18 |
| R16 | S4 | R34 | S14, S18 |
| R17 | S7, S8 | R35, R35a | S16 (+ S14 for R35a) |
| R18 | S4 | R36 | S14, S18 |
| R19 | S7 | R37 | every commit, S14 |
| R20 | S8 | R38 | S14–S18 |
| | | R39 | S9 |
| | | R40 | S18 |
