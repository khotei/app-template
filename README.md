# App Template

A working enterprise project to start new ones from, and the AI-assisted process that builds
it.

The template is a chat clone: a user asks in a chat, the assistant replies. The chat is only
the worked example; what a new project inherits is around it:

- 🏛️ **An architecture that holds.** A Bun, TypeScript and Effect modular monolith: three
  processes (`api`, `worker`, `web`) over one domain, the code cut in three rings, and the build,
  not a reviewer, refusing an import that points the wrong way.
- 🧱 **A stack wired end to end.** Postgres through Drizzle and events in SQS (MiniStack locally),
  Pulumi to provision them, a language model behind a service of the module that uses it. An S3
  bucket and the data layer's `FileRepository` over it are provisioned and tested, but no app
  wires them since attachments were removed
  ([Attachments removed](docs/knowledge/decisions.md#attachments-removed)).
- 🤖 **A development process run with AI agents.** Every change of substance runs through one
  skill, `/lab`: you set the intent and the shape, agents find the facts, write test first and
  review in a fresh context, and every round is a green commit you read alone. The reasoning is
  committed next to its code, so a project started from here inherits the why with the what.

It is not a framework, and nothing here is generated: every layer is plain code meant to be read,
copied and changed.

## ✨ What the example does

A user, an anonymous browser, gets a secret in a cookie, creates chats, asks in them, and the assistant
answers. A user's message starts a Run, the work of answering it, which the client polls, reads
back with the chat's messages after a reload, and retries as a new Run once it failed. The worker
also titles a new chat. The language model is Anthropic's. The browser UI still shows only the
health panel.

<img src=".misc/readme/how-it-works.svg"
  alt="One message: the api stores it with its queued Run in one transaction and sends its events
  after the commit; the worker moves the Run to generating, then to done with the
  assistant's message, or to failed; a retry is a new Run"
  width="830">

A failed Run keeps the full text of what ended it in its row, and no response carries it.

How the transaction and the events work:
[database.md › The sends](docs/knowledge/database.md#the-sends),
[aws.md › Queues](docs/knowledge/aws.md#queues).

## 🚀 Quick start

Requires Bun at the version in `package.json › packageManager`, GNU Make, Docker running and the
[Pulumi CLI](https://www.pulumi.com/docs/install/). The development process also needs
[Claude Code](https://code.claude.com/docs/en); the template does not.

```sh
make setup   # bun install, git hooks, the Claude Code plugin, .env from .env.example
make up      # MiniStack with Postgres, the bucket and the queues inside it, and Grafana; migrates
             # (the first make up downloads several GB: the provider plugins and the Grafana image)
make dev     # runs make migrate, then api, worker and web together; needs make up's stand
```

`.env` needs your `ANTHROPIC_API_KEY`; `.env.example` leaves it empty and names the language models
in `LLM_REPLY_MODEL` and `LLM_TITLE_MODEL`, and the tokens a chat's context may hold in
`LLM_CHAT_CONTEXT_TOKENS_LIMIT`. An empty or missing one stops the worker at start with a
`ConfigError` naming it; the api and the web read none of them.

<img src=".misc/readme/infrastructure.svg"
  alt="The local stand: apps/web, apps/api and apps/worker on the host; MiniStack with the SQS
  queues, the worker's Lambda mappings, the S3 bucket and the RDS database; the telemetry
  container with Grafana; the Anthropic API, reached by the worker alone; Pulumi provisions
  the containers and MiniStack's resources"
  width="830">

`make dev` runs the three processes on the host; `make up` has Pulumi start the two containers and
create the resources inside MiniStack.

| Process | URL | Try |
|---|---|---|
| `apps/api` | <http://localhost:3000> | `/health` |
| `apps/web` | <http://localhost:3001> | the health panel; `/api/*` is proxied to the api |
| `apps/worker` | <http://localhost:3002> | `POST /events`, the batches MiniStack's SQS mappings send |
| Grafana | <http://localhost:3003> | `admin`/`admin`: one trace per message, its logs inside ([observability.md](docs/knowledge/observability.md)) |

A whole chat from the shell, with the cookie kept in a jar:

```sh
curl -s -c jar -X POST localhost:3000/identity
curl -s -b jar -X POST localhost:3000/chats
curl -s -b jar -X POST localhost:3000/chats/<chatId>/messages \
  -H 'content-type: application/json' -d '{"text":"Hello"}'
# repeat while the Run is queued or generating: once done, its assistantMessageId names the reply
curl -s -b jar localhost:3000/chats/<chatId>/runs/<runId>
curl -s -b jar localhost:3000/chats/<chatId>/messages/<assistantMessageId>
# the reload: the chat's messages, each with its Run
curl -s -b jar localhost:3000/chats/<chatId>/messages
```

`make down` stops the stand and keeps its data; `make reset` removes it whole. When `make up`
fails: [aws.md › When the stand fails](docs/knowledge/aws.md#when-the-stand-fails).

## 🗺️ The repository as a system

The repository holds three things: the template's code, the knowledge about it, and the toolkit that
changes it.

| Folder | What it holds |
|---|---|
| `apps/` | the three processes, thin entry points that assemble the layers; `apps/e2e` tests them assembled |
| `application/` | the behaviour: the modules `chat`, `user` and `identity`, and above them the use cases, for a flow over modules or the owner's `askChat`, in `application/use-cases/<module>/` |
| `kernel/` | the configured clients (`config`, `postgres`, `aws`, `llm`) and `kernel/data`: every table, migration and repository |
| `packages/` | generic tools that know no app: database, S3 and queue clients, the AWS inventory's types, the codecs and the id schema (`schema`), UI, test helpers |
| `deployment/` | the Pulumi program of the local stand: MiniStack with the database, the bucket, the queues and the worker's Lambda mappings inside it, and the telemetry backend, from resource code an AWS stack can call |
| `docs/knowledge/` | how the system works today: architecture, data, AWS, AI, telemetry, tooling, process, decisions, glossary, roadmap |
| `docs/tickets/` | one folder per ticket: its `lab.md` (intent, steps, shapes, decisions); older ones keep their requirements, design, plan and verification |
| `.claude/` | the agent toolkit: the project's `CLAUDE.md`, skills, agents, hooks, rules and settings |
| `repos/` | Effect's and Drizzle's source at the pinned versions, to read rather than guess |
| `CLAUDE.md` in a folder | the rules of that layer, written for the agent and short enough for you |

## 🏛️ Architecture at a glance

The code is cut in three rings, and every dependency points inward:

<img src=".misc/readme/architecture.svg"
  alt="Three nested rings: the boundary (apps, the kernel's clients, a module's infrastructure)
  around the behaviour (use cases, a module's services, domain and contract) around the data
  (kernel/data); beside them the five guards that refuse a wrong import"
  width="830">

`kernel/data` is the one source of truth over every store, and the guards are in the build, so a
wrong import fails before a review. The rules a change most often breaks:

- no rule outside the modules
  ([Use cases above the modules](docs/knowledge/decisions.md#use-cases-above-the-modules));
- no lock but a write guard ([database.md › Guards](docs/knowledge/database.md#guards));
- no event sent before the commit of what it reads
  ([database.md › The sends](docs/knowledge/database.md#the-sends));
- no service in the browser
  ([architecture.md › Boundary guards](docs/knowledge/architecture.md#boundary-guards)).

From a model's rules up to a handler, each kind of code is built on the ones before it:

<img src=".misc/readme/module-design.svg"
  alt="The cut of chat: handler, Verb-Model service, Model service over the data
  layer's repositories, and the models' rules and moves; beside it, where a change goes:
  edit, wrap, compose or a Verb-Model service"
  width="830">

Rules and moves are plain functions, `<Model>Service` owns one model's records, and a purpose a
unit was not made for is a new unit that wraps or composes it, never an edit of it:
[composition.md](.claude/rules/composition.md), [layering.md](.claude/rules/layering.md).

One name crosses the rings: a model's files read from the data outward, table, entity and
repository, then model and service, then the api's HTTP group and handler. Every file of `chat`:
[architecture.md › Where things live](docs/knowledge/architecture.md#where-things-live). Why each
boundary holds, what it costs and what breaks if it is reversed:
[decisions.md](docs/knowledge/decisions.md), one entry per decision.

## 🤖 How work gets done

You work in this repository with Claude Code. Every change of substance goes through `/lab`,
sized once: a **micro** change (one session, no new decision) is a branch built from a plan of
five lines and reviewed once; a **macro** one gets a `lab.md` in its ticket folder, with your
intent, its steps and the shape of each, built with you in the session or handed to an
`implementer` once the shape is settled. A typo, a version bump or a doc fix needs neither.

What keeps the agents honest:

- 🧪 **Red, then green.** Each behaviour starts as a failing test; an `implementer` cannot
  finish red, since a hook runs `make check` when it stops.
- 🔍 **Every round is a commit you read alone,** your own edits a round of their own, and each
  step is reviewed once by read-only `reviewer` agents in a fresh context: against the intent,
  for silent failures and against the rules.
- 👀 **Done is visible:** a command you can repeat, and the whole feature played before the PR.
- 📜 **The reasoning stays.** The lab's file and the commit messages keep each decision and its
  rejected alternatives; `main` holds one squash commit per change.

<img src=".misc/readme/principles.svg"
  alt="Five principles, each with what it means here and the document that holds it: composition
  over folding; guards in the build, not in review; one source of truth for data; minimal,
  then right, then hard; the reasoning committed beside the code"
  width="830">

The code and the process follow the same five principles, each held in the document named beside
it. Why the process is cut so: [sdd.md](docs/knowledge/sdd.md).

## 🛠️ Daily development

| To | Run | More |
|---|---|---|
| run every gate before a commit | `make check` (Docker running) | [tooling.md › Commands](docs/knowledge/tooling.md#commands) |
| run one process, or debug it | `make dev-api`, `make debug-api` (also `-worker`, `-web`) | [tooling.md › Run and debug](docs/knowledge/tooling.md#run-and-debug) |
| run the unit suites only, in seconds | `make test-unit` | [tooling.md › Tests](docs/knowledge/tooling.md#tests) |
| run one test file or one test | `vitest` on the file, with `-t` | [tooling.md › Commands](docs/knowledge/tooling.md#commands) |
| fix formatting and import order | `make fmt` | [tooling.md › Troubleshooting](docs/knowledge/tooling.md#troubleshooting) |
| change a table | edit its `.table.ts`, regenerate the one `init` migration, rebuild the local database | [database.md › Migrations](docs/knowledge/database.md#migrations) |
| start over with an empty database | `make reset && make up` | [tooling.md › Environment](docs/knowledge/tooling.md#environment) |
| work on two branches at once | a worktree with its own TCP ports and containers | [tooling.md › Worktrees](docs/knowledge/tooling.md#worktrees) |
| learn why a check failed | the symptom table | [tooling.md › Troubleshooting](docs/knowledge/tooling.md#troubleshooting) |
| learn why a commit or a push was rejected | the hooks; never `--no-verify` | [tooling.md › Git hooks and CI](docs/knowledge/tooling.md#git-hooks-and-ci) |
| write a test | the kinds, where each goes, and time in `it.effect` | [tooling.md › Tests](docs/knowledge/tooling.md#tests) |

<img src=".misc/readme/rules-and-style.svg"
  alt="The fifteen files of .claude/rules grouped by what they bind, the six questions of name-
  and-body.md, the two forms of a file name, and wire errors as Schema.TaggedError against
  inner ones as Data.TaggedError"
  width="830">

A change is reviewed against the rules in `.claude/rules/`; the ones you meet first are the six
questions every public name answers, the file names and the two kinds of error.

## 🧩 Extending it

Each addition has a checklist, written from the data outward and test first:

- an entity and its model: [architecture.md › Add a new entity](docs/knowledge/architecture.md#add-a-new-entity);
- a module: [architecture.md › Add a module](docs/knowledge/architecture.md#add-a-module);
- a store's client: [architecture.md › Add a store's client](docs/knowledge/architecture.md#add-a-stores-client);
- an AWS resource, local and deployed alike:
  [aws.md › Adding a resource](docs/knowledge/aws.md#adding-a-resource);
- a dependency or a workspace: [tooling.md › Dependencies](docs/knowledge/tooling.md#dependencies).

<img src=".misc/readme/patterns.svg"
  alt="Six shapes from chat: a guarded move through RunService.update, a rule keyed by a table, the
  writes in one transaction with the sends after it, errors handled once at a flow's end,
  a method uninterruptible but for its answer, and Layer.mock of the repositories in unit
  suites"
  width="830">

New code repeats these six shapes from `chat`, each shortened from its file.

## 🌱 Starting a new project

On GitHub, *Use this template* starts a new project from `main`. The checklist of what to rename,
delete and keep afterwards is planned as the roadmap's
[`template-handoff`](docs/knowledge/roadmap.md#12-template-handoff). What is built next, and in
which order: [roadmap.md](docs/knowledge/roadmap.md).

## 📚 Where to read next

| Question | Document |
|---|---|
| How do I run, debug, test, add a dependency or a workspace? Why did a check fail? | [docs/knowledge/tooling.md](docs/knowledge/tooling.md) |
| Which ring and layer does my code belong to, and what may it import? | [docs/knowledge/architecture.md](docs/knowledge/architecture.md) |
| How are records stored, guarded, migrated and tested? | [docs/knowledge/database.md](docs/knowledge/database.md) |
| How are S3 and SQS reached, locally and on AWS? | [docs/knowledge/aws.md](docs/knowledge/aws.md) |
| How does the assistant ask the language model for a reply or a title? | [docs/knowledge/ai.md](docs/knowledge/ai.md) |
| How do I follow one message through the api and the worker? | [docs/knowledge/observability.md](docs/knowledge/observability.md) |
| What do the domain words mean? | [docs/knowledge/glossary.md](docs/knowledge/glossary.md) |
| How does a change get built, and why that way? | [docs/knowledge/sdd.md](docs/knowledge/sdd.md) |
| What is built next, and in which order? | [docs/knowledge/roadmap.md](docs/knowledge/roadmap.md) |
| What are the rules for one layer? | the `CLAUDE.md` in its folder, and `.claude/rules/` |
| How are commits and pull requests written? | [.claude/rules/commits.md](.claude/rules/commits.md), [.claude/rules/pull-requests.md](.claude/rules/pull-requests.md) |
| Why is it built this way? | [docs/knowledge/decisions.md](docs/knowledge/decisions.md): each binding decision with its reason, its rejected alternatives and what a reversal breaks; its history in the ticket that made it, under `docs/tickets/` |

How a merged ticket's steps and reasoning stay findable in the history:
[sdd.md › Roadmap and history](docs/knowledge/sdd.md#roadmap-and-history).
