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
  workspace nor the unnamed `catalog:`
  ([tooling.md › Add a dependency](../docs/knowledge/tooling.md#add-a-dependency)).
- **Before naming an Effect or Drizzle API, in a plan as in code, read
  `.claude/rules/effect.md`.**
- **Composition: a unit keeps its one purpose; new behaviour wraps or composes it.** Before shaping
  a model, service, util or use case, in a plan as in code, read `.claude/rules/composition.md`.
- Update `docs/knowledge/` and `.claude/` in the commit that changes what they describe.
- **A change of substance runs through the lab, `.claude/skills/lab/SKILL.md`: micro on a branch
  alone, macro with a `lab.md` in `docs/tickets/`.** The owner starts it with `/lab`; asked for
  such a change without it, read that file and follow it as if `/lab <request>` had been typed.
  A typo, a version bump, a doc fix and a task in an agent's brief are no change of substance.
  Ignore artifact paths that plugins suggest (`.scratch/`, `docs/superpowers/`, an issue
  tracker). Why it is cut so: [sdd.md](../docs/knowledge/sdd.md).
- **`main` changes only through a squash-merged PR.** A change is one branch `<type>/<slug>` cut
  from `main`; commit on that branch, never on `main`
  ([sdd.md › Roadmap and history](../docs/knowledge/sdd.md#roadmap-and-history)).
- Before opening or pushing to a PR, read `.claude/rules/pull-requests.md`: its title and body.
- **The domain glossary is `docs/knowledge/glossary.md`.** Never create `GLOSSARY.md`,
  `CONTEXT.md` or `docs/adr/`, even when a skill asks for them.
- **The architecture decisions are `docs/knowledge/decisions.md`.** Asked to change a module
  boundary, the data layer, the kernel, a guard or a recorded decision, read that decision first
  and state what breaks and what it costs before changing anything; the change rewrites it.
- Code, docs and rules are written in English.
