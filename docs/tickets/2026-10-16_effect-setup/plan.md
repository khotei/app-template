# Effect setup — plan

> Ticket: `2026-10-16_effect-setup` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- **Branch and commits.** Work happens on `chore/effect-setup`, with one commit per step through
  `/ticket-implement`, made only after the user's OK. Before committing, set the step's `Status:`
  to `done`. Commits follow `.claude/rules/commits.md`, with the scope `effect-setup`. Three
  exceptions keep a message the format does not shape, because the PR's squash merge drops branch
  messages: the squash commit that `git subtree` writes with its own text and trailers; S4's
  one-time `git subtree add` merge (scope `effect-setup`, subject only); and every merge commit
  that `make vendor-effect` writes (scope `deps`, subject only).
- **Green at every commit.** Each step leaves `make check` green, because from S6 on `pre-commit`
  runs the patched `tsc -b`, and `--no-verify` is banned. The layer gates of R2 fall on S7,
  S19 and S22.
- **Size.** A step changes ≤ ~400 lines, counted as R3 says: without `repos/`, `bun.lock` and the
  generated `openapi.json`, and S1, which holds only the ticket's documents, is exempt. A step that
  grows past this splits into `Sna`, `Snb`.
- **Versions.** S2 re-checks every pin with `bun info <pkg> version`. A newer stable version is
  pinned, `feature.md › Context` is updated, and S4 vendors that tag.
- **Until the `claude` layer lands**, the ticket's documents override older guidance:
  - `architecture.md › Contracts` and this plan win over the layer `CLAUDE.md` files, `naming.md`
    and `docs/knowledge/architecture.md`;
  - from S8 on, read `repos/effect/LLMS.md` before writing Effect code, and verify every API
    against `repos/effect`, not against memory;
  - steps S5 and S6 change commands, so each fixes the lines in `.claude/rules/tooling.md` and
    `docs/knowledge/tooling.md` that it makes false. Conventions are rewritten in S20–S22.
- **Tests only at the Seams** of `architecture.md`. A step whose behaviour is observed at a later
  step's seam says `config only` and names that seam.
- **Deviations** are recorded in the step's findings, in `architecture.md › Decisions` when they
  are decisions, and in `feature.md` when they change what a requirement asks.
- **Wrap-up is not a layer.** S23 changes no code; it runs `/ticket-verify`, which writes
  `verification.md`, and opens the PR.
- **Open checks V1–V6** (`feature.md`, `architecture.md`) are settled in the step that names them.
  Each one's outcome is recorded in that step's findings.

## Steps

### Layer 1 — `setup`

#### S1 — Commit the ticket docs

- **Goal:** the ticket's documents are tracked first (R1).
- **Blocked by:** none.
- **Files:** `docs/tickets/2026-10-16_effect-setup/{architecture,plan}.md`, and the amendments to
  `feature.md`.
- **Test first:** config only.
- **Verify:** `make check`; `git show --stat HEAD` lists only the ticket folder.
- **Status:** done
- **Findings:** the two review passes reshaped the design before the commit: use cases became
  methods of `ExampleService`, the job became `ExampleSummaryJob` with `enqueue` and `worker`
  (D2, D16, D17), and R1, R3, R20 were amended for the docs-only step, the subtree commits and
  adapters that are values or functions.

#### S2 — Catalogs and the Effect language service

- **Goal:**
  - the `effect`, `typescript` and `tools` catalogs pinned exactly (R4);
  - `@effect/tsgo` scaffolded by `effect-tsgo setup` and then trimmed (R6);
  - the plugin in `tsconfig.base.json`, and `prepare` = `husky && effect-tsgo patch` (R7);
  - `bun check` unchanged (R9 as first written; S6 later made the patched `tsc -b` the only gate).
- **Blocked by:** S1.
- **Files:**
  - root `package.json`: `catalogs.effect`; `catalogs.typescript` (`typescript` moves out of
    `runtime`); `catalogs.tools` gains `vitest`; root `devDependencies`; `prepare`;
  - `tsconfig.base.json`;
  - `bun.lock`.
- **Test first:** config only.
- **Verify:**
  - `bun install`;
  - `node_modules/.bin/tsc --version` contains `effect-tsgo`;
  - `grep -E '"[\^~]' package.json` finds nothing, and `bun info` matches every pin;
  - `make check`.
- **Status:** done
- **Findings:** every pin of `feature.md › Context` was still the registry `latest`.
  `effect-tsgo setup --project tsconfig.base.json --typescript` wrote `prepare` as
  `husky && effect-tsgo patch --typescript --no-oxlint`, replaced the two `catalog:typescript`
  references with literal versions, and added `$schema` plus `plugins` to `tsconfig.base.json`.
  Trimmed: the flags (`--typescript` is redundant, since a bare `patch` finds only the installed
  TypeScript and exits 0; `--no-oxlint` is not a documented flag) and the literal versions; kept: `$schema`, which gives
  editors completion for the plugin's diagnostic options. `bun install` after `make clean` reports
  `7.0.2+effect-tsgo.0.53.2`, and a second install is idempotent ("hash matches the replacement").
  Not in the step's file list but edited: the catalog table and the `prepare` line in
  `docs/knowledge/tooling.md`, which this step made false (`sdd.md`: knowledge docs change in the
  commit that changes the behaviour); the gate description in its TypeScript section (`bun check`
  ignores `plugins`, only the patched `tsc` reports Effect diagnostics) waits for S6, which adds
  the gate. `vitest` sits in `tools` as a developer-workflow runner, while `@effect/vitest` stays in
  `effect` because it is released in lock-step with `effect`. The unused `effect` catalog entries
  sit in `bun.lock` without a resolved package until S8 declares a consumer.

#### S3 — Exclude `repos/` and add `make vendor-effect`

- **Goal:** everything ignores `repos/` before it exists, and one target vendors the pinned tag
  (R10, R11, D13).
