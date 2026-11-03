# App Template

A chat clone (user → message → assistant reply) built as a template for enterprise projects:
a Bun, TypeScript and Effect modular monolith, with an api, a worker and a web client over one
domain. It grows one ticket at a time along the [roadmap](docs/knowledge/roadmap.md), and each
ticket keeps its spec, design and plan in `docs/tickets/`, so a project started from it inherits
the reasoning along with the code.

It is not a framework, and nothing here is generated: every layer is plain code meant to be read,
copied and changed.

## What it does today

An anonymous user gets a secret in a cookie, creates chats, sends messages with attachments, and
the assistant answers. The api writes the message and its jobs in one transaction and answers
`202`; the worker relays the jobs to SQS, writes the model's whole reply into the message and
titles the chat; the client polls the message until it is `done` or `failed`. Records
live in Postgres, attachment bytes in S3, and jobs go through an outbox and SQS (MiniStack
locally); `LLM_PROVIDER` picks the language model: Anthropic, or a stub that needs no key. The
browser UI still shows only the health panel.

```mermaid
sequenceDiagram
  participant W as apps/web (ApiClient)
  participant A as apps/api
  participant S as Postgres
  participant Q as SQS (MiniStack)
  participant K as apps/worker
  W->>A: POST /chats/:id/messages
  A->>S: one transaction: user message, queued assistant message, jobs
  A-->>W: 202
  K->>S: relay claims the unsent jobs
  K->>Q: assistant-message job (+ chat-title job on the first message)
  K->>Q: receive
  K->>S: preparing → generating → done with the text | failed
  W->>A: GET /chats/:id/messages/:messageId (poll)
```

