# Tooling

Imperatives only. The explanations live in [docs/knowledge/tooling.md](../../docs/knowledge/tooling.md).

## Commands

- Run everything through `make <target>` (`make help` lists them). There is exactly one `Makefile`,
  at the root; never add one to a workspace.
- `make check` must pass before a step is reported.
- Typecheck with `make typecheck`; test with `make test`.

## Dependencies

- Versions live only in the root `catalogs`, pinned exactly. Workspaces reference them with
  `catalog:<namespace>`, never the unnamed `catalog:`.
- Put a new dependency in `tools` or `runtime` by the definitions in the knowledge doc; give a
  lock-step family its own namespace.
- Add a dependency with `bun add [-d] --catalog=<namespace> <pkg>@<exact>`, then declare it in each
  consuming workspace.

## Environment

- Keep one root `.env`. List in `.env.example` only the variables the code reads, plus the ones a
  client SDK reads from the environment itself; keep values for stubbed services commented out.
- App scripts load the root file with `--env-file=../../.env`; only `make up` sources it in the
  shell, for the Pulumi program, so quote every value that holds a space. Read settings only
  through the `@app-template/config` services' layers. Tests never depend on `.env`.

## Dev modes

- Keep `api` and `web` on `--hot` and `worker` on `--watch`; never invent a `--dev` flag.
- Debug with `make debug-<app>`.