- **Blocked by:** S1.
- **Files:**
  - `biome.json` (`!repos`);
  - `Makefile` (`vendor-effect`: one `git subtree pull --squash --prefix repos/effect` of the
    pinned tag; `ids` excludes `repos/`);
  - `.github/workflows/ci.yml` (lychee excludes `repos/`).
- **Test first:** config only.
- **Verify:**
  - with a scratch `repos/x/bad.ts` (lint errors, a ticket id), `make check` stays green; remove it
    afterwards;
  - `make help` lists `vendor-effect`.
- **Status:** done
- **Findings:**
  - The probe was red on `ids` and `lint` before the change and green after. It held no test
    file, so it missed that a bare `bun test` still collects `*.test.ts` under `repos/`; found
    by S4's implementer before vendoring. S4 is now blocked by S5, whose vitest config excludes
    `repos/**`.
  - **Simplified on review.** A first version guarded the pin, shallow-fetched the tag, chose `add`
    or `merge`, built a `commits.md` message from a `TICKET` variable, and in a fresh clone had to
    fetch the previous split commit by SHA, because `git subtree merge` aborts without it
    (`fatal: could not rev-parse split hash`). The target is now one `git subtree pull --squash` of
    the tag. It fetches the tag's full history, which holds the previous split, into the local
    `.git` only: just the squash commit is reachable, so nothing extra is pushed. The first
    vendoring is a one-time `git subtree add` with the same arguments, in S4. Recorded in D13.
  - The message is a subject only (`:wrench: chore(deps): Vendor effect at effect@<pin>`): branch
    commits are squashed by the PR merge, and the squash commit keeps `git subtree`'s own text and
    trailers.
  - **R10 reworded** from "the same commit" to "the same PR": `git subtree` refuses any staged or
    unstaged change, so a catalog bump and its vendoring are two branch commits. Updated:
    `feature.md` R10, `architecture.md` D13 and its risk row, and
    `docs/knowledge/tooling.md › Upgrade versions`, which also says to copy the subtree trailers
    into the PR body.
  - Checked on a local fixture upstream with tags `effect@4.0.5`–`4.0.7`: the manual `add`, a
    `make vendor-effect` pull to a newer tag, and the pull from a fresh clone that lacks the old
    split commit.
  - lychee gets `--exclude-path '^repos/'` (the value is an unanchored regex) although its inputs
    never reach `repos/`; it was not run locally (no binary).
  - Also edited: the `make ids` and `make vendor-effect` rows of `docs/knowledge/tooling.md`.
  - **V1 is moot:** no step makes a shallow fetch any more, so `.git/shallow` never appears; S4
    only checks that it stays absent. Marked in `feature.md` and `architecture.md`.
  - R10 is rewritten in EARS form; what it asks is unchanged by that.

#### S4 — Vendor the Effect source

