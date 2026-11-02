# Glossary

The ubiquitous language of App Template's example domain: an anonymous chat with an assistant,
the way ChatGPT or Claude works before signing in. Code, tickets and docs use these words; the
`_Avoid_` lists name the synonyms that are banned.

## Chat

**User**:
An anonymous browser the api recognises by a secret it issued on first contact; the owner of chats.
Not an account: there is nothing to sign in to.
_Avoid_: Visitor, account, anonymous user, device, session

**User secret**:
The credential the api issues to a user on first contact and recognises them by afterwards. Only
the user's browser holds it.
_Avoid_: Token, session id, api key, cookie (the cookie carries it; it is not the secret)

**Chat**:
A conversation between one user and the assistant: an ordered list of messages, with an optional
title. While the chat has an active message, the user cannot send another.
_Avoid_: Conversation, thread, dialogue, session

**Message**:
One turn in a chat, authored by the user or by the assistant, with text and zero or more
attachments. A user's message is complete when sent; an assistant's message is born `queued` and
moves through the message statuses.
_Avoid_: Prompt, reply, completion, turn

**Message status**:
Where an assistant message is in its life, its subset of `Status`: `queued` (the chat has asked
for it), `preparing` (the assistant is reading the chat), `generating` (the assistant is writing;
the text appears whole when it is done), `done`, or `failed` (the assistant gave up or declined; the
message carries a reason). The last two are terminal.
_Avoid_: Stage, state, completed, in-progress, pending, streaming

**Active message**:
The assistant message of a chat that is not yet terminal (`queued`, `preparing` or `generating`).
A chat has at most one, and its chat stays `queued` while it runs.
_Avoid_: Pending message, current reply

**Status**:
The one vocabulary of states in flight: `idle` waits for work, `queued` has work in flight,
`preparing` and `generating` run it, `done` and `failed` end it. Every model with a status picks
its subset of `Status` (the chat, the message), and a check on one value reads the shared
predicate (`isQueued`).
_Avoid_: State, stage; a new word for one of the six

**Chat status**:
`queued` while the chat's reply is in work, `failed` after its last reply failed, else `idle`;
stored on the chat. A send moves it to `queued` (`queueChat`), the reply's end to `idle`
(`idleChat`) or `failed` (`failChat`).
_Avoid_: Busy, chat state; a value outside its subset (`generating`)

**Title**:
The short name of a chat, shown in the user's chat list. The assistant proposes one from the
first message unless the user has already set one; a user's title is never overwritten.
_Avoid_: Name, subject, summary

**Attachment**:
A file a user uploaded, or one produced for an assistant message. A user's attachment is bound
to a message when that message is sent; until then only its owner can see it.
_Avoid_: File, upload, document, media, draft

**Placeholder**:
A marker inside a message's text that stands for one of its attachments; the web app renders the
attachment in its place.
_Avoid_: Template variable, token, embed, slot

**Assistant**:
The language-model side of a chat, as the user sees it. The language model behind it is a
provider's artefact and is named only at the boundary: `kernel/llm` and a module's
`infrastructure/`.
_Avoid_: Bot, AI, agent, model

**Provenance**:
Who the api expects to answer a reply and with which instructions: the configured provider and
reply model and a hash of the system prompt with the reply schema. It travels in the reply's job
and stays in the table `jobs` once sent; the message never carries it, and the worker may run
another language model while a deploy rolls out. For operators only; no api response carries it.
_Avoid_: Metadata, model info, source, origin

## Architecture language

The words the rings, layers, rules and tickets use for the shape of the code. The code is cut in
three rings, the data layer at the centre, the application around it and the boundary outside,
and every dependency points inward. Each word has one meaning here; the `_Avoid_` lists name the
synonyms the sources use that we do not.

**Entity**:
A record as the data layer reads and writes it, derived from its table in the data layer's own
types (`ChatEntity`, with its `Insert`, `Where` and `Set`): the one shape every read of its store
returns. Never a model; a module's mapper turns it into one.
_Avoid_: Model, row type, record class, DTO

