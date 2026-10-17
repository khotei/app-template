# Tooling

Imperatives only. The explanations live in [docs/knowledge/tooling.md](../../docs/knowledge/tooling.md).

## Commands

- Run everything through `make <target>` (`make help` lists them). There is exactly one `Makefile`,
  at the root; never add one to a workspace.
- The root `package.json` holds only `prepare`, `lint`, `format` and `test`. Apps hold `dev`,
  `debug` and `start`. Library workspaces hold no scripts.
- `make check` must pass before a step is reported.
- Typecheck with `make typecheck`; test with `make test`, never `bun test`.
- Never commit files that `tsc -b` emits.
- Bun is the only package manager; `npm`, `yarn` and `pnpm` are denied.
- Never bypass the git hooks with `--no-verify`.

## Dependencies

- Versions live only in the root `catalogs`, pinned exactly. Workspaces reference them with
  `catalog:<namespace>`, never the unnamed `catalog:`.
- Put a new dependency in `tools` or `runtime` by the definitions in the knowledge doc; give a
  lock-step family its own namespace.
- Add a dependency with `bun add [-d] --catalog=<namespace> <pkg>@<exact>`, then declare it in each
  consuming workspace.

## New workspace

Create the directory, add its path to the root `workspaces`, add it to the root
`tsconfig.json` `references`, give its `package.json` an `imports` entry `#<name>/*`, and make its
`tsconfig.json` extend `tsconfig.base.json` with `outDir` under `node_modules/.cache/tsc/<name>`.

## Environment

- Keep one root `.env`. List in `.env.example` only the variables the code reads, and keep values
  for stubbed services commented out.
- Double-quote string values; leave numbers bare (`API_PORT=3000`).
- App scripts load the root file with `--env-file=../../.env`. Read settings only through
  the `@app-template/config` services' layers. Tests never depend on `.env`.

## Dev modes

- Keep `api` and `web` on `--hot` and `worker` on `--watch`; never invent a `--dev` flag.
- Debug with `make debug-<app>`.
