# Tooling

How to run, check and extend the monorepo, and why it is set up this way. The short imperatives for
agents live in [.claude/rules/tooling.md](../../.claude/rules/tooling.md); this document explains
them. Versions: Bun 1.4.3, TypeScript 7.0.2, Biome 2.5.15, husky 9.1.7.

## Commands

Everything runs through the root `Makefile` (GNU Make 3.81, the macOS default). There is no
`Makefile` in any workspace.

| Target | Runs | Use |
|---|---|---|
| `make setup` | `bun install`, then copies `.env.example` to `.env` if missing | first clone; installs the git hooks too |
| `make dev` | `bun --filter './apps/*' dev` | all three processes, interleaved output |
| `make dev-api` · `dev-worker` · `dev-web` | one app's `dev` script | one process |
| `make debug-api` · `debug-worker` · `debug-web` | one app's `debug` script | the same mode plus `--inspect` |
| `make check` | `ids`, `lint`, `typecheck`, `test` | the gate before every commit and step report |
| `make ids` | `git grep` for ticket ids in parentheses outside `docs/tickets/` | a new project deletes the ticket, so an id elsewhere points nowhere |
| `make lint` | `biome check` | lint, format and import order, without writing |
| `make fmt` | `biome check --write` | apply formatting, import sorting and safe fixes |
| `make typecheck` | `bun check` | typecheck every workspace through the project references |
| `make test` | `bun test` | every colocated `*.test.ts` |
| `make outdated` | `bun outdated --recursive` | newer versions for every workspace |
| `make clean` | removes every `node_modules` and `coverage` | a clean reinstall: follow with `make setup` |

`bun check` is Bun's built-in native typechecker, not a `package.json` script. `bun test` runs Bun's
test runner, while `bun run test` would run the root `test` script.

## Run and debug

- **Ports.** `API_PORT` (3000) and `WEB_PORT` (3001) come from `.env`. The web server proxies
  `/api/*` to `localhost:${API_PORT}`, so the browser stays same-origin and the api needs no CORS.
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

That is why the worker uses `--watch`: its `main.ts` starts a polling `setInterval`, and under
`--hot` every edit would add another poller. `Bun.serve` handles `--hot` natively by
swapping its routes, so `api` and `web` keep the faster reload.

Bun has no `--dev` flag. "Development" means two things here: the reload flag in the app's `dev`
script, and `NODE_ENV="development"`, which turns on HMR and browser console forwarding in the web
server's `Bun.serve({ development })`.

## Environment

- **One root `.env`**, gitignored. `.env.example` is its template and lists only what the code
  reads. Variables of clients that are still stubs stay commented out.
- **Quoting.** Strings are double-quoted (`LOG_LEVEL="info"`), numbers are bare (`API_PORT=3000`).
- **Loading.** Each app script passes `--env-file=../../.env`, a path relative to the app folder.
  This works from `make` at the root and from `bun run dev` inside the app.
- **A missing `.env`** is ignored by Bun without a warning. The process then fails at startup in
  `loadConfig`, with one `ConfigError` that lists every missing variable. Variables exported in the
  shell work without a file, which is how CI runs.
- **Reading settings.** Only `@oblik/config` reads the environment, through
  `loadConfig(env = Bun.env)`. Tests pass an explicit object, so they never need `.env`.

## Dependencies

### Catalogs

Every external version lives once, pinned exactly, in a named catalog in the root `package.json`.
Workspaces reference it as `catalog:<namespace>`; the unnamed `catalog:` is not used.

| Namespace | Holds | Today |
|---|---|---|
| `tools` | developer-workflow tools that never shape types or runtime behaviour | `@biomejs/biome`, `husky` |
| `runtime` | everything else, including the language and runtime the code targets | `typescript`, `@types/bun` |
| one per family | packages released in lock-step | none yet; `effect` + `@effect/*` will get one |

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

A dependency on another workspace is declared as `"@oblik/<name>": "workspace:*"`. Also add that
workspace to the consumer's `tsconfig.json` `references`. `bun check` does not catch a missing
reference, but `tsc -b` needs it to build in order.

### Add a workspace

1. Create the folder with `package.json` (`"name": "@oblik/<name>"`, `"private": true`,
   `"type": "module"`, an `exports` entry, and `"imports": { "#<name>/*": "./*.ts" }`).
