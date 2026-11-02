# App Template

A chat clone (visitor → message → assistant reply) built as a template for enterprise projects.
Bun + TypeScript 7 modular monolith; three processes: `apps/api`, `apps/worker`, `apps/web`.

## Map

`application/<module>/` a module's pure `domain/`, its `services/` and its `infrastructure/`, the
adapters of its ports · `http-api/` the HTTP contract shared by `api` and `web` ·
`application/use-cases/` the use cases ·
`kernel/` this app's config, AWS clients and inventory · `packages/*` generic clients · `apps/*`
thin entry points · `deployment/` local and AWS · `apps/__e2e__/` the e2e over assembled layers,
the journey over `api` and `worker` in one process among them.
What may import what, which Biome enforces:
[architecture.md › Dependency rules](docs/knowledge/architecture.md#dependency-rules).

## Working here

- Run everything through `make <target>` (`make help`), from the one root `Makefile`.
  `make check` passes before work is reported. Tests: `make test-unit` (no Docker),
  `make test-e2e` (Docker running). Debug: `make debug-<app>`.
- Add a dependency with `bun add [-d] --catalog=<namespace> <pkg>@<exact>`, never a version in a
  workspace (`.claude/rules/tooling.md`).
- Update `docs/knowledge/` in the commit that changes the behaviour it describes.
- **A change of substance runs through the `/ticket-*` skills; their artifacts live only in
  `docs/tickets/`.** Ignore artifact paths that plugins suggest (`.scratch/`, `docs/superpowers/`,
  an issue tracker). The gates: `.claude/rules/sdd.md`; the guide:
  [docs/knowledge/sdd.md](docs/knowledge/sdd.md).
- **The domain glossary is `docs/knowledge/glossary.md`.** Never create `GLOSSARY.md`,
  `CONTEXT.md` or `docs/adr/`, even when a skill asks for them.
- **The architecture decisions are `docs/knowledge/decisions.md`.** Asked to change a module
  boundary, the data layer, the kernel, a guard or a recorded decision, read its record first and
  state what breaks and what it costs before changing anything; the change rewrites the record.
- Code, docs and rules are written in English.
