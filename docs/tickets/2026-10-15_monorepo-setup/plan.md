# Monorepo setup — plan

> Ticket: `2026-10-15_monorepo-setup` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- **Bootstrap.** This ticket creates `/ticket-implement` and `/ticket-verify` itself, so the plan runs in the main session. The steps that come after S16 may use the new commands.
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
  - **V1:** with `.env` removed, record how `--env-file` behaves in `docs/knowledge/tooling.md` (written in S18a).
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
- **Status:** done
- **Findings:**
  - `--watch` restarts by exec: the PID stays the same, but `globalThis` is reset. `--hot` keeps `globalThis`, so `setInterval` duplicates on every reload. Verified with a probe script; this confirms D11.
  - The web dev server rebuilds the client bundle on edit (`Reloaded in 0ms`, new bundle hash). The browser-side HMR update needs a human check in an open tab.
  - Changes beyond the plan:
    - D23: a `/api/*` proxy in `apps/web/src/main.ts`;
    - D24: an in-memory `ExampleQueue`, so `infrastructure` no longer depends on `@oblik/queue`;
    - `api-client` now resolves paths relative to its base URL, so `/api/` keeps working.

#### S9 — `@oblik/deployment` stubs

- **Goal:** stub files only. No `@pulumi/*`, and everything typechecks (R39).
- **Files:**
  - root `package.json`: append `"deployment"` to `workspaces`;
  - `deployment/{package.json,tsconfig.json,Pulumi.yaml}`;
  - `deployment/local/{docker-compose.yml,README.md}`;
  - `deployment/aws/{index,config,database,storage,queue,api,worker,web,iam}.ts`;
  - `deployment/shared/{naming,tags}.ts`.
- **Verify:** `bun check` exits 0 and reports the `deployment` project.
- **Status:** done
- **Findings:** the `workspaces` list is now complete (R5). Both YAML files parse. `Pulumi.yaml` has not been validated by the `pulumi` CLI, which is not installed; the deploy ticket covers that. The region `eu-central-1` is a placeholder.

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
- **Status:** done — layer gate passed, `template/monorepo` cut at this commit.
- **Findings:**
  - `bun --filter './apps/*' dev` already runs long-running scripts concurrently, so `--parallel` is not needed.
  - `make clean` removes every per-workspace `node_modules` that the isolated linker creates.

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
  - root `package.json`, adding the scripts `lint` and `format`; `bun add -d --catalog=runtime @biomejs/biome@<ver>` (moved to `catalog:tools` in S12, D20);
  - `Makefile`, adding `lint` and `fmt` and adding `lint` to `check`.
- **Verify:**
  - `make lint` is green;
  - **R14/R15 negative checks:** temporarily add `import '@oblik/infrastructure'` in `domain/` and `import '@oblik/config'` in `apps/web/src/app/`. `make lint` must fail on both with the override's message, and `@oblik/config` in `apps/web/src/main.ts` must pass (D19). Revert both changes. The full probe set is listed in architecture.md › Dependency rules.
- **Status:** done
- **Findings:**
  - Biome 2.5 uses `"preset": "recommended"`. `noRestrictedImports` lives in `style`, and its `patterns[].group` is gitignore-style (V2).
  - Overrides on the same file replace each other's options, so they do not merge.
  - The import model changed to a downward stack (Q45–Q48, D6), enforced with deny-lists. Verified with 20 probe imports and the `apps/web/src/main.ts` exception.
  - A relative cross-workspace import is caught by `bun check` (TS6059/TS6307), so no Biome rule is needed for it (Q44).

#### S11a — Workspace subpath imports and import groups

- **Goal:** absolute imports inside each workspace and grouped import blocks (R14a, D25, D26). Added on the user's request during S11.
- **Files:**
  - every workspace `package.json` gains `imports` (`#<workspace>/*`);
  - 69 relative specifiers in 31 files are rewritten mechanically;
  - `biome.json` gets the relative-path ban in every override and at top level, plus `organizeImports.groups`.
- **Verify:**
  - `make check` passes;
  - all three apps boot through `make dev`, including `#web/index.html`;
  - the probes reject `./…`, `../…` and `export * from './…'` while the layer guards still fire;
  - type probes with `@ts-expect-error` traps and an `any`/`unknown` control show the types are preserved;
  - `biome check` fails on an ungrouped import block.