- **Goal:** `repos/effect` is a squashed subtree at `effect@<pinned>` (R3, R10).
- **Blocked by:** S2, S3, S5 (until vitest excludes `repos/**`, a bare `bun test` collects
  Effect's own tests from `repos/` and fails).
- **Files:** `repos/effect/**`, written on a clean tree after the user's OK by the one-time
  `git subtree add --squash --prefix repos/effect https://github.com/Effect-TS/effect.git effect@4.0.5 -m ':wrench: chore(effect-setup): Vendor effect at effect@4.0.5'`
  (the arguments of `make vendor-effect`, with `add` for `pull` and the ticket scope; the tag
  follows the catalog pin).
  `git subtree` writes the squash commit and the merge commit itself (R1). This step's `Status:`
  is set in the next step's commit.
- **Test first:** config only.
- **Verify:**
  - the `git subtree add` exits 0, and `git log -2` shows the merge commit and the squash commit
    with `git-subtree-dir:` and `git-subtree-split:`;
  - `make vendor-effect` right after reports the subtree up to date;
  - `repos/effect/packages/effect/package.json` `version` equals the catalog pin;
  - `repos/effect/LLMS.md` exists;
  - `make check`;
  - `.git/shallow` is absent.
- **Status:** done
- **Findings:**
  - Vendored as `9bedf0df8` (squash, `git-subtree-split: 7f524e25c`) and `f9c364e75` (merge):
    2789 files, ~1.06M lines, a 53 MB tree on disk, of which 580 are `*.test.ts`. The split
    equals the `effect@4.0.5` tag commit.
  - The precondition was re-run before the add: a failing `repos/x/probe.test.ts` left
    `make test` green; the probe was removed first.
  - `make vendor-effect` right after: `Subtree is already at commit 7f524e2…`, no new commit.
  - `repos/effect/packages/effect/package.json` is `4.0.5`, equal to the pin; `LLMS.md` exists;
    `.git/shallow` is absent.
  - The gates did not slow down: Biome still checks 88 files, `bun check` 53 files in 14 projects,
    vitest still runs 5 test files, and `make check` takes ~0.5 s, as before the add.
  - `Status: done` and these findings landed in S6's commit, as this step's entry says, because
    `git subtree` commits by itself.

#### S5 — vitest 5 on Bun replaces `bun:test`

- **Goal:**
  - one root `vitest.config.ts` that excludes `repos/**` (R11, R12, D9);
  - any failure exits non-zero (R13);
  - no `bun:test` import left (R14);
  - `pre-push` and CI test through vitest (R16).
- **Blocked by:** S2.
- **Files:**
  - `vitest.config.ts`;
  - root `package.json`: `test` = `bun --bun vitest run`, and the `vitest` devDependency;
  - `Makefile` (`test` = `bun run test`);
  - `.husky/pre-push` (`make test`);
  - `ci.yml` (test job runs `bun run test`);
  - `.claude/settings.json`: deny `bun test`;
  - the five existing `*.test.ts` files: imports from `vitest`, `mock` → `vi.fn`;
  - the false lines in `.claude/rules/tooling.md` and `docs/knowledge/tooling.md`;
  - the `bun test` mentions in `.github/PULL_REQUEST_TEMPLATE.md`, `.github/PULL_REQUEST_example.md`
    and the `bun:test` import example in `docs/knowledge/architecture.md`.
- **Test first:** config only. The red check is R13: a deliberately failing test.
- **Verify:**
  - `make test` runs every workspace's tests;
  - a failing test in `domain` and then in `apps/api` each makes `make test` exit non-zero;
  - `mv .env .env.bak && make test` passes;
  - `git grep "from 'bun:test'" -- ':!docs/tickets'` finds nothing;
  - a scratch failing `repos/x/probe.test.ts` leaves `make test` green; remove it afterwards;
  - **V3:** decide whether `test` forces `--reporter=default` under `CLAUDECODE`;
  - **V6:** moot, see Findings.
- **Status:** done
- **Findings:**
  - **Simplified on review.** A first version declared a project per workspace: the raw
    `workspaces` globs make vitest refuse to start (they also match `packages/CLAUDE.md`), and the
    workaround expanded `<glob>/package.json` in ~20 lines, for nothing the plan needs beyond
    names in the reporter. The config is now one line: the default exclude plus `repos/**`, which
    a failing `repos/x/probe.test.ts` and a fake `repos/effect` with its own vitest config both
    confirm. V6 is moot: there are no projects.
  - **V3:** no forced reporter. vitest picks `minimal` under an agent (`CLAUDECODE`, `AI_AGENT`),
    which prints every failure in full plus a summary; humans and CI get `default`.
  - A failing test makes `make test` exit 2 (vitest 1 → `bun run` 1 → make 2), so R12–R15's
    acceptance says "non-zero"; the `it.effect` part of that row is checked from S8.
  - Three files outside the original list held `bun test` or `bun:test` and are fixed here:
    the two PR templates and the import example in `docs/knowledge/architecture.md`.

#### S6 — The patched `tsc -b` gate

- **Goal:** `make check`, `pre-commit` and CI typecheck with the patched `tsc -b` alone and fail on
  Effect diagnostics; `bun check` leaves every gate (R8, R9, R16, D8).
- **Blocked by:** S2, S4.
- **Files:**
  - `Makefile` (`typecheck` = `bunx tsc -b`);
  - `.husky/pre-commit` (`make typecheck`, then the staged Biome check);
  - `ci.yml` (`static`: `tsc --version | grep effect-tsgo`, then `make typecheck`, no `bun check`);
  - the lines that name `bun check` as a gate: `.claude/rules/tooling.md`,
    `docs/knowledge/{tooling,architecture}.md`, the PR template and example,
    `.claude/agents/reviewer.md`, a comment in `apps/api/src/http.test.ts`.
- **Test first:** config only; the red check is a floating stand-in Effect, and S8 repeats it on a
  real `Effect.log`.
- **Verify:**
  - `make check`;
  - **V2:** `tsc -b` walks the references, and `git status` shows no emitted file;
  - `tsc -b --verbose` lists no project under `repos/` (R11);
  - a floating Effect fails `make typecheck`, `pre-commit` and the CI commands, also at `warning`
    severity.
- **Status:** done
- **Findings:**
  - **One gate, on review.** The first version ran `bun check && tsc -b`. The patched `tsc` is
    TS 7 over the same references, so it reports every type error `bun check` does, and no probe
    found an error that only `bun check` catches; `bun check` passes a floating Effect, because it
    ignores tsconfig plugins. The user approved dropping it: R9 is rewritten (`tsc -b` only, and
    `bun check` is not a gate), R11 and R16 no longer name it, and D8, the Configuration lines,
    the Structure tree and the risk row follow.
  - Every surface calls `bunx tsc` through `make typecheck`: `make` does not put
    `node_modules/.bin` on `PATH`, `bunx` resolves the local, patched binary
    (`7.0.2+effect-tsgo.0.53.2`), and the root `package.json` may hold no `typecheck` script.
  - **Red before S8.** A structural stand-in for an Effect value (an interface with the
    `'~effect/Effect'` variance struct of `repos/effect/packages/effect/src/Effect.ts`), floating
    in a scratch `domain/zz-probe.ts`, passes `bun check` and fails `make typecheck`,
    `.husky/pre-commit` and the CI commands with
    `TS377001 … neither yielded nor used in an assignment. effect(floatingEffect)`. Lowered to
    `warning` in `diagnosticSeverity`, it still fails `tsc -b` (exit 2); set to `off`, it passes.
    The same file under `repos/x/` leaves `make typecheck` green. Every probe was removed.
  - The guard table of `docs/knowledge/architecture.md` holds under `tsc -b`: an undeclared
    workspace import gives TS2307, a relative path into an unreferenced workspace TS6059/TS6307,
    and a workspace importing itself by name still passes (a known gap).
  - **A missing project reference is caught by no gate.** With `application`'s reference to
    `domain` removed, both `bun check` and `tsc -b` stay green: TS 7 resolves the workspace through
    its package symlink and checks its sources. `docs/knowledge/tooling.md` said `tsc -b` needs
    the reference, and now says so honestly.
  - **V2:** after `tsc -b --clean`, `tsc -b --verbose` builds the 14 referenced projects and
    nothing under `repos/`; a warm run takes ~0.2 s. Emits land only in the gitignored
    `node_modules/.cache/tsc/<workspace>`, and `git status` shows no new file. One exception: on
    TS6059 (a relative import of another workspace's file), `tsc -b` still emits, and writes that
    file's `.d.ts` next to its source. Biome then fails on the stray file; delete it. Biome bans
    the relative path in the first place.
  - Outside the first file list: the PR template and example self-check line, the reviewer agent's
    list of enforced gates, and a test comment, which named `bun check` as the gate. New
    troubleshooting rows cover a failed patched-`tsc` assertion and an `effect(<rule>)` diagnostic.

#### S7 — Biome bans for Effect

- **Goal:**
  - `domain`, code and tests alike, may import no workspace and no `@effect/*` package except
    `@effect/vitest` (R17);
  - web client code may import no `effect` or `@effect/*` (R33);
  - imports from `repos/` fail (R11);
  - a v3-only package fails `make typecheck` with TS2307, with no lint rule (R5).
- **Blocked by:** S1.
- **Files:** `biome.json`.
- **Test first:** config only. Probe edits are the red check.
- **Verify:**
  - `make lint` fails for each of these probe edits, each then reverted:
    - `@effect/platform-bun` or `@oblik/config` in `domain/`;
    - `effect` in `apps/web/src/features/`;
    - `../../repos/effect/…`;
  - `make lint` passes for `effect`, `vitest` and `@effect/vitest` in a `domain/*.test.ts`, and for
    `effect` in `apps/web/src/main.ts`;
  - `@effect/platform` in `application/` fails `make typecheck` with TS2307;
  - `make check` is green. This is the **`setup` layer gate**.
- **Status:** done
- **Findings:**
  - **No v3 ban, on review.** A first version banned the v3-only packages with a message mapping
    each to its v4 replacement. Biome overrides replace the whole `noRestrictedImports` options
    (probed: a root `paths` ban fired in an unmatched root file but not under `domain/` or
    `application/`), so the ban had to repeat in the root and all ten overrides, ~116 lines. The
    user withdrew it: no v3 package is declared or installed, so
    `import { HttpApi } from '@effect/platform'` in `application/` fails `make typecheck` with
    `TS2307: Cannot find module '@effect/platform'` (exit 2), and agents verify APIs against
    `repos/effect`. R5 is rewritten onto R37, and D18 records the rejected ban.
  - **No allow-list or test override, on review.** A second version made `domain` an allow-list
    (`**` minus `effect`, `effect/**`, `#domain/**`) with a `domain/**/*.test.ts` override adding
    the test runner, which had to repeat the group. The user asked that tests follow their
    workspace's rule, so `domain` is a deny-list again, extended: `@oblik/**` and `@effect/**`
    except `@effect/vitest`. R17 is amended to match, and D18 records the rejected allow-list.
    The trade-off: a third-party package or `node:*` in `domain` is no longer caught by lint;
    review and R19's grep cover purity.
  - **Web.** Only client code is banned from `effect` (R33); the server entry `src/main.ts`, whose
    own override replaces the client one, may import `effect` and needs to from S9, which reads
    `WEB_PORT` through `WebConfig.layer`.
  - Outside the file list: `docs/knowledge/architecture.md` (the `domain` bullet and matrix row,
    the guard table and paragraph) and `docs/knowledge/tooling.md` (the `domain` troubleshooting
    row, a web row, and a link instead of restating what each override repeats).

### Layer 2 — `modules`

#### S8 — The queue port on `PersistedQueue`

- **Goal:** `packages/queue` offers `JobQueue { send, consume }`, `QueueClient`, `QueueError`,
  `QueueClientMemory` and `createQueueClientSqlite` (R23, D1). `consume`:
  - logs each failed attempt and the final dead-letter (R28, D11);
  - never stops on a failure;
  - releases an in-flight message on interrupt without counting the attempt (R29).
- **Blocked by:** S5, S6.
- **Files:**
  - `packages/queue/{queue,memory,sqlite,index}.ts` and `queue.test.ts`; `client.ts` is removed
    (it has no importer);
  - `packages/queue/package.json`: `effect`, `@effect/sql-sqlite-bun`, `@effect/vitest`, and
    `exports`.
- **Test first:** seam **`JobQueue` suite**, run against memory and against SQLite on a temp file:
  - send and consume;
  - a repeated id is delivered once;
  - a message survives a rebuilt layer on the same file;
  - the loop continues after a failure.
  Retries on the schedule, dead-lettering and the interrupt release are observed at the
  `ExampleSummaryJob` seam in S13, under `TestClock` (D10).
- **Verify:**
  - `make check`;
  - **R8 probe:** a bare `Effect.log('x')` statement in `queue.ts` fails `make typecheck`
    (`tsc -b`) while `bun check` passes. Then revert it;
  - **R16:** a real `git commit` of that floating `Effect.log` is rejected by `pre-commit`. Then
    remove it;
  - **R13 with `it.effect`:** a deliberately failing `it.effect` makes `make test` exit non-zero.
    Then remove it.
- **Status:** done
- **Findings:**
  - **The gate rejected every unstable import (D19).** `effect/persistence` and all of
    `@effect/vitest` (`it` included) are `@stability unstable`, and `unstableApiUsage` defaults to
    `warning`, which fails `tsc -b`. Outside the file list: `tsconfig.base.json` lowers the rule
    to `suggestion` and sets `includeSuggestionsInTsc: false`; `docs/knowledge/tooling.md ›
    TypeScript` says so. Recorded in D19 and the Configuration line.
  - **`QueueClient.make` takes `QueueDefinition<Schema.Codec<A, I>>`**, not `<S extends
    Schema.Top>`: `PersistedQueue` carries the schema's decoding and encoding services in its `R`,
    which `JobQueue` has no channel for, and a `Codec` with the default `never` services rejects
    such a schema at compile time. `QueueDefinition<S extends Schema.Top>` and `satisfies
    QueueDefinition<typeof Schema>` are unchanged. Contracts updated.
  - `queue.ts` also exports `layerPersisted` (`QueueClient` over any `PersistedQueueStore`), which
    `memory.ts` and `sqlite.ts` share; `index.ts` leaves it out, so the engine stays hidden.
  - **`consume`** wraps every non-interrupt failure of `handle`, defects included, into a private
    `AttemptFailed` after logging it (`Warn` per attempt, `Error` when `attempts >= maxAttempts`,
    annotated `queue`, `messageId`, `attempt: n/max`), so the store retries or dead-letters it and
    the loop then swallows it; an interrupt-only cause re-interrupts, so the store releases the
    message. A scratch probe (memory, `maxAttempts: 1`, a handler interrupted mid-flight) saw the
    message delivered again to a second `consume`: the attempt was not counted. Retries, dead-letter
    logs and the interrupt release stay for S13's seam.
  - The suite runs under `it.live`: the SQL store polls and refreshes locks on the clock, which
    `TestClock` would freeze. It runs in ~0.1 s. Each test case was also seen red: dropping the id
    in `send` fails the dedup case on both stores, dying on `AttemptFailed` fails the loop case, and
    `:memory:` in place of the file fails the rebuilt-layer case.
  - Probes, each removed: a top-level `Effect.log('x')` in `queue.ts` failed `make typecheck`
    with `TS377001 … effect(floatingEffect)` while `bun check` passed; `git commit` of it (only
    that file staged) exited 1 from `pre-commit`, HEAD unchanged; a failing `it.effect` made
    `make test` exit 2.
  - **Known gaps from review, accepted as is:**
    - a message that fails to decode (api and worker schemas drifted) is dead-lettered inside
      `PersistedQueue.take` and never reaches `handle`, so it is not logged (R28 and D11 cover only
      handler failures);
    - a handler that interrupts itself, while the consumer is not interrupted, releases the
      message uncounted and then ends `consume`;
    - the suite uses `it.live`, not `TestClock` (R14), for the reason above; S13 keeps `TestClock`
      on the memory store.
  - Review judgement calls left for a later pass: the private marker `AttemptFailed` is not named
    `<Problem>Error` and its comment is `//`, not TSDoc; `attempt` is logged as the string
    `n/max`.

#### S9 — Config as services

- **Goal:**
  - `ApiConfig`, `WebConfig`, `RuntimeConfig` and `QueueConfig` (R29a), each a `Context.Service`
    with a `static layer` on `Config.all` (R21, D7);
  - `MinimumLogLevelFromConfig`;
  - tests on a replacement `ConfigProvider` (R15);
  - `.env.example` and `.gitignore` for the queue file (R22);
  - the legacy `loadConfig` removed, so the three `main.ts` read the services' layers in a
    transitional form until S17–S19 rewrite them on the Effect runtime.
- **Blocked by:** S5.
- **Files:**
  - `packages/config/{config,index}.ts` and `config.test.ts`; `load.ts` and `load.test.ts` are
    removed;
  - `packages/config/package.json`;
  - `apps/{api,worker,web}/src/main.ts` and their `package.json` (`effect`);
  - `.env.example` (`QUEUE_SQLITE_PATH`, `QUEUE_LOCK_*`, `LOG_LEVEL`);
  - `.gitignore` (`.data/`);
  - the rule and knowledge lines that named `loadConfig` as the way to read settings.
- **Test first:** seam **a service's `layer` under `ConfigProvider.fromUnknown`**:
  - a missing `API_PORT` fails `Layer.build` with a `ConfigError` naming it;
  - the defaults apply;
  - each `LOG_LEVEL` literal reaches `References.MinimumLogLevel` through
    `MinimumLogLevelFromConfig`; a lower-case value is rejected naming `LOG_LEVEL`.
- **Verify:**
  - `make check`;
  - **V5:** whether `Config.LogLevel` accepts lower case, settling the `.env.example` value.
- **Status:** done
- **Findings:**
  - **R21 amended: the error names the first offending variable, not every one.** A first pass
    built a generic `createConfigLayer` (`Effect.validate` over every field of every area, a
    structural `Area` type, `Context.makeUnsafe`, `ConfigInvalidError`) to name them all. The
    user chose Effect's `Config` alone: `Config.all`, `Config.schema(Schema.Struct)` and
    `Layer.mergeAll` of per-area layers each report only the first failure (probed on
    effect 4.0.5), so the hand-written machinery was the only way to the old wording. D7 records
    the rejection; `feature.md` carries the amendment and the new acceptance row.
  - **V5 settled: lower case is rejected.** `Config.LogLevel` is `Schema.Literals(LogLevel.values)`
    (`All`, `Fatal`, `Error`, `Warn`, `Info`, `Debug`, `Trace`, `None`). `.env.example` has
    `LOG_LEVEL="Info"`; the quoting example in `docs/knowledge/tooling.md` follows.
  - **The legacy loader goes now, not in S19.** Keeping `loadConfig` beside the new layers left a
    window in which a `.env` copied from the new `.env.example` (`Info`) broke the legacy loader
    (`info` only). The three `main.ts` keep their shape (`Bun.serve`, the poll loop) and read
    their services in one `Effect.runSync` over the merged layers; S17–S19 replace them on the
    full runtime. S19 keeps the web entry, HMR and the modules gate.
  - **An existing `.env` with `LOG_LEVEL="info"` now fails `make dev-web` and `make dev-worker`
    at startup** (`dev-api` reads no `RuntimeConfig` yet), and `make setup` copies `.env.example`
    only when `.env` is missing. The troubleshooting table has the row; the developer's `.env`
    needs `LOG_LEVEL="Info"` and, from S12, `QUEUE_SQLITE_PATH`.
  - `ConfigError.message` reads `SchemaError(Expected string\n  at ["API_PORT"])`, so the
    variable name is in it. A run with no env file (`env -i … bun --no-env-file`) printed
    `ConfigError(SchemaError(Expected string at ["API_PORT"]))`. Bun auto-loads the cwd's `.env`,
    so a probe without `--no-env-file` silently picks up the root file.
  - Not done here: `QueueConfig` does not check that the refresh is shorter than the expiration
    (R29a); the defaults meet it, and S12 adds the check where the options are built.
  - **Config areas are bundled by their readers (D7, D16).** `MinimumLogLevelFromConfig` provides
    `RuntimeConfig.layer`, so a root no longer lists config areas it does not read itself; S12's
    `QueueClientSqlite` bundles `QueueConfig.layer`. Tests provide the `ConfigProvider` outside
    the bundle.
  - The suite reads no `.env` (with the file moved aside it still passes). Each case was seen
    red: first on the missing `layer` statics, then by mutation (`Config.String` in place of
    `Config.LogLevel`, a wrong `NODE_ENV` default).

#### S10 — Retire the plain code above `domain`

- **Goal:** remove what the bottom-up rewrite would break, so later steps write only final code
  (D15).
- **Blocked by:** S5.
- **Files:**
  - remove `application/example/create.use-case{,.test}.ts`;
  - remove `infrastructure/example/example.{queue,llm,storage}.ts`, and update the barrel;
  - remove `apps/worker/src/handlers/`; `layer.ts` and `main.ts` shrink to a process that starts
    and idles;
  - remove the example routes from `apps/api/src/{http,layer}.ts` and their cases from
    `http.test.ts`, keeping `/health`;
  - edit the `index.ts` barrels.
- **Test first:** config only (removal only; the remaining `/health` test stays green).
- **Verify:**
  - `make check`;
  - `git grep -nE "createExample(UseCase|Handler|Queue|Llm|Storage)|exampleJobType"` finds nothing.
- **Status:** done
- **Findings:**
  - **Both `layer.ts` are removed, not shrunk.** With the example routes and the handler gone,
    neither app wires anything: the api serves only `/health`, and the worker holds a timer at the
    maximum delay so that it starts and idles. An empty `createLayer()` would be dead code that
    S17 and S18 replace; they create `layer.ts` as the Effect composition root. `http.ts` exports
    a `routes` value instead of `createRoutes(layer)`.
  - **The error mapping goes with the routes.** `statusByTag`, `respondWithDomainError` and the
    `StatusByTag` exhaustiveness test served only the example routes, and `http.ts` imported
    `DomainError` from `domain/shared`, which S11 removes. S17 brings the mapping back on the
    contract.
  - **The grep is scoped outside `docs/tickets/`.** Run over the whole tree it always matches this
    plan (its own Verify line and S21's) and the monorepo-setup ticket's history; outside
    `docs/tickets/` and `repos/` it finds nothing.
  - **Docs made false by the removal:** the rule examples `ExampleJob`, `buildObjectKey` and
    `exampleJobType` (`naming.md`, now `outboxTable`), `ExampleQueue` and `ExampleJob` in
    `infrastructure/CLAUDE.md`, and four rows of the slice map in
    `docs/knowledge/architecture.md`. The doc's *Add a new entity* steps 6–8 and *The Effect seam*
    keep their text under a transition note until S22 rewrites them.
  - Kept on purpose: the plain `ExampleService` and `createExampleRepository` (S11 rewrites them),
    and the apps' `@oblik/{application,domain,infrastructure}` declarations, which S17 and S18 use
    again; `infrastructure` keeps `@oblik/llm` and `@oblik/storage` for the same reason.
  - On review: the `routes` TSDoc went (it restated the body), the `naming.md` constant example
    was dropped rather than replaced, the knowledge doc's `HTTP routes` row went, and D15 says
    the example routes, not only `POST /examples`, are absent. `commits.md` gains `:fire: chore`
    for removing code, which this commit uses. Left for S17, S18 and S21: the `layer.ts`
    mentions in `naming.md`, `apps/CLAUDE.md` and the knowledge doc, the error-mapping line in
    `apps/CLAUDE.md`, and the app and infrastructure dependencies that are unused until then.

#### S11 — `domain` on Schema, the memory repository, `ExampleService`

- **Goal:**
  - `ExampleId`, `Example`, the `Schema.TaggedError` errors, the `ExampleRepository` port with no
    layer, and an Effectful `buildExample` (R18, D6);
  - `domain` reads no ambient time or randomness (R19) and declares only `effect` (R17);
  - `ExampleRepositoryMemory` (R20);
  - `ExampleService` with `get`; `create` arrives in S14 (D17).
- **Blocked by:** S10.
- **Files:**
  - `domain/example/example.{model,error,service}.ts` and `example.service.test.ts`; remove
    `domain/shared/`;
  - `domain/package.json`;
  - `infrastructure/example/example.repository.ts`;
  - `application/example/example.service{,.test}.ts`;
  - the `package.json` files of `infrastructure` and `application`.
- **Test first:**
  - seam **`buildExample`**: the name is trimmed, a blank name gives `ExampleNameInvalidError`,
    and the id and time pass through;
  - seam **`ExampleService.layer`** over `ExampleRepositoryMemory`: an example upserted through the
    repository is returned by `get`; an unknown id gives `ExampleNotFoundError`.
- **Verify:**
  - `make check`;
  - `git grep -E "Date.now|new Date\(|randomUUID" domain/` finds nothing.
- **Status:** todo

#### S12 — Stub clients as layers, and the SQLite queue client

- **Goal:**
  - `LanguageModelStub` (R20);
  - `DbClient` and `StorageClient` with `*Memory` layers;
  - `buildExampleObjectKey`, and `OutboxMessage` as a `Schema.Struct`;
  - `QueueClientSqlite`, where `QueueConfig` turns into client options and a refresh interval not
    shorter than the expiration fails the layer; it bundles `QueueConfig.layer` (R23, R29a, D7).
- **Blocked by:** S8, S9, S11.
- **Files:**
  - `packages/{llm,db,storage}/client.ts` and their `package.json` files;
  - `infrastructure/example/{example.storage,index}.ts`;
  - `infrastructure/shared/{outbox.repository,queue.client,index}.ts`;
  - `infrastructure/package.json`.
- **Test first:** config only. `QueueClientSqlite` and `LanguageModelStub` have no seam: the
  `ExampleSummaryJob` seam runs on memory and a recording model (D10), so S18 checks them by hand.
- **Verify:** `make check`.
- **Status:** todo

#### S13 — `ExampleSummaryJob`: enqueue, worker, handle

- **Goal:**
  - `SummarizeExample` and the definition value `exampleSummaryQueue` carry the name, schema and
    retry policy (R24, D17);
  - `examplePrompt` and the function `summarizeExample` (D14, D17);
  - `example-summary.job.ts` holds `ExampleSummaryJob.enqueue`, `ExampleSummaryJob.layer`,
    `ExampleSummaryJob.worker` and the module's `handle` (R25, D2);
  - the job calls `LanguageModel` and logs the result (R27);
  - retries, dead-lettering and interrupts follow `consume` (R28, R29, D10).
- **Blocked by:** S11, S12.
- **Files:**
  - `infrastructure/example/{example.queue,example.prompt,example.llm,index}.ts`;
  - `application/example/example-summary.job{,.test}.ts` and the barrel;
  - the `package.json` files where needed.
- **Test first:** seam **`ExampleSummaryJob.layer` + `ExampleSummaryJob.worker`** over
  `QueueClientMemory` and `TestClock`:
  - an enqueued job reaches a recording `LanguageModel`, with the prompt;
  - a failing model is retried on the schedule;
  - after `maxAttempts` the job is dead-lettered and logged;
  - an interrupt releases the job without counting the attempt.
- **Verify:** `make check`.
- **Status:** todo

#### S14 — `ExampleService.create`

- **Goal:** `ExampleService.create` builds, saves and enqueues once, and `ExampleService.layer`
  bundles `ExampleSummaryJob.layer`, leaving open only `ExampleRepository`, `QueueClient` and
  `Crypto` (D16):
  - time comes from `Clock`, and the UUIDv7 from `Crypto` (R19);
  - the job id is `example-summary:<id>`, and a repeated send is deduplicated (R26);
  - no requirement leaks from `create`.
- **Blocked by:** S13.
- **Files:** `application/example/example.service{,.test}.ts`.
- **Test first:** seam **`ExampleService.layer`** over `ExampleRepositoryMemory`,
  `QueueClientMemory`, `TestClock` and a fresh `TestCrypto.layer(seed)` per test:
  - deterministic id and `createdAt`;
  - one job, with id `example-summary:<id>`, and a second `enqueue` of the same example is
    deduplicated;
  - a blank name saves and enqueues nothing.
- **Verify:** `make check`.
- **Status:** todo

#### S15 — `@oblik/api-contract` and `openapi.json`

- **Goal:**
  - the `HttpApi` holds its own DTOs, and errors as arrays carrying their statuses, importing
    only `effect` (R30, D3);
  - `RequestValidation` is applied last, with all-errors parsing (D5);
  - `openapi.json` is generated and committed, and checked for drift (R32).
- **Blocked by:** S5.
- **Files:**
  - `packages/api-contract/{api,example,health,validation,index,openapi}.ts`, `openapi.json` and
    `openapi.test.ts`;
  - `package.json` and `tsconfig.json`, by the new-workspace checklist;
  - the root `tsconfig.json` references;
  - `Makefile` (`openapi`).
- **Test first:** seam **`openapi.test.ts`**. It is red before `make openapi` writes the file;
  the committed spec documents the 400 and the 500.
- **Verify:**
  - `make check`;
  - an endpoint edited without regenerating fails `make check`;
  - **V4** starts here: how the 500 enters every error union.
- **Status:** todo

#### S16 — `@oblik/api-client` as a `Promise<Result>` facade

- **Goal:** `createApiClient(baseUrl, { fetch })` is derived from the contract by one mapped
  type, and its calls never reject (R33, D4). `apps/web` uses it without importing `effect`.
- **Blocked by:** S15.
- **Files:**
  - `packages/api-client/{client,result,index}.ts`, `client.test.ts` and a type test;
  - `packages/api-client/package.json`;
  - `apps/web/src/{shared/api.ts,features/example/health-panel.ts}`.
- **Test first:** seam **`createApiClient` over a fake `fetch`**:
  - a refused connection gives the transport error;
  - a wrong body or status gives `SchemaError` or `DecodeError`;
  - no call rejects;
  - a `switch` over `error._tag` that misses a case fails the typecheck.
- **Verify:**
  - `make check`;
  - **V4** settled: an empty 500 decodes to `InternalServerError`.
- **Status:** todo

#### S17 — `apps/api` on `HttpApiBuilder`

- **Goal:**
  - the contract is implemented, with domain errors mapped to contract errors and `QueueError`
    turned into a 500 (R31, D5);
  - `ApiHttp` is served by `BunHttpServer` under `BunRuntime.runMain`;
  - logs go through `Effect.log` at `LOG_LEVEL`, and finalizers run on signals (R35);
  - dev and debug run with `--watch` (R36, D12);
  - `POST /examples` enqueues the job (R26);
  - `ExampleHandlers` bundles `ExampleService.layer`; the root provides only the leaves (D16).
- **Blocked by:** S9, S14, S16.
- **Files:**
  - `apps/api/src/{http,validation,layer,main}.ts` and `http.test.ts`;
  - `apps/api/package.json` (dependencies, `--watch`);
  - `Makefile` (the help text of `dev-api` and `debug-api`).
- **Test first:** seam **`HttpRouter.toWebHandler(ApiHttp)`**, driven by
  `createApiClient(url, { fetch })` and raw `Request`s:
  - 201, 404, 422 and a 400 listing every issue, each with a typed `Result`;
  - a defect gives a 500, and so does a response that fails to encode (R31);
  - `POST /examples` enqueues on the memory queue.
- **Verify:**
  - `make check`;
  - `make dev-api` and `curl` give a JSON 201;
  - SIGTERM logs the finalizers.
- **Status:** todo

#### S18 — `apps/worker` launches `ExampleSummaryJob.worker`

- **Goal:**
  - the worker only launches `ExampleSummaryJob.worker` (R25);
  - jobs cross processes through the SQLite file (R27);
  - signals release in-flight jobs (R29, R35);
  - `--watch` restarts leave one consumer (R36).
- **Blocked by:** S9, S12, S13, S17 (the process check posts through the api).
- **Files:** `apps/worker/src/{layer,main}.ts` and `apps/worker/package.json`.
- **Test first:** config only. The behaviour sits at the `ExampleSummaryJob` seam (S13); the
  process is checked by hand.
- **Verify:**
  - `make check`;
  - with the worker stopped, three `POST /examples`; then `make dev-worker` logs three results;
  - SIGTERM during a job leaves it at the same attempt for the next worker;
  - editing a file restarts it with one consumer.
- **Status:** todo

#### S19 — Web server entry on the full runtime

- **Goal:** `apps/web/src/main.ts` stays `Bun.serve` with HMR and reads `WebConfig` from its
  layer on the Effect runtime the other apps use (R34), replacing S9's transitional `runSync`.
- **Blocked by:** S16, S17, S18.
- **Files:**
  - `apps/web/src/main.ts`;
  - `apps/web/package.json`.
- **Test first:** config only. The config layers are covered at their S9 seam.
- **Verify:**
  - `make dev-web` keeps HMR;
  - `make check` is green. This is the **`modules` layer gate**.
- **Status:** todo

### Layer 3 — `claude`

#### S20 — `effect.md`, the rule and the knowledge doc

- **Goal:**
  - `.claude/rules/effect.md` (`paths: **/*.ts`, ≤ ~80 lines) covers (R5, R37, R37a, R37b):
    - v3 memory is wrong; read `repos/effect`, `LLMS.md` first;
    - the order in which a capability is sourced, and the layer limits;
    - core data primitives;
    - the project's choices;
  - `docs/knowledge/effect.md` covers the R38 topics: services and layers, errors, config, the
    contract and client, jobs and SQS, testing, the gate, the vendored source, and why the
    capability order of R37a is what it is;
  - the client bundle size is measured and recorded;
  - every line elsewhere that restates either document is trimmed.
- **Blocked by:** S19.
- **Files:** `.claude/rules/effect.md`, `docs/knowledge/effect.md`, and the trimmed lines.
- **Test first:** config only.
- **Verify:**
  - the rule is ≤ ~80 lines;
  - each R38 topic has a section, and `effect.md` explains the R37a order;
  - no Cyrillic (R40);
  - `make check`.
- **Status:** todo

#### S21 — Conventions: naming, tooling and the layer `CLAUDE.md` files

- **Goal:** `naming.md` states every R39 bullet; `tooling.md` and the five layer `CLAUDE.md`
  files carry the Effect conventions; none restates `effect.md` (R39).
- **Blocked by:** S20.
- **Files:**
  - `.claude/rules/{naming,tooling}.md`;
  - `{domain,infrastructure,application,packages,apps}/CLAUDE.md`.
- **Test first:** config only.
- **Verify:**
  - each `CLAUDE.md` is ≤ ~40 lines and each rule ≤ ~80;
  - `git grep -nE "DomainError|loadConfig|createLayer|createExampleService|ExampleJob\b|exampleJobType|Id<'|\.handler|use-case"` in `.claude/` and the
    `CLAUDE.md` files finds nothing;
  - `make check`.
- **Status:** todo

#### S22 — Knowledge docs and README

- **Goal:**
  - `docs/knowledge/tooling.md` covers the commands, gates, LazyVim (the `tsc` LSP) and
    troubleshooting, including a lost patch;
  - `docs/knowledge/architecture.md` replaces "The Effect seam" with how layers compose, and
    updates "Where things live" and "Add a new entity";
  - `README.md` links `effect.md` (R38, R40).
- **Blocked by:** S20.
- **Files:** `docs/knowledge/{tooling,architecture}.md`, `README.md`, and the link to
  `#the-effect-seam` in this ticket's `feature.md › Context`, pointed at the new section.
- **Test first:** config only.
- **Verify:**
  - lychee (CI `docs`) passes offline;
  - `make check` is green. This is the **`claude` layer gate**.
- **Status:** todo

### Wrap-up

#### S23 — Verify, PR, merge

- **Goal:**
  - `/ticket-verify` gives a verdict per requirement, including the manual checks of
    `architecture.md › Seams`;
  - one squash-merged PR, and the branch is kept (R1);
  - the PR body carries `git-subtree-dir:` and `git-subtree-split:` outside its HTML comment (R10).
- **Blocked by:** S21, S22.
- **Files:** `verification.md` (written by `/ticket-verify`); the PR body.
- **Test first:** config only.
- **Verify:** pushing, opening the PR and merging each need the user's OK. `git log main -1`
  carries the subtree trailers.
- **Status:** todo

## Requirement coverage

| Req | Steps | Req | Steps |
|---|---|---|---|
| R1 | S1, S4, S23 | R21 | S9 |
| R2 | gates S7, S19, S22 | R22 | S9 |
| R3 | every step; S4 | R23 | S8, S12 |
| R4 | S2 | R24 | S13 |
| R5 | S7 (TS2307 probe), S20 | R25 | S13, S14, S17, S18 |
| R6 | S2 | R26 | S14, S17 |
| R7 | S2 | R27 | S13, S18 |
| R8 | S6, S8 (probe) | R28 | S8, S13 |
| R9 | S6 | R29 | S8, S13, S18 |
| R10 | S3, S4, S23 | R29a | S9, S12 |
| R11 | S3, S5, S6, S7 | R30 | S15 |
| R12 | S5 | R31 | S17 |
| R13 | S5 | R32 | S15 |
| R14 | S5, S8, S9, S11, S13–S17 | R33 | S7, S16 |
| R15 | S9 | R34 | S9, S19 |
| R16 | S5, S6, S8 | R35 | S17, S18 |
| R17 | S7, S11 | R36 | S17, S18 |
| R18 | S11 | R37, R37a, R37b | S20 |
| R19 | S11, S14 | R38 | S20, S22 |
| R20 | S11, S12 | R39 | S21 |
| | | R40 | S20–S22 |
