---
paths:
  - "**/package.json"
  - "Makefile"
  - ".env*"
  - "packages/config/**"
---

# Tooling

Imperatives only. The commands: the root `CLAUDE.md`; the explanations:
[docs/knowledge/tooling.md](../../docs/knowledge/tooling.md).

## Dependencies

- Versions live only in the root `catalogs`, pinned exactly. Workspaces reference them with
  `catalog:<namespace>`, never the unnamed `catalog:`.
- Put a new dependency in `tools` or `runtime` by the definitions in the knowledge doc; give a
  lock-step family its own namespace.
- After `bun add` (the root `CLAUDE.md`), declare the dependency in each consuming workspace.

## Environment

- Keep one hand-written root `.env`, plus `.env.pulumi`, which `make up` writes from the stack's
  outputs; never edit or commit it. List in `.env.example` only the variables the code reads from
  `.env`, plus the ones a client SDK reads from the environment itself; keep values for stubbed
  services commented out.
- App scripts load both, `--env-file=../../.env --env-file=../../.env.pulumi`. Quote every
  `.env` value that holds a space. Read settings only through the `@app-template/config`
  services' layers. Tests never depend on `.env`.

## Dev modes

- Keep `api` and `web` on `--hot` and `worker` on `--watch`; never invent a `--dev` flag.