- **Status:** done

#### S12 — Husky hooks

- **Goal:** `pre-commit` runs `bun check` and staged Biome; `pre-push` runs `bun test` (R27, R9).
- **Do:** `bunx husky init`, then replace the generated hook.
- **Files:**
  - `.husky/pre-commit`: `bun check`, then `bunx biome check --staged --no-errors-on-unmatched`;
  - `.husky/pre-push`: `bun test`;
  - root `package.json`, adding the `prepare: husky` script; `bun add -d --catalog=tools husky@<ver>`; `@biomejs/biome` moves to `tools` too (Q51, D20).
- **Verify:**
  - a commit containing a type error is rejected;
  - a commit containing a lint error in a staged file is rejected;
  - a push with a failing test is rejected. Test this against a throwaway local bare remote so nothing is pushed outward.
- **Status:** done
- **Findings:**
  - `husky init` writes `bun test` into `pre-commit`; it was replaced as planned.
  - A fresh clone gets the hooks through `prepare` (`core.hooksPath = .husky/_`).
  - Verified in a throwaway clone with a local bare remote:
    - a type error blocks the commit (TS2322), and so does a staged `any` (`noExplicitAny`);
    - a clean commit passes;
    - a failing test blocks the push, and green tests let it through.
  - The catalogs were split into `tools` (husky, biome) and `runtime` (Q51, D20).

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
- **Status:** done — layer gate passed, `template/tooling` cut at this commit.
- **Findings:**
  - Actions pinned to the current majors: `checkout@v7`, `cache@v6`, `setup-bun@v2`, `lychee-action@v2`. The pinned Bun comes from `packageManager` through `bun-version-file`.
  - Every CI command runs green locally, and `--frozen-lockfile` rejects a catalog/lock drift.
  - Relative links check out (6 files, 0 broken) with a script that follows `lychee --offline` semantics.
  - V3: the isolated linker caused no tool failures.
  - Not yet verified on GitHub: `actionlint`, the real lychee run and the workflow itself. They need the remote, which is deferred to S19 (Q52).

### Layer 3 — `claude` → `template/claude`

#### S14 — `.claude/rules` and settings

- **Goal:** seven rules adapted from kotodama-core, plus project permissions (R32, R34, R36–R38).
- **Files:** `.claude/rules/{claude-md,comments,naming,commits,pull-requests,tooling,sdd}.md` and `.claude/settings.json`.
  - Apply the adaptations listed in architecture.md › `.claude` adaptation.
  - `sdd.md` states the approval gate (D21): no commit or amend of a step without the user's explicit OK.
  - `naming.md` and `tooling.md` state the import rules: `#<workspace>/…` inside a workspace, `@oblik/…` across workspaces, never relative paths, and the import group order (D25, D26).
  - `tooling.md` states the `.env` convention: string values double-quoted, numbers bare (R16).
  - `tooling.md` states the catalog rule (D20): versions only in `catalogs.<namespace>`, never the unnamed `catalog:`. `tools` holds only developer-workflow tools (`husky`, `biome`); everything else, `typescript` and `@types/bun` included, goes to `runtime`. A new lock-step family gets its own namespace.
  - `tooling.md` holds imperatives only, ≤ ~80 lines, and links to `docs/knowledge/tooling.md`. That link resolves after S18; lychee runs in CI on the PR, which by then includes S18.
- **Verify:**
  - every rule is ≤ ~80 lines;
  - `grep -ri notion .claude/rules` finds nothing;
  - all content is in English.
- **Status:** done
- **Findings:**
  - All seven rules are 23–56 lines and are scoped with `paths:` where a rule only matters for code or docs.
  - `settings.json` puts `git commit`, `git push`, `gh pr create` and `gh repo create` under `ask`, so Claude Code itself enforces the approval gate (D21).
  - The links to `docs/knowledge/{tooling,architecture}.md` point forward to S18; lychee runs on the PR, after S18.

#### S15 — `CLAUDE.md` files

- **Goal:** a root `CLAUDE.md` and one per layer (R32, R33).
- **Files:**
  - root `CLAUDE.md`, ≤ ~40 lines: a one-line project summary, links to the layer map and the SDD flow, and the rule "SDD artifacts live only in `docs/tickets/`; ignore artifact paths that plugins suggest";
  - `{domain,application,infrastructure,packages,apps,deployment}/CLAUDE.md`, each covering allowed imports, file role suffixes and that layer's verbs.
