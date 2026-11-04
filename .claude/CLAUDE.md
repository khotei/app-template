# App Template

A chat clone (user → message → assistant reply) built as a template for enterprise projects: a
Bun, TypeScript and Effect modular monolith of three processes, `api`, `worker` and `web`.

## Map

Which folder holds what, the three rings, what may import what, and how to add a module, an
entity or a store's client: [architecture.md](../docs/knowledge/architecture.md).

## Working here

- Run everything through `make <target>` (`make help`), from the one root `Makefile`.
  `make check` passes before work is reported. Tests: `make test-unit` (no Docker),
  `make test-e2e` (Docker running). Debug: `make debug-<app>`.
- Add a dependency with `bun add [-d] --catalog=<namespace> <pkg>@<exact>`, never a version in a
  workspace ([tooling.md › Add a dependency](../docs/knowledge/tooling.md#add-a-dependency)).
- **Before naming an Effect or Drizzle API, in a plan as in code, read
  `.claude/rules/effect.md`.**
- Update `docs/knowledge/` in the commit that changes the behaviour it describes.
- **A change of substance runs through the `/ticket-*` skills; their artifacts live only in
  `docs/tickets/`.** Which change is one:
  [sdd.md › When to run which cycle](../docs/knowledge/sdd.md#when-to-run-which-cycle). Ignore
  artifact paths that plugins suggest (`.scratch/`, `docs/superpowers/`, an issue tracker). The
  gates: `.claude/rules/sdd.md`; the guide: [sdd.md](../docs/knowledge/sdd.md).
- **`main` changes only through a squash-merged PR.** A ticket is one branch `<type>/<slug>` cut
  from `main`; commit on that branch, never on `main`
  ([sdd.md › Roadmap and history](../docs/knowledge/sdd.md#roadmap-and-history)).
- **The domain glossary is `docs/knowledge/glossary.md`.** Never create `GLOSSARY.md`,
  `CONTEXT.md` or `docs/adr/`, even when a skill asks for them.
- **The architecture decisions are `docs/knowledge/decisions.md`.** Asked to change a module
  boundary, the data layer, the kernel, a guard or a recorded decision, read its record first and
  state what breaks and what it costs before changing anything; the change rewrites the record.
- Code, docs and rules are written in English.
