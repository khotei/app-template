# Tooling

Imperatives only. The explanations live in [docs/knowledge/tooling.md](../../docs/knowledge/tooling.md).

## Commands

- Run everything through `make <target>` (`make help` lists them). There is exactly one `Makefile`,
  at the root; never add one to a workspace.
- The root `package.json` holds only `prepare`, `lint`, `format` and `test`. Apps hold `dev`,
  `debug` and `start`. Library workspaces hold no scripts.
- `make check` = Biome + `bun check` + `bun test`, and it must pass before a step is reported.
- `bun check` is Bun's built-in typechecker, not a script. `bun test` ≠ `bun run test`.
- `tsc -b` writes only to `node_modules/.cache/tsc`; never commit emitted files.
- Bun is the only package manager; `npm`, `yarn` and `pnpm` are denied.
- Hooks: `pre-commit` runs `bun check` and Biome on staged files; `pre-push` runs `bun test`.
  Never bypass them with `--no-verify`.

## Dependencies

- Versions live only in the root `catalogs`, pinned exactly. Workspaces reference them with
  `catalog:<namespace>`, never the unnamed `catalog:`.
- `tools` holds developer-workflow tools (`husky`, `@biomejs/biome`). `runtime` holds everything
  else, `typescript` and `@types/bun` included. A family whose versions move together
  (`effect` + `@effect/*`) gets its own namespace.
- Add a dependency with `bun add [-d] --catalog=<namespace> <pkg>@<exact>`, then declare it in each
  consuming workspace. Biome allowing the import direction is not enough: an undeclared dependency
  fails `bun check` (TS2307).

## New workspace

Add its path to the root `workspaces` (an explicit path must already exist), add it to the root
`tsconfig.json` `references`, give its `package.json` an `imports` entry `#<name>/*`, and make its
`tsconfig.json` extend `tsconfig.base.json` with `outDir` under `node_modules/.cache/tsc/<name>`.

## Environment

- One root `.env` (gitignored). `.env.example` lists only the variables the code reads; values for
  stubbed services stay commented out.
- Double-quote string values; leave numbers bare (`API_PORT=3000`).
- App scripts load the root file with `--env-file=../../.env`. Read settings only through
  `loadConfig`. Tests never depend on `.env`.

## Dev modes

- `api` and `web` run with `--hot`, which reloads in place and keeps `globalThis`. `worker` runs
  with `--watch`, which restarts into a fresh runtime so timers never duplicate.
- There is no `--dev` flag. Debugging adds `--inspect` to the same mode (`make debug-<app>`).