- **Verify:** `wc -l` keeps every file ≤ ~40 lines, and each layer's file matches its row in the dependency-rules table.
- **Status:** done
- **Findings:**
  - Root `CLAUDE.md` is 27 lines; the layer files are 9–13 lines each and link to the rules instead of restating them.
  - Lychee in CI does not scan `CLAUDE.md` files. Adding `'**/CLAUDE.md'` to its args was proposed but not applied.

#### S18a — Knowledge docs and README for what is built

- **Goal:** document the monorepo that already works, before the SDD flow is rebuilt (R23, R36, R40, D35, D37).
- **Blocked by:** S15.
- **Files:**
  - `README.md` (replaces the `bun init` one): what Oblik+ is; the quick start (`make setup`, `make dev`, URLs); a map from reader question to document; starting a new project from `template/*`;
  - `docs/knowledge/tooling.md`:
    - *how-to*: every `make` target; run and debug (`debug.bun.sh`); add a dependency (`--catalog=<namespace>`); add a workspace; upgrade versions;
    - *explanation*: `--hot` vs `--watch` and why there is no `--dev` (with the `globalThis` experiment); `.env` and `--env-file` (V1); `tools`/`runtime` catalogs; project references and the `tsc -b` cache; hooks and CI;
    - *reference*: troubleshooting table, symptom → cause → fix (TS2307, TS6059/TS6307, Biome `noRestrictedImports` and `organizeImports`, a hook rejecting a commit or push, `--frozen-lockfile`);
  - `docs/knowledge/architecture.md`: layers and the downward rule with a Mermaid diagram and the matrix; `#<workspace>/` vs `@oblik/`; where things live; **add a new entity**, step by step through every layer along the `example` slice; the Effect seam (`layer.ts`, `_tag`, ports in `.service.ts`); the three boundary guards.
- **Verify:**
  - every command quoted in the docs runs as written;
  - the links from `.claude/rules/{tooling,naming}.md` and the root `CLAUDE.md` now resolve;
  - `make check` is green.
- **Status:** done
- **Findings:**
  - Every quoted command was run in a throwaway clone: `make setup`, `make dev` (api `/health`, web `/` and the `/api/*` proxy), `make debug-api` (the `debug.bun.sh` block), `bun add --catalog=runtime zod@3.25.76` inside `packages/config`, `bunx tsc -b`, `make outdated`. The troubleshooting messages were reproduced there as well.
  - **Timers under `--hot`, checked by experiment:** after one edit both the old and the new `setInterval` keep ticking, and a `globalThis` counter reads 2. Under `--watch` only the new one runs. This is now the documented reason for D11.
  - **D10 corrected:** a relative path into a *referenced* workspace (`application` → `../../domain/…`) passes `bun check`. TS6059/TS6307 appear only for an unreferenced one, so the Biome relative-path ban (D25) is the real guard.
  - A declared `workspace:*` dependency without a `tsconfig.json` reference also passes `bun check`; the docs ask for the reference anyway, for `tsc -b`.
  - `README.md` points to `.claude/rules/sdd.md` until S18b writes `docs/knowledge/sdd.md`.
  - `lychee` is not installed locally. A script checked every relative link and anchor in `README.md`, the root and layer `CLAUDE.md` files, `.claude/rules/` and `docs/knowledge/`: none is broken.

#### S16 — SDD wrapper skills, agents and hook

- **Goal:** five user-invoked wrapper skills over `mattpocock-skills`, four agents, and the `implementer` gate (R32, R35–R35d, D14, D27–D31).
- **Blocked by:** S14, S15.
- **Files:**
  - `.claude/skills/ticket-{feature,architecture,plan,implement,verify}/SKILL.md` with `disable-model-invocation: true`. Each skill names the plugin skills it delegates to and states the path and gate overrides explicitly. `ticket-feature` overrides `domain-modeling` to write only to `docs/knowledge/glossary.md`.
  - `.claude/agents/{researcher,implementer,reviewer,verifier}.md`. `researcher`, `reviewer` and `verifier` set `disallowedTools: Edit, Write, NotebookEdit`. `implementer` preloads `tdd` via `skills:` and has a `SubagentStop` hook.
  - `.claude/hooks/make-check.sh`: runs `make check`; on failure it exits 2 with the trimmed output.
  - The former `.claude/commands/` is removed (it was never committed).