2. Add `tsconfig.json`: extend `tsconfig.base.json`, set `rootDir: "."` and
   `outDir: "<relative>/node_modules/.cache/tsc/<name>"`, set `include`, and reference the
   workspaces it imports. Copy an existing one, such as `packages/config/tsconfig.json`.
3. Add the path to the root `package.json` `workspaces` if no glob covers it. Bun rejects an
   explicit path that does not exist yet, so create the folder first.
4. Add the path to the root `tsconfig.json` `references`.
5. Run `bun install` and `make check`.

A new `packages/*` workspace needs no Biome change, because the layer guards are deny-lists. A new
layer or app needs its own `overrides` entry in `biome.json`.

### Upgrade versions

1. `make outdated` lists what is behind.
2. Edit the version in the root `catalogs`. It is the only place a version lives.
3. Run `bun install`, then `make check`, and commit `package.json` with `bun.lock`.

Upgrading Bun means bumping `packageManager` and `@types/bun` together, so CI's pinned job uses the
new version. CI also runs a non-blocking job on Bun `latest`, which shows the next upgrade early.

## TypeScript

- **Project references.** The root `tsconfig.json` has no files of its own and references all 14
  workspaces. Each workspace is a `composite` project that references what it imports.
- **`bun check` is the gate.** It walks the references, typechecks every workspace and emits
  nothing. `typescript` stays installed for editors and for `bunx tsc -b`.
- **`tsc -b` writes only into `node_modules/.cache/tsc/<workspace>`.** `composite` cannot be
  combined with `noEmit` (TS6310), so the base config emits declarations only, into that
  gitignored cache. Nothing emitted is ever committed.
- **The isolated linker** (`linker = "isolated"`) links each workspace only to the packages it
  declares. An undeclared import fails at runtime and in `bun check` with TS2307. References alone
  do not stop it.

## Git hooks and CI

`bun install` runs the `prepare` script (`husky`), which installs the hooks:

| Hook | Runs | Why there |
|---|---|---|
| `pre-commit` | `bun check`, then `bunx biome check --staged --no-errors-on-unmatched` | fast checks; only staged files are linted, and nothing is rewritten |
| `pre-push` | `bun test` | tests are slower, so they run once per push |

Never skip a hook with `--no-verify`. CI runs the same checks, so a skipped hook fails there.

CI (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main`:

| Job | Runs |
|---|---|
| `static` | `bun install --frozen-lockfile`, `biome ci`, `bun check` |
| `test` | `bun install --frozen-lockfile`, `bun test` |
| `links` | `make ids`, then `lychee --offline` on `README.md`, `docs/**/*.md` and `.claude/**/*.md` |

`static` and `test` run on two Bun versions: `pinned` (from `packageManager`) blocks the merge, and
`latest` only reports. The link check keeps relative links between documents from rotting.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module '@oblik/<name>'` from `bun check`, or `Cannot find module` at runtime | the import is allowed, but the workspace is not declared in this workspace's `package.json` | add `"@oblik/<name>": "workspace:*"` and a `tsconfig.json` reference, then `bun install` |
| `TS6059 … is not under 'rootDir'` and `TS6307 … is not listed within the file list of project` | a relative path reaches into another workspace that is not referenced | import it as `@oblik/<name>/…`; relative paths are banned anyway |
| Biome `lint/style/noRestrictedImports`: `domain is the pure core…` or `… no upward imports` | the import goes up a layer or into a sibling app | move the shared code down a layer, or receive it as an argument; see [architecture.md](architecture.md#dependency-rules) |
| Biome `noRestrictedImports`: `… never a relative path` | a `./` or `../` import inside a workspace | use `#<workspace>/<path>`, for example `#domain/shared/id` |
| Biome `assist/source/organizeImports`: `Sort these imports.` | import groups out of order or without blank lines between them | `make fmt` |
| a commit is rejected after `bun check` or Biome output | the `pre-commit` hook failed | fix the reported error, `git add`, and commit again |
| a push is rejected after test output | the `pre-push` hook failed | fix the tests; never use `--no-verify` |
| CI `Install`: `lockfile had changes, but lockfile is frozen` | `package.json` or a catalog changed without `bun install` | run `bun install` locally and commit `bun.lock` |
| an app exits at startup with `ConfigError: Invalid environment` | `.env` is missing or a variable is invalid; Bun ignores a missing `--env-file` without a warning | `make setup`, or fix the listed variables in `.env` |
| `bun install` fails with a workspace path error | an explicit `workspaces` entry points to a folder that does not exist yet | create the folder first, then add the path |
