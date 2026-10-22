# Tooling

How to run, check and extend the monorepo, and why it is set up this way. The short imperatives for
agents live in [.claude/rules/tooling.md](../../.claude/rules/tooling.md); this document explains
them. Versions: Bun 1.4.3, TypeScript 7.0.2, Biome 2.5.15, husky 9.1.7, vitest 5.0.5.

## Commands

Everything runs through the root `Makefile` (GNU Make 3.81, the macOS default). There is no
`Makefile` in any workspace. Beyond Bun, two tools are prerequisites: Docker, for `make test` and
`make up`, and the Pulumi CLI, for `make up`, `down` and `reset`; `make check` needs only Docker,
and `make setup` needs neither.

| Target | Runs | Use |
|---|---|---|
| `make setup` | `bun install`, then copies `.env.example` to `.env` if missing | first clone; installs the git hooks too; needs no Pulumi CLI |
| `make stack` | `pulumi login` to the file backend under `.data/pulumi`, `stack select local` or `init` | idempotent; `up` and `down` run it first |
| `make up` · `down` · `reset` | `pulumi up` / `destroy` on `deployment/local/`, then `deployment/local/provision.ts` | MiniStack for S3 and SQS: [aws.md › The local stand-in](aws.md#the-local-stand-in) |
| `make dev` | `bun --filter './apps/*' dev` | all three processes, interleaved output |
| `make dev-api` · `dev-worker` · `dev-web` | one app's `dev` script | one process |
| `make debug-api` · `debug-worker` · `debug-web` | one app's `debug` script | the same mode plus `--inspect` |
| `make check` | `ids`, `lint`, `typecheck`, `test` | the gate before every commit and step report |
| `make ids` | `git grep` for ticket ids in parentheses outside `docs/tickets/` and `repos/` | a new project deletes the ticket, so an id elsewhere points nowhere |
| `make lint` | `biome check` | lint, format and import order, without writing |
| `make fmt` | `biome check --write` | apply formatting, import sorting and safe fixes |
| `make typecheck` | `bunx tsc -b`, the patched `tsc` | typecheck every workspace through the project references, Effect diagnostics included |
| `make test` | `bun run test`, which is `bun --bun vitest run` | every colocated `*.test.ts`; the AWS suites need a running Docker daemon ([aws.md › Tests on Docker](aws.md#tests-on-docker)) |
| `make outdated` | `bun outdated --recursive` | newer versions for every workspace |
| `make vendor-effect` | `git subtree pull --squash --prefix repos/effect` of the `effect@<pin>` tag | update `repos/effect` to the catalog pin; it commits, so run it on a clean tree. First time: `git subtree add` with the same arguments |
| `make clean` | removes every `node_modules` and `coverage` | a clean reinstall: follow with `make setup` |

`bun run test` runs the root `test` script, while `bun test` would start Bun's own test runner,
which is denied in `.claude/settings.json`.

Scripts live only where `make` calls them: the root `package.json` holds `prepare`, `lint`,
`format` and `test`; each app holds `dev`, `debug` and `start`; library workspaces hold none.

### Tests

Tests run on vitest 5, on the Bun runtime (`bun --bun`), so `Bun.serve` and the other Bun APIs work
inside them. Bun's own runner is not used, because `@effect/vitest` (`it.effect`, `it.layer`,
`TestClock`) needs vitest.

- **One root `vitest.config.ts`**, which only adds `repos/**` to the default exclude: every
  colocated `*.test.ts` runs, a new workspace needs no test config, and Effect's own suites stay
  out.
- **Output.** vitest switches to its `minimal` reporter when it detects an agent (`CLAUDECODE`,
  `AI_AGENT`): failures and a summary only. A terminal without them gets the per-file `default`
  reporter; `bun run test --reporter=default` forces it.
- **Errors are compared by their encoded form.** JSC gives every `Error` its own `line`, `column`
  and `sourceURL` keys (`originalLine` and `originalColumn` too, outside vitest), which hold the
  real position only once the JIT compiles the code that builds the error. `Equal.equals` drops
  only `stack` from an `Error`, so two errors with equal fields differ at random, more often as the
  suite grows. Tests therefore compare errors with `assertSchemaEquals` from
  `@app-template/testing`, which encodes both through the error's schema and sees only its fields.

## Run and debug

- **Ports.** `API_PORT` (3000) and `WEB_PORT` (3001) come from `.env`, others in a
  [worktree](#worktrees). The web server proxies `/api/*` to `localhost:${API_PORT}`, so the
  browser stays same-origin and the api needs no CORS.
- **A single app.** `make dev-api`, or `cd apps/api && bun run dev`. Both read the same root `.env`.
- **Debugging.** `make debug-api` prints an inspector block:

  ```text
  Inspect in browser:
    https://debug.bun.sh/#localhost:6499/<session>
  ```

  Open the link to get breakpoints, the console and profiling. Editors attach to the
  `ws://localhost:6499/<session>` address printed under it. Debug mode keeps the app's reload mode,
  so `debug-api` still hot-reloads.

### `--hot` vs `--watch`, and why there is no `--dev`

| | `--hot` (`api`, `web`) | `--watch` (`worker`) |
|---|---|---|
| On change | re-evaluates modules inside the running process | re-executes the process into a fresh runtime |
| PID | the same | may stay the same: Bun restarts by `exec` |
| `globalThis` | survives | reset |
| Module state (the in-memory repository) | rebuilt, so data is lost | rebuilt |
| Timers and open connections | survive the reload | gone |

Checked by experiment: a module that bumps a counter on `globalThis` and starts a `setInterval`
logging it. After one edit under `--hot`, the counter read 2 and **both** intervals kept ticking,
the old code next to the new one, with the PID unchanged. Under `--watch` the counter read 1 and
only the new interval ran.

That is why the worker uses `--watch`: its queue consumers are fibers of an Effect runtime, and
under `--hot` every edit would start a second runtime, and a second consumer of each queue, beside
the old one. A re-exec leaves nothing to stop, so `apps/worker/src/main.ts` is one `runMain` and the
scope's finalizers (SIGTERM releases the job in hand and logs `worker stopped`) are the whole
shutdown; an edit runs the same finalizers before the re-exec, so the old runtime logs `worker
stopped` and releases its job, and the new one takes it at the same attempt. `Bun.serve` handles
`--hot` natively by swapping its routes, so `api` and `web` keep the faster reload. An Effect
runtime does not: each edit re-evaluates `effect` itself and starts a new `runMain` beside the old
one, whose scope, fibers and finalizers live on. So `apps/api/src/main.ts` keeps a stop handle on
`globalThis` (the one thing a reload keeps): each evaluation first stops the previous runtime and
waits for its finalizers, then launches its own. Checked with a probe layer that ticked every
second: without the handle, two edits left three tickers and SIGTERM ran three finalizers; with it,
one ticker at a time, each finalized before the next `Listening on`.

Bun has no `--dev` flag. "Development" means two things here: the reload flag in the app's `dev`
script, and `NODE_ENV="development"`, which turns on HMR and browser console forwarding in the web
server's `Bun.serve({ development })`.

### Worktrees

A worktree is a full copy of the environment, so trees run `make up` and `make dev` side by side.
Each gets a number `N`, the main tree 0, and owns its `node_modules` (`bun install`), `.data/`,
`.pulumi/` and MiniStack container; its `.env` is the main tree's with three ports moved:

| Variable | Port | Main tree | `N=1` |
|---|---|---|---|
| `API_PORT` | `3000 + 10N` | 3000 | 3010 |
| `WEB_PORT` | `3001 + 10N` | 3001 | 3011 |
| `AWS_ENDPOINT_URL` | `4566 + 10N` | 4566 | 4576 |

The commands that write it:
[`ticket-implement` › Parallel steps](../../.claude/skills/ticket-implement/SKILL.md#parallel-steps).
Run `make down` in a worktree before it is removed, or its container outlives it and keeps the
port.

## Environment

- **One root `.env`**, gitignored. `.env.example` is its template and lists what the code reads,
  plus the variables a client SDK reads from the environment itself: the AWS SDK's default
  provider chain takes `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` locally and the role on AWS,
  whose session token rotates, so credentials never pass through `@app-template/config`
  ([aws.md](aws.md#the-local-stand-in)). Variables of clients that are still stubs stay commented
  out.
- **Quoting.** Strings are double-quoted (`LOG_LEVEL="Info"`), numbers are bare (`API_PORT=3000`).
- **Loading.** Each app script passes `--env-file=../../.env`, a path relative to the app folder.
  This works from `make` at the root and from `bun run dev` inside the app. The one exception is
  `make up`: Pulumi starts `deployment/local/ministack.ts` itself, so no `--env-file` reaches it,
  and the recipe loads `.env` into the shell's environment instead. The shell reads the file as
  its own syntax, so a value with a space must be quoted.
- **A missing `.env`** is ignored by Bun without a warning. The process then fails at startup while
  building a config layer, with Effect's `ConfigError` naming the first missing or invalid
  variable. Variables exported in the shell work without a file, which is how CI runs.
- **Reading settings.** Only `@app-template/config` reads the environment: each area is a
  `Context.Service` (`ApiConfig`, `QueueConfig`, …) with a `layer` on `effect/Config`. Tests
  provide a `ConfigProvider.fromUnknown` record, so they never need `.env`.

## Dependencies

### Catalogs

Every external version lives once, pinned exactly, in a named catalog in the root `package.json`.
Workspaces reference it as `catalog:<namespace>`; the unnamed `catalog:` is not used.

| Namespace | Holds | Today |
|---|---|---|
| `tools` | developer-workflow tools that never shape types or runtime behaviour | `@biomejs/biome`, `husky`, `vitest` |
| `runtime` | everything else, including the runtime the code targets | `@types/bun`, `testcontainers` |
| one per family | a release train, or a core and the plugins that pin it as a range | `typescript`: `typescript`, `@effect/tsgo` (it embeds one TypeScript version) · `effect`: `effect`, `@effect/*` · `effect-aws`: `@effect-aws/*` (one release train over the AWS SDK; it pins the SDK as a range, so the lockfile holds the SDK version) · `pulumi`: `@pulumi/pulumi` and the providers that pin it as a range (`@pulumi/docker`) |

`bunfig.toml` sets `exact = true`, so `bun add` writes `1.2.3`, never `^1.2.3`.

### Add a dependency

Run `bun add` inside the consuming workspace:

```sh
cd packages/config
bun add --catalog=runtime zod@3.25.76      # add -d for a devDependency
```

Bun writes `"zod": "3.25.76"` into the root `catalogs.runtime` and `"zod": "catalog:runtime"` into
`packages/config/package.json`. A second workspace that needs the same package declares
`"zod": "catalog:runtime"` by hand and runs `bun install`.

A dependency on another workspace is declared as `"@app-template/<name>": "workspace:*"`. Also add
that workspace to the consumer's `tsconfig.json` `references`, so `tsc -b` builds it first. No gate
catches a missing reference: TS 7 resolves the workspace through its package symlink and checks
its sources either way.

### Add a workspace

1. Create the folder with `package.json` (`"name": "@app-template/<name>"`, `"private": true`,
   `"type": "module"`, an `exports` entry, and `"imports": { "#<name>/*": "./*.ts" }`).
2. Add `tsconfig.json`: extend `tsconfig.base.json`, set `rootDir: "."` and
   `outDir: "<relative>/node_modules/.cache/tsc/<name>"`, set `include`, and reference the
   workspaces it imports. Copy an existing one, such as `packages/config/tsconfig.json`.
3. Add the path to the root `package.json` `workspaces` if no glob covers it. Bun rejects an
   explicit path that does not exist yet, so create the folder first.
4. Add the path to the root `tsconfig.json` `references`.
5. Run `bun install` and `make check`.

A new `packages/*` workspace needs no change to the layer guards, because they are deny-lists. A
new layer or app needs its own `overrides` entry in `biome.json`; see
[architecture.md › Three boundary guards](architecture.md#three-boundary-guards) for what each
entry repeats.

### Upgrade versions

1. `make outdated` lists what is behind.
2. Edit the version in the root `catalogs`. It is the only place a version lives.
3. Run `bun install`, then `make check`, and commit `package.json` with `bun.lock`.
4. After an `effect` catalog bump, run `make vendor-effect` on the now clean tree. `git subtree`
   refuses any uncommitted change, so the bump and the vendoring are two commits of the same PR.
   Copy the squash commit's `git-subtree-dir:` and `git-subtree-split:` trailers into the PR body,
   outside its HTML comment: the squash merge drops them, and the next pull needs them.

Another repository vendored under `repos/` gets one more target of the same shape.

Upgrading Bun means bumping `packageManager` and `@types/bun` together, so CI's pinned job uses the
new version. CI also runs a non-blocking job on Bun `latest`, which shows the next upgrade early.

## TypeScript

- **Project references.** The root `tsconfig.json` has no files of its own and references all 14
  workspaces. Each workspace is a `composite` project that references what it imports.
- **The patched `tsc -b` is the only typecheck gate.** It walks the references, reports every
  type error, and runs the Effect language service, whose errors and warnings both fail it
  (`ignoreEffectWarningsInTscExitCode` stays `false`). `make typecheck`, `pre-commit` and CI all
  run it. `repos/` is never walked: no reference points into it.
- **`unstableApiUsage` is a suggestion, and suggestions stay in the editor.** The project uses
  modules marked `@stability unstable` by choice (`effect/persistence`, the HTTP and AI modules,
  all of `@effect/vitest`), pinned exactly; at the rule's default `warning`, each import of one
  fails `tsc -b`. `includeSuggestionsInTsc: false` keeps suggestion-level hints out of the gate's
  output.
- **`bun check` is not a gate.** Bun's native typechecker is faster and emits nothing, but it
  ignores tsconfig `plugins`, so it passes an Effect value that is neither yielded nor assigned.
- **`tsc -b` writes only into `node_modules/.cache/tsc/<workspace>`.** `composite` cannot be
  combined with `noEmit` (TS6310), so the base config emits declarations only, into that
  gitignored cache. Nothing emitted is ever committed.
- **The isolated linker** (`linker = "isolated"`) links each workspace only to the packages it
  declares. An undeclared import fails at runtime and in `make typecheck` with TS2307. References
  alone do not stop it.

## Git hooks and CI

`bun install` runs the `prepare` script (`husky && effect-tsgo patch`), which installs the hooks and
patches the `tsc` binary with the Effect language service (`tsc --version` reports `+effect-tsgo`):

| Hook | Runs | Why there |
|---|---|---|
| `pre-commit` | `make typecheck`, then `bunx biome check --staged --no-errors-on-unmatched` | fast checks; only staged files are linted, and nothing is rewritten |
| `pre-push` | `make test` | tests are slower, so they run once per push |

Never skip a hook with `--no-verify`. CI runs the same checks, so a skipped hook fails there.

CI (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main`:

| Job | Runs |
|---|---|
| `static` | `bun install --frozen-lockfile`, `biome ci`, `tsc --version \| grep effect-tsgo`, `make typecheck` |
| `test` | `bun install --frozen-lockfile`, `bun run test` |
| `links` | `make ids`, then `lychee --offline` on `README.md`, `docs/**/*.md` and `.claude/**/*.md` |

`static` and `test` run on two Bun versions: `pinned` (from `packageManager`) blocks the merge, and
`latest` only reports. The link check keeps relative links between documents from rotting.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module '@app-template/<name>'` from `make typecheck`, or `Cannot find module` at runtime | the import is allowed, but the workspace is not declared in this workspace's `package.json` | add `"@app-template/<name>": "workspace:*"` and a `tsconfig.json` reference, then `bun install` |
| `TS6059 … is not under 'rootDir'` and `TS6307 … is not listed within the file list of project` | a relative path reaches into another workspace that is not referenced | import it as `@app-template/<name>/…`; relative paths are banned anyway |
| Biome `lint/style/noRestrictedImports`: `domain is the pure core…` or `… no upward imports` | the import goes up a layer or into a sibling app, or `domain` imports an `@effect/*` package other than `@effect/vitest` | move the shared code down a layer, or receive it as an argument; in `domain`, use an `effect` module; see [architecture.md](architecture.md#dependency-rules) |
| Biome `noRestrictedImports`: `… never a relative path` | a `./` or `../` import inside a workspace | use `#<workspace>/<path>`, for example `#domain/chat/chat.model` |
| Biome `lint/suspicious/noImportCycles`: `This import is part of a cycle` | two modules import each other, typically two aggregates' models through their ids | import the other aggregate's id from its `<aggregate>.id.ts`, never its model |
| Biome `assist/source/organizeImports`: `Sort these imports.` | import groups out of order or without blank lines between them | `make fmt` |
| a commit is rejected after `tsc` or Biome output | the `pre-commit` hook failed | fix the reported error, `git add`, and commit again |
| a push is rejected after test output | the `pre-push` hook failed | fix the tests; never use `--no-verify` |
| `<file>:<line> - error TS377001: … effect(floatingEffect)`, or another `effect(<rule>)` | the Effect language service flags a misuse; the name in parentheses is the rule | fix the code (here: yield or assign the Effect). A rule's severity is set in the plugin's `diagnosticSeverity` in `tsconfig.base.json` |
| CI `Assert the patched tsc` fails: `grep` finds no `effect-tsgo` | `tsc` is the stock build, because `bun install` ran without the `prepare` script; it reports no Effect diagnostics | run `bun install`, so `prepare` runs `effect-tsgo patch`; `bunx tsc --version` then reports `+effect-tsgo` |
| CI `Install`: `lockfile had changes, but lockfile is frozen` | `package.json` or a catalog changed without `bun install` | run `bun install` locally and commit `bun.lock` |
| an app exits at startup with `ConfigError: SchemaError(… at ["API_PORT"])` | `.env` is missing or that variable is invalid; Bun ignores a missing `--env-file` without a warning | `make setup`, or fix the named variable in `.env` and rerun until it starts |
| `… at ["LOG_LEVEL"]` on a `.env` that used to work | `LOG_LEVEL` is case-sensitive since the Effect config: `Info`, not `info` | set `LOG_LEVEL="Info"` (see `.env.example`) |
| `bun install` fails with a workspace path error | an explicit `workspaces` entry points to a folder that does not exist yet | create the folder first, then add the path |