How the transaction, the outbox and the relay work:
[database.md › The outbox](docs/knowledge/database.md#the-outbox),
[aws.md › Queues](docs/knowledge/aws.md#queues).

## Quick start

Requires Bun at the version in `package.json › packageManager`, GNU Make, Docker running and the
[Pulumi CLI](https://www.pulumi.com/docs/install/).

```sh
make setup   # bun install, git hooks, the Claude Code plugin, .env from .env.example
make up      # MiniStack with Postgres, the bucket and the queues inside it; migrates
make dev     # api, worker and web together
```

| Process | URL | Try |
|---|---|---|
| `apps/api` | <http://localhost:3000> | `/health` |
| `apps/web` | <http://localhost:3001> | the health panel; `/api/*` is proxied to the api |
| `apps/worker` | — | logs `worker started`, relays the jobs and consumes the queues |

A whole conversation from the shell, with the cookie kept in a jar:

```sh
curl -s -c jar -X POST localhost:3000/users
curl -s -b jar -X POST localhost:3000/chats
curl -s -b jar -X POST localhost:3000/chats/<chatId>/messages \
  -H 'content-type: application/json' -d '{"text":"Hello","attachmentIds":[]}'
# repeat while the assistant message is queued, preparing or generating: its text arrives whole
curl -s -b jar localhost:3000/chats/<chatId>/messages/<assistantMessageId>
```

`make down` stops the stand and keeps its data; `make reset` removes it whole. When `make up`
fails: [aws.md › When the stand fails](docs/knowledge/aws.md#when-the-stand-fails).

## Architecture at a glance

Three processes share one codebase and one database. The code is cut in three rings, the data
at the centre, the behaviour around it and the boundary outside, and every dependency points
inward. Which folder holds what:
[architecture.md › The three rings](docs/knowledge/architecture.md#the-three-rings); what may
import what, and the guard that refuses the rest:
[architecture.md › Dependency rules](docs/knowledge/architecture.md#dependency-rules). Why each
boundary holds, what it costs and what breaks if it is reversed:
[decisions.md](docs/knowledge/decisions.md), one record per decision.

The rules a change most often breaks, each with its owner: no rule outside the modules
([Use cases above the modules](docs/knowledge/decisions.md#use-cases-above-the-modules)), no
lock but a guard in the write ([database.md › Guards](docs/knowledge/database.md#guards)), no
message without its job ([database.md › The outbox](docs/knowledge/database.md#the-outbox)),
no service in the browser
([architecture.md › Boundary guards](docs/knowledge/architecture.md#boundary-guards)).

## Anatomy of a slice

One name crosses every ring under the same folder name: the entity and the model share it. Read
a slice from the data outward: the data layer's table, entity and repository, the model and its
pure operations, the mapper between entity and model, the service with the rules, the use case
composing services, the adapter implementing a port, the handler calling the use case. Every
file of the `chat` slice and what it is named:
[architecture.md › Where things live](docs/knowledge/architecture.md#where-things-live); the
suffixes and naming verbs: [.claude/rules/naming.md](.claude/rules/naming.md); where its tests
sit: [tooling.md › Tests](docs/knowledge/tooling.md#tests).

## Daily development

| To | Run | More |
|---|---|---|
| run every gate before a commit | `make check` (Docker running) | [tooling.md › Commands](docs/knowledge/tooling.md#commands) |
| run one process, or debug it | `make dev-api`, `make debug-api` (also `-worker`, `-web`) | [tooling.md › Run and debug](docs/knowledge/tooling.md#run-and-debug) |
| run the unit suites only, in seconds | `make test-unit` | [tooling.md › Tests](docs/knowledge/tooling.md#tests) |
| run one test file or one test | `vitest` on the file, with `-t` | [tooling.md › Commands](docs/knowledge/tooling.md#commands) |
| fix formatting and import order | `make fmt` | [tooling.md › Troubleshooting](docs/knowledge/tooling.md#troubleshooting) |
| change a table | edit its `.table.ts`, then `make migration NAME=<name>` and `make migrate` | [database.md › Migrations](docs/knowledge/database.md#migrations) |
| start over with an empty database | `make reset && make up` | [tooling.md › Environment](docs/knowledge/tooling.md#environment) |
| work on two branches at once | a worktree with its own ports and containers | [tooling.md › Worktrees](docs/knowledge/tooling.md#worktrees) |
| read Effect's or Drizzle's source at our pin | `repos/effect`, `repos/drizzle` | [tooling.md › Commands](docs/knowledge/tooling.md#commands) |
| learn why a check failed | the symptom table | [tooling.md › Troubleshooting](docs/knowledge/tooling.md#troubleshooting) |
| learn why a commit or a push was rejected | the hooks; never `--no-verify` | [tooling.md › Git hooks and CI](docs/knowledge/tooling.md#git-hooks-and-ci) |
| write a test | the kinds, where each goes, and time in `it.effect` | [tooling.md › Tests](docs/knowledge/tooling.md#tests) |

## Adding a feature

1. **Specify it as a ticket:** `/ticket-feature`, then architecture, plan, implement, verify —
   [sdd.md › The five skills](docs/knowledge/sdd.md#the-five-skills).
2. **Add an entity and its model** from the data outward, test first —
   [architecture.md › Add a new entity](docs/knowledge/architecture.md#add-a-new-entity).
3. **Add an AWS resource** to the inventory, local and deployed alike —
   [aws.md › Adding a resource](docs/knowledge/aws.md#adding-a-resource).

## Where to read next

| Question | Document |
|---|---|
| How do I run, debug, test, add a dependency or a workspace? Why did a check fail? | [docs/knowledge/tooling.md](docs/knowledge/tooling.md) |
| Which ring and layer does my code belong to, and what may it import? | [docs/knowledge/architecture.md](docs/knowledge/architecture.md) |
| How are records stored, guarded, migrated and tested? | [docs/knowledge/database.md](docs/knowledge/database.md) |
| How do the apps reach S3 and SQS, locally and on AWS? | [docs/knowledge/aws.md](docs/knowledge/aws.md) |
| What do the domain words mean? | [docs/knowledge/glossary.md](docs/knowledge/glossary.md) |
| How is a change specified, planned, implemented and verified? | [docs/knowledge/sdd.md](docs/knowledge/sdd.md) |
| What is built next, and in which order? | [docs/knowledge/roadmap.md](docs/knowledge/roadmap.md) |
| What are the rules for one layer? | the `CLAUDE.md` in its folder, and `.claude/rules/` |
| How are commits and pull requests written? | [.claude/rules/commits.md](.claude/rules/commits.md), [.claude/rules/pull-requests.md](.claude/rules/pull-requests.md) |
| Why is it built this way? | [docs/knowledge/decisions.md](docs/knowledge/decisions.md): each binding decision with its reason, its rejected alternatives and what a reversal breaks; its history in the ticket that made it, under `docs/tickets/` |

## History and new projects

`main` holds one squash commit per ticket; how a ticket's steps and reasoning stay findable:
[sdd.md › Roadmap and history](docs/knowledge/sdd.md#roadmap-and-history).

On GitHub, *Use this template* starts a new project from `main`; what to rename, delete and keep
afterwards is the roadmap's
[`template-handoff`](docs/knowledge/roadmap.md#12-template-handoff).