**Data layer**:
The ring at the centre, `kernel/data`: one `Db` over every table and relation, the migrations,
and a repository per store (a table, the attachments' objects, the jobs), all in entities. It
holds no rule, knows no module and takes its clients from the context; every module reads and
writes it.
_Avoid_: Persistence layer, DAL, repository layer, shared domain

**Application**:
The ring of the behaviour, under `application/`: the modules and, above them, the use cases that
compose them. It holds every business rule; the data layer stores what it decides, the boundary
connects it to the world, and the apps run it.
_Avoid_: Application layer, app (a process under `apps/`), business layer

**Module**:
A business capability whose mission fits one sentence, a workspace under `application/`: its
models, rules, errors and ports in `domain/`, its domain services, mappers and queue definitions
in `services/`, the adapters of its ports in `infrastructure/`. Its records live in the data
layer. It imports another module only through that module's contract, and never the use cases.
Never one per table or per aggregate.
_Avoid_: Component, core, slice, feature folder, bounded context, service

**Module contract**:
The part of a module other modules may depend on, a workspace nested in the module's folder
(`application/identity/contract/`): its ids, its errors and the shapes they carry, with no
implementation. A dependency on a contract is a dependency on its module, so two modules that
import each other's contracts form a cycle.
_Avoid_: Public API, interface, SDK, client

**Use case**:
One scenario that composes domain services, of one module or several, with the files, the jobs,
the assistant or one transaction; what a handler calls when a flow is more than one service
method. Every use case lives in `application/use-cases`, above the modules, so a flow that spans
modules is one too: it calls each module's rules, holds none of its own, and may commit their
writes in one transaction.
_Avoid_: Interactor, orchestrator, workflow, application service, job

**Boundary**:
The outer ring, everything that touches the world outside the process: the kernel's configured
clients, each module's `infrastructure/`, `http-api` and the apps, which assemble the layers and
provide the clients.
_Avoid_: Edge, shell, outer layer, infrastructure layer

**Aggregate**:
The models whose records change together under one invariant: a chat with its messages, an
attachment, a user. Each model of it has its own domain service.
_Avoid_: Entity group, root, aggregate root

**Model**:
The `Schema.Class` of a domain concept as its module sees it, with its pure operations (`Chat`,
`Message`). Not the language model, which keeps both words.
_Avoid_: Entity, DTO, row

**Port**:
A contract the domain declares for what it needs from outside the process (the assistant), in
the domain's words, with no layer of its own; a store's repository is the data
layer's, no port.
_Avoid_: Interface, client, gateway, driver, store

**Adapter**:
An implementation of a port over a client, in a module's `infrastructure/`: the assistant
(`AssistantLlm`).
_Avoid_: Implementation, provider, DAO, store

**Domain service**:
The owner of one model's rules: every write a rule guards goes through it. It is named by its
model (`ChatService`); one that holds a single operation belonging to no model is named by that
operation, without `Service` (`FundsTransfer`).
_Avoid_: Manager, helper, application service, business logic, service layer

**Handler**:
The entry point of one request or one job in an app.
_Avoid_: Controller, consumer, processor, endpoint

**Relay**:
A kernel layer that moves records from the database to a queue and holds no rule
(`JobRelay`).
_Avoid_: Dispatcher, publisher, poller

**Outbox**:
The pattern by which a use case writes its jobs to the table `jobs`, in the transaction of the
records they read, for the relay to send them.
_Avoid_: Event table, queue table

**Job**:
A message on a queue that asks the worker for one unit of work, shaped by its queue definition.
_Avoid_: Task, event, command, message (the chat's word)

**Kernel**:
The workspace `kernel/`: the data layer at its centre, and around it the tools of `packages/*`
configured for this app (its config, its Postgres client and migrate program, its AWS clients
and inventory, its queue's transport and relay, its language model). It holds no business rule
and knows no module.
_Avoid_: Shared kernel, common, core, shared, utils, platform

**Package**:
A workspace under `packages/*`: a tool configured by its caller that knows no app, so it would
work in another project unchanged. Every ring may use it; the kernel configures it for this one.
_Avoid_: Library (for a workspace), lib, helper, kernel

**Unit test**:
A test of a domain service, a use case or a handler over memory layers, needing no process
outside the test runner.
_Avoid_: Fast test, isolated test, mock test

**E2E test**:
A test over the containers the run starts (Postgres, MiniStack): of a repository, of an adapter,
of the transaction a use case runs, or of the journey through both apps.
_Avoid_: Integration test, system test, functional test

**Memory layer**:
A layer of a repository or a port over a `Ref<HashMap>`, one per service: the repositories' in
the kernel's `__tests__/testing/`, over the same entities as the real ones, the others' in the
`__tests__/testing/` of the workspace that declares the service. The unit tests' only double.
_Avoid_: Mock, stub, in-memory repository