- **Verify:**
  - a fresh `claude -p` session lists four agents with the right tool limits and five `/ticket-*` skills;
  - the hook blocks with a failing test and passes when green, tested directly with a crafted input;
  - `make check` passes.
- **Status:** todo

#### S17 — Plugin wiring and SDD rule

- **Goal:** the project declares its plugins, and `sdd.md` shrinks to constraints (R32, R33, D29, D32).
- **Blocked by:** S16.
- **Files:**
  - `.claude/settings.json`: `enabledPlugins` turns `mattpocock-skills` on and `superpowers` off;
  - `.claude/rules/sdd.md`: artifact paths, EARS, Seams, `Blocked by`, gates and toolkit layout (skills, not colon commands); procedures move to the skills;
  - root `CLAUDE.md`: the glossary lives in `docs/knowledge/glossary.md`; never create `GLOSSARY.md`, `CONTEXT.md` or `docs/adr/`.
- **Verify:**
  - a fresh session reports `mattpocock-skills` skills available and `superpowers` skills absent;
  - **live override test (Q64):** a throwaway `/ticket-feature` run in a scratch clone, where one domain term is agreed. The term must land in `docs/knowledge/glossary.md`, with no `GLOSSARY.md` or `docs/adr/`. Record the result; if the override does not hold, stop and ask.
- **Status:** todo

#### S18b — SDD guide, dependency map and ticket templates

- **Goal:**
  - `docs/knowledge/sdd.md` written from the built and tested flow (R36, D37);
  - the dependency map: a table and a diagram rendered from the skill and agent `metadata`, kept equal by a test (R36a, D36);
  - ticket templates with Seams, `Blocked by` and Lessons (R33–R35).
- **Blocked by:** S16, S17.
- **Files:**
  - `docs/knowledge/sdd.md`: when to run the full cycle and when a short one is enough; the five `/ticket-*` skills (input → what the user decides → output); the dependency map; what is overridden in the plugin and why; the approval gate and the reviewer; plugin updates and what to re-check afterwards; Lessons;
  - `docs/tickets/_template/{feature,architecture,plan,verification}.md`;
  - the consistency test for the dependency map. Its location (a small `tools` workspace or `deployment`-like leaf) is decided in this step, so that `bun check` and `bun test` cover it;
  - root `CLAUDE.md` and README link to `sdd.md`.
- **Verify:**
  - the test fails after a deliberate `metadata` edit and passes after the table is updated;
  - a relative-link scan of `README.md`, `docs/`, `.claude/` and every `CLAUDE.md` finds nothing broken;
  - `make check` is green.
- **Layer gate:** `git branch template/claude`.
- **Status:** todo

### Wrap-up

#### S19 — Verify, PR, merge

- **Goal:** an independent verification, then one squash-merged PR (R2, R4).
- **Do:**
  1. Run `/ticket-verify`. It writes `verification.md`, with a verdict for each requirement R1–R40 and proposed simplifications.
  2. If the verdict lists simplifications or failures, fix them in new steps `S19a…`, re-run `/ticket-verify`, and repeat until the verdict is pass.

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
| R3 | S10, S13, S18b (gates) | R23 | S18a |
| R4 | gates, S19 | R24 | S3, S6, S7 |
| R5–R8 | S2 | R25 | S4, S10 |
| R9 | S0, S11, S12 | R26 | S11 |
| R10 | S2–S9 | R27 | S12 |
| R11 | S3–S9 | R28–R29 | S13 |
| R12 | S2, S10 | R30 | S7, S8, S10–S12 |
| R13 | S3–S9 | R31 | S10 |
| R14, R14a | S3–S9 (deps), S11, S11a (lint) | R32 | S14–S17 |
| R15 | S8, S11 | R33 | S15, S17, S18b |
| R16 | S4 | R34 | S14, S18b |
| R17 | S7, S8 | R35–R35d | S16, S17 (+ S14 for R35a) |
| R18 | S4 | R36, R36a | S14, S18a, S18b |
| R19 | S7 | R37 | every commit, S14 |
| R20 | S8 | R38 | S14–S18b |
| | | R39 | S9 |
| | | R40 | S18a |
