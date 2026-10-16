# Oblik+

A workstation for a records department: roster, documents, reports and LLM-assisted analysis.
Bun + TypeScript 7 modular monolith; three processes: `apps/api`, `apps/worker`, `apps/web`.

## Map

| Workspace | Role | Rules |
|---|---|---|
| `domain/` | pure core: models, errors, ports | [domain/CLAUDE.md](domain/CLAUDE.md) |
| `infrastructure/` | adapters that implement domain ports | [infrastructure/CLAUDE.md](infrastructure/CLAUDE.md) |
| `application/` | services and use cases | [application/CLAUDE.md](application/CLAUDE.md) |
| `packages/*` | generic clients and libraries | [packages/CLAUDE.md](packages/CLAUDE.md) |
| `apps/*` | thin entry points | [apps/CLAUDE.md](apps/CLAUDE.md) |
| `deployment/` | local and AWS deployment | [deployment/CLAUDE.md](deployment/CLAUDE.md) |

Imports only go down: `apps` → `application` → `infrastructure` → `domain`. How the layers fit
together: [docs/knowledge/architecture.md](docs/knowledge/architecture.md).

## Working here

- `make help` lists every command; `make check` must pass before a step is reported.
- Conventions live in `.claude/rules/` (naming, comments, commits, pull requests, tooling, SDD).
- **SDD artifacts live only in `docs/tickets/<YYYY-MM-DD>_<slug>/`.** Ignore artifact paths that
  plugins suggest (`.scratch/`, `docs/superpowers/`). The flow: `.claude/rules/sdd.md`.
- **Never commit, amend, push or open a PR without the user's explicit OK.**
- Code, docs and rules are written in English.
