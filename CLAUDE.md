# App Template

A chat clone (visitor → message → assistant reply) built as a template for enterprise projects.
Bun + TypeScript 7 modular monolith; three processes: `apps/api`, `apps/worker`, `apps/web`.

## Map

| Workspace | Role | Rules |
|---|---|---|
| `domain/` | pure core: models, errors, ports | [domain/CLAUDE.md](domain/CLAUDE.md) |
| `http-api/` | the HTTP contract (`HttpApi`) over the domain, shared by `api` and `web` | [http-api/CLAUDE.md](http-api/CLAUDE.md) |
| `infrastructure/` | adapters that implement domain ports | [infrastructure/CLAUDE.md](infrastructure/CLAUDE.md) |
| `application/` | services and use cases | [application/CLAUDE.md](application/CLAUDE.md) |
| `packages/*` | generic clients and libraries | [packages/CLAUDE.md](packages/CLAUDE.md) |
| `apps/*` | thin entry points | [apps/CLAUDE.md](apps/CLAUDE.md) |
| `deployment/` | local and AWS deployment | [deployment/CLAUDE.md](deployment/CLAUDE.md) |
| `e2e/` | the journey over `apps/api` and `apps/worker` in one process | [tooling.md › Tests](docs/knowledge/tooling.md#tests) |

Imports follow
[docs/knowledge/architecture.md › Dependency rules](docs/knowledge/architecture.md#dependency-rules);
Biome enforces them.

## Working here

- **SDD artifacts live only in `docs/tickets/`.** Ignore artifact paths that plugins suggest
  (`.scratch/`, `docs/superpowers/`, an issue tracker). The flow: `.claude/rules/sdd.md`; the guide:
  [docs/knowledge/sdd.md](docs/knowledge/sdd.md).
- **The domain glossary is `docs/knowledge/glossary.md`.** Never create `GLOSSARY.md`,
  `CONTEXT.md` or `docs/adr/`, even when a skill asks for them.
- Code, docs and rules are written in English.
