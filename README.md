# Oblik+

A workstation for a records department: roster, documents, reports and LLM-assisted analysis.
Bun + TypeScript 7 modular monolith with three processes: `apps/api`, `apps/worker` and `apps/web`.

## Quick start

Requires Bun 1.4.3 (the `packageManager` field) and GNU Make.

```sh
make setup   # bun install, git hooks, and .env from .env.example
make dev     # api, worker and web together
```

| Process | URL | Try |
|---|---|---|
| `apps/api` | <http://localhost:3000> | `curl localhost:3000/health` |
| `apps/web` | <http://localhost:3001> | the health panel; `/api/*` is proxied to the api |
| `apps/worker` | — | logs `worker started` and polls every second |

`make help` lists every other command.

## Where to read next

| Question | Document |
|---|---|
| How do I run, debug, test, add a dependency or a workspace? Why did a check fail? | [docs/knowledge/tooling.md](docs/knowledge/tooling.md) |
| Which layer does my code belong to, and what may it import? How do I add an entity? | [docs/knowledge/architecture.md](docs/knowledge/architecture.md) |
| How is a change specified, planned, implemented and verified? What do the `/ticket-*` skills use under the hood? | [docs/knowledge/sdd.md](docs/knowledge/sdd.md) |
| What are the rules for one layer? | its `CLAUDE.md`, listed in [CLAUDE.md](CLAUDE.md) |
| How are commits and pull requests written? | [.claude/rules/commits.md](.claude/rules/commits.md), [.claude/rules/pull-requests.md](.claude/rules/pull-requests.md) |
| Why is the scaffold built this way? | [the ticket that built it](docs/tickets/2026-10-15_monorepo-setup/architecture.md#decisions) |

## Starting a new project from a template

The scaffold is frozen as cumulative `template/*` branches; each one passes `make check` on its own:

| Branch | Adds |
|---|---|
| `template/monorepo` | workspaces, catalogs, the `example` slice in every layer, three apps, `Makefile` |
| `template/tooling` | Biome with the layer guards, `#<workspace>/` imports, husky hooks, CI, PR templates |
| `template/claude` | `CLAUDE.md` files, `.claude/` rules and the SDD toolkit, `docs/knowledge/` |

```sh
git checkout template/<layer> -b <project>
```

Then rename the `@oblik` scope everywhere, delete `docs/tickets/2026-10-15_monorepo-setup/` (it is
this scaffold's own worked ticket), and run `make setup && make check`.
