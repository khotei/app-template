# App Template

A chat clone (visitor → message → assistant reply) built as a template for enterprise projects.
It grows one ticket at a time along the [roadmap](docs/knowledge/roadmap.md), and each ticket keeps
its spec, design and plan in `docs/tickets/`, so a project started from it inherits the reasoning
along with the code. Bun + TypeScript 7 modular monolith with three processes: `apps/api`,
`apps/worker` and `apps/web`.

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
| What is built next, in which order, and what does each ticket inherit? | [docs/knowledge/roadmap.md](docs/knowledge/roadmap.md) |
| What are the rules for one layer? | its `CLAUDE.md`, listed in [CLAUDE.md](CLAUDE.md) |
| How are commits and pull requests written? | [.claude/rules/commits.md](.claude/rules/commits.md), [.claude/rules/pull-requests.md](.claude/rules/pull-requests.md) |
| Why is the scaffold built this way? | the ticket that built it, `docs/tickets/2026-10-15_monorepo-setup/`, and the step commits on branch `chore/monorepo-setup` |

## Branches

| Branch | Holds |
|---|---|
| `main` | one squash commit per ticket, whose body is the PR description |
| `chore/monorepo-setup` | the scaffold ticket's plan steps, one commit each |
| `chore/enterprise-template` | the plan steps of every ticket after the scaffold |

Why the steps live next to a clean `main`, and how a ticket reaches both:
[docs/knowledge/sdd.md › Roadmap and the teaching branch](docs/knowledge/sdd.md#roadmap-and-the-teaching-branch).

## Starting a new project

On GitHub, *Use this template → Include all branches* copies every branch, the three above among
them. What to rename, delete and keep afterwards is roadmap entry 12,
[`template-handoff`](docs/knowledge/roadmap.md#12-template-handoff).
