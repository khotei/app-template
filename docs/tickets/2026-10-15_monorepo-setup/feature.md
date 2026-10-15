# Monorepo setup

> Ticket: `2026-10-15_monorepo-setup` · Source: [Notion — Monorepo for Oblik+](https://app.notion.com/p/3fafb28bd5f18000b396d7d348ab3e7d)
> Related: [architecture.md](./architecture.md) · plan.md (next step, `/ticket:plan`)

## Goal

Build a Bun + TypeScript 7 monorepo skeleton for Oblik+. It has to be:

- small enough to extend without first deleting anything;
- complete enough that every layer of the [target architecture](https://app.notion.com/p/3f6fb28bd5f180809f29d196639f2331) already has a compiling, tested example;
- usable as a starting point for future projects, through frozen `template/*` branches.

Alongside the code, set up an in-repo spec-driven development (SDD) flow (feature → architecture → plan → implement → verify) that keeps every artifact inside the repository.

## Context

- **Product.** Oblik+ is a workstation for a records department: people (roster), documents, reports, and LLM-assisted analysis. This ticket ships **no product behaviour**. It only prepares the ground.
- **Target topology** comes from the architecture page, a modular monolith with:
  - `domain/` — pure core;
  - `packages/` — agnostic clients;
  - `infrastructure/` — domain-specific adapters;
  - `application/` — services and use cases;
  - `apps/` — thin entry points (`api`, `worker`, `web`);
  - `deployment/` — local Docker Compose, AWS Pulumi.
- **Conventions donor** is [`khotei/kotodama-core`](https://github.com/khotei/kotodama-core): `.claude/rules`, agents, Biome style, tsconfig options, PR template, CI. Its topology, Effect/Drizzle code and git history are **not** carried over.
- **Workflow donor** is [`mattpocock/skills`](https://github.com/mattpocock/skills): grilling, codebase-design, tdd. Only reduced, vendored copies are used.
- **Tooling facts, checked 2026-10-15** (versions are re-verified at implementation time):

  | Tool | Version / fact |
  |---|---|
  | bun | 1.4.3 |
  | typescript | 7.0.2 |
  | @biomejs/biome | 2.5.15 |
  | husky | 9.1.7 |
  | @types/bun | 1.4.3 |
  | `bun check` | built-in native typechecker |
  | `--dev` flag | does **not** exist |
  | root `.env` | does **not** reach processes started via `--filter` or from a package dir |
  | `composite` + `noEmit` | fails with TS6310 |
  | system `make` | GNU Make 3.81 |

## Scope

- Git: an initial `bun init` commit on `main`, one ticket branch, and three frozen template branches.
- Bun workspaces, with a named root catalog (`runtime`) for exact dependency versions.
- TypeScript 7 project references, with one shared base config.
- An `example` vertical slice through every layer. Plain TS, no Effect, mostly export-only stubs. `api`, `worker` and `web` are minimally runnable.
- A single root `.env` and a typed config loader.
- Dev, debug and hot-reload modes, documented with a plain explanation of `--hot` vs `--watch`.
- `bun test` setup with colocated example tests.
- Biome with layer-boundary rules, husky hooks, GitHub PR template and CI.
- Makefile as the human interface, and a minimal root `package.json`.
- `.claude/`: CLAUDE.md files, rules, 3 agents, 5 commands, 3 vendored skills, project settings.
- `docs/`: ticket templates, this ticket's documents, and starter knowledge docs.
- `README.md`.

## Out of scope

- Effect, plus real Postgres, S3, queue and LLM integrations. The clients are stubs.
- Oblik+ domain entities (`roster`, `document`, `report`, `analysis`).
- A working `docker-compose.yml`, Pulumi stacks, the `@pulumi/*` dependencies, and deploys.
- A UI framework (React etc.) and real UI components.
- A shared `test-utils` package. Only built-in `bun:test` is used.
- `.vscode/launch.json`, CODEOWNERS, issue templates, Renovate/Dependabot.
- A rename script for reusing templates. Renaming the `@oblik/*` scope is a manual step.
- Auth, observability, outbox processing, publishing packages.

## Requirements

### Git and branches

- **R1** — THE repository SHALL have a `main` branch whose first commit contains exactly the output of `bun init -y`.
- **R2** — THE implementation SHALL happen on a single branch `chore/monorepo-setup`, with one commit per `plan.md` step, merged into `main` through one squash-merged PR. The first step SHALL commit this ticket's documents, so every `template/*` carries them as a worked example of the SDD flow. A project started from a template deletes them.
- **R3** — `plan.md` SHALL group its steps into three consecutive layers: `monorepo`, `tooling`, `claude`. WHEN the last step of a layer is committed, THE implementer SHALL create the branch `template/<layer>` at that commit.
- **R4** — Each `template/*` branch SHALL pass `make check` and CI on its own, and SHALL stay frozen after creation. Its commits outlive the ticket branch; `main` holds the single squashed result.

### Workspaces and versions

- **R5** — THE root `package.json` SHALL declare:
  - the workspaces `domain`, `application`, `infrastructure`, `packages/*`, `apps/*` and `deployment`;
  - `packageManager: "bun@<pinned>"`;
  - named `catalogs`, starting with `runtime` only, and no default `catalog`.
- **R6** — Every external dependency version SHALL be declared exactly once, as an exact version (no `^`/`~`), in a named root catalog. For now there is one namespace, `runtime`, and it holds every dependency (tools included). A family of packages whose versions must move together (e.g. `effect` + `@effect/*`, `@pulumi/*`) SHALL get its own namespace when it is introduced. Workspaces SHALL reference versions with `"catalog:<namespace>"`; the unnamed `"catalog:"` SHALL NOT be used. Internal dependencies SHALL use `"workspace:*"`.
- **R7** — The root `bunfig.toml` SHALL set `[install] exact = true` and an explicit `linker`.
- **R8** — The pinned versions SHALL be the latest stable ones at implementation time, verified with `npm view`.
- **R9** — Each tool SHALL be scaffolded with its own init command first (`bun init`, `biome init`, `husky init`), and the result then adapted.

### TypeScript

- **R10** — Shared compiler options SHALL live only in the root `tsconfig.base.json`. Each workspace `tsconfig.json` SHALL extend it and list `references` to its internal dependencies. The root `tsconfig.json` SHALL reference every workspace.
- **R11** — WHEN `bun check` runs at the root, THE SYSTEM SHALL typecheck every workspace and exit non-zero on any type error.
- **R12** — WHEN `tsc -b` runs, THE SYSTEM SHALL succeed and emit only declarations and build info, into a gitignored cache directory.

### Layers and the example slice

- **R13** — Every layer SHALL contain the `example` slice listed in [architecture.md › Structure](./architecture.md#structure). It SHALL be plain TypeScript, without Effect.
- **R14** — Layer dependency rules ([architecture.md › Dependency rules](./architecture.md#dependency-rules)) SHALL be enforced by workspace `dependencies` and by Biome `noRestrictedImports`. WHEN a forbidden cross-layer import is added, THE `biome check` command SHALL fail.
- **R15** — `apps/web` client code (`src/app/`, `src/features/`, `src/shared/`) SHALL import no internal package other than `@oblik/api-client` and `@oblik/ui`. The server entry `apps/web/src/main.ts` MAY additionally import `@oblik/config`, and nothing else internal.

### Environment and config

- **R16** — THE repository SHALL have a single gitignored root `.env` and a committed `.env.example`. `.env.example` SHALL list the variables the code actually reads; placeholders for stubbed services stay commented out. String values SHALL be double-quoted (`NODE_ENV="development"`); numeric values stay bare (`API_PORT=3000`).
- **R17** — WHEN an app script runs, whether started from the root via `make` or from its own package directory, THE app SHALL receive the root `.env` variables through `--env-file`.
- **R18** — WHEN a required variable is missing or invalid, `loadConfig` SHALL throw a single error that names every offending variable.

### Dev, hot reload and debug

- **R19** — WHILE `make dev-api` is running, WHEN a handler source file changes, THE api SHALL serve the new response without restarting its process (same PID; `--hot`).
- **R20** — WHILE `make dev-worker` is running, WHEN a source file changes, THE worker SHALL restart its process (`--watch`).
- **R21** — WHILE `make dev-web` is running, WHEN a client source file changes, THE browser SHALL update through Bun HMR.
- **R22** — WHEN `make debug-<app>` runs, THE process SHALL expose a Bun inspector (`--inspect`) and keep the reload mode of its dev target.
- **R23** — `docs/knowledge/tooling.md` SHALL explain `--hot` vs `--watch`, note that `--dev` does not exist, and describe how debugging works.

### Testing

- **R24** — WHEN `bun test` runs at the root, THE SYSTEM SHALL run every colocated `*.test.ts`. The slice SHALL include one example test each in `domain`, `application` and `apps/api`.
- **R25** — Tests SHALL NOT depend on the presence of a root `.env`.

### Quality gates

- **R26** — Formatting and lint SHALL be configured once, in the root `biome.json`, with kotodama style: 2 spaces, width 100, single quotes, `semicolons: asNeeded`, `useImportType`, `noExplicitAny`.
- **R27** — Husky SHALL run on `pre-commit`: `bun check` and `biome check --staged`; and on `pre-push`: `bun test`.
- **R28** — CI SHALL run on `pull_request` and on `push` to `main` and `template/*`. It SHALL:
  - run `bun install --frozen-lockfile`, `biome ci`, `bun check` and `bun test`;
  - use a Bun matrix of pinned (blocking) and `latest` (non-blocking);
  - run `lychee --offline` on `README.md`, `docs/**/*.md` and `.claude/**/*.md`.
- **R29** — `.github/` SHALL contain `PULL_REQUEST_TEMPLATE.md` and `PULL_REQUEST_example.md`, adapted from kotodama-core. The example SHALL be rewritten around this ticket.

### Scripts and Makefile

- **R30** — Scripts SHALL be split as follows:
  - the root `package.json` holds only `prepare`, `lint`, `format` and `test`;
  - `apps/*` hold `dev`, `debug` and `start`;
  - library workspaces hold no scripts.
- **R31** — There SHALL be exactly one `Makefile`, at the root; no workspace has a Makefile. It SHALL be compatible with GNU Make 3.81, and `make help` SHALL list every target with its description.

### Claude and SDD

- **R32** — `.claude/` SHALL contain:
  - root `CLAUDE.md` (≤ ~40 lines), plus one `CLAUDE.md` per layer (`domain`, `application`, `infrastructure`, `packages`, `apps`, `deployment`);
  - rules: `claude-md`, `comments`, `naming`, `commits`, `pull-requests`, `tooling`, `sdd`;
  - agents: `researcher`, `implementer`, `verifier`;
  - commands: `ticket:feature`, `ticket:architecture`, `ticket:plan`, `ticket:implement`, `ticket:verify`;
  - vendored skills: `grilling`, `codebase-design`, `tdd`;
  - `settings.json`.
- **R33** — SDD artifacts SHALL live only in `docs/tickets/<YYYY-MM-DD>_<slug>/`, as `feature.md`, `architecture.md`, `plan.md` and `verification.md`. Their templates SHALL live in `docs/tickets/_template/`. The root `CLAUDE.md` SHALL tell agents to ignore artifact paths that come from plugins.
- **R34** — `feature.md` requirements SHALL be written in EARS. Non-obvious choices SHALL be recorded in `architecture.md › Decisions` and in a `Decision:` line in the commit.
- **R35** — `researcher` and `verifier` SHALL NOT be able to edit files. `/ticket:verify` SHALL persist the verifier's report to `verification.md`.
- **R35a** — WHEN the implementer finishes a plan step, `/ticket:implement` SHALL present the change summary and its verification results, and SHALL NOT commit (or amend) until the user explicitly approves that step.
- **R36** — `.claude/rules/tooling.md` SHALL hold short agent-facing imperatives and link to `docs/knowledge/tooling.md` for the explanations. No fact is written in both places. `docs/knowledge/` SHALL start with `tooling.md`, `architecture.md` (layers, dependency rules, the Effect seam) and `sdd.md` (how to run `/ticket:*`).
- **R37** — Commits and PR titles SHALL follow `<gitmoji> <type>(<scope>): <Subject>`, ending with `Refs: docs/tickets/<ticket>/`.
- **R38** — All `.claude/` and `docs/` content SHALL be in English.

### Deployment and README

- **R39** — `deployment/` SHALL contain stub files only: `docker-compose.yml`, the Pulumi files, `naming`, `tags`. It SHALL have no `@pulumi/*` dependencies and SHALL still typecheck.
- **R40** — `README.md` SHALL contain:
  - a one-line description;
  - a quick start (`make setup && make dev`);
  - a layer map linking to `docs/knowledge/`;
  - pointers to the tooling and SDD docs.

  It SHALL link to these documents, not restate them.

## Acceptance

| Req | How to verify |
|---|---|
| R1–R4 | `git log main --reverse` shows the `bun init` commit first. `git branch -a` lists `template/{monorepo,tooling,claude}`. CI is green on each of them. |
| R5–R8 | `grep -R '"\^\|"~' **/package.json` finds nothing. Every external dependency is `catalog:<namespace>`, and `grep -rn '"catalog:"' --include=package.json .` finds nothing. `npm view` matches the catalogs. |
| R10–R12 | `bun check` exits 0. Adding a type error in `application` makes it exit 1. `tsc -b` exits 0 and `git status` stays clean. |
| R14–R15 | Add `import … from '@oblik/infrastructure'` in `domain/` → `make lint` fails. Same for `@oblik/domain` or `@oblik/config` inside `apps/web/src/app/`. `@oblik/config` in `apps/web/src/main.ts` passes. |
| R17–R18 | `make dev-api` serves on `API_PORT` from `.env`. `cd apps/api && bun run dev` does the same. Removing `API_PORT` → startup error names `API_PORT`. |
| R19 | `curl /health`, then edit the handler text, then `curl` again: the response has changed and `pgrep` shows the same PID. |
| R20–R21 | Editing a worker file prints a restart log. Editing `web` client code updates the browser without a manual refresh. |
| R22 | `make debug-api` prints the inspector URL, and `debug.bun.sh` attaches. |
| R24–R25 | `mv .env .env.bak && bun test` → all tests pass. |
| R27 | A commit with a type error is rejected. A push with a failing test is rejected. |
| R28 | The PR shows the `static`, `test` and `links` jobs. A broken relative link in `docs/` fails `links`. |
| R30–R31 | `make help` lists all targets. `find . -name Makefile -not -path ./Makefile -not -path '*/node_modules/*'` finds nothing. |
| R32–R38 | The files exist. `/ticket:verify` writes `verification.md`. `/ticket:implement` stops before committing and commits only after an explicit approval. Agent frontmatter for `researcher` and `verifier` disallows `Edit`/`Write`. |
| R39–R40 | `bun check` covers `deployment`. `lychee --offline README.md` passes. |

## Open questions

None. The design was settled by grilling on 2026-10-15.

## To verify during implementation

- **V1** — how `--env-file` behaves when the file is missing (CI).
- **V2** — the exact option shape of Biome 2.5 `noRestrictedImports` (`paths` vs `patterns`, negation).
- **V3** — whether the `isolated` linker works with every tool (husky, biome, lychee action).
