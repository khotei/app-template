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
`preparing` and `generating` run it in stages, `running` in one, `done` and `failed` end it.
Every model with a status picks its subset of `Status` (the chat, the message), and a
check on one value reads the shared predicate.
_Avoid_: State, stage, in progress; a new word for one of the seven

**Chat status**:
`queued` while the chat's reply is in work, `failed` after its last reply failed, else `idle`;
stored on the chat. A send moves it to `queued`, the reply's end to `idle` or `failed`.
_Avoid_: Busy, chat state; a value outside its subset (`generating`)

**Title**:
The short name of a chat, shown in the user's chat list. The assistant proposes one from the
first message unless the user has already set one; a user's title is never overwritten.
_Avoid_: Name, subject, summary

**Attachment**:
A file a user uploaded; no assistant produces files yet. An attachment is bound to a message
when that message is sent; until then only its owner can see it.
_Avoid_: File, upload, document, media, draft

**Assistant**:
The language-model side of a chat, as the user sees it. The language model behind it is a
provider's artefact and is named only at the boundary.
_Avoid_: Bot, AI, agent, model

**Provenance**:
Who the api expects to answer a reply and with which instructions: the configured provider and
reply model and a hash of the system prompt with the reply schema. It travels in the reply's job
alone, and no record keeps it; the message never carries it, and the worker may run
another language model while a deploy rolls out. For operators only; no api response carries it.
_Avoid_: Metadata, model info, source, origin

## Architecture language

The words the rings, layers, rules and tickets use for the shape of the code. The rings and which
folder holds what: [architecture.md › The three rings](architecture.md#the-three-rings). Each
word has one meaning here; the `_Avoid_` lists name the synonyms the sources use that we do not.

**Entity**:
A record as the data layer reads and writes it, derived from its table in the data layer's own
types (`ChatEntity`, with its `Insert`, `Where` and `Set`): the one shape every read of its store
returns. Never a model; a module's mapper turns it into one.
_Avoid_: Model, row type, record class, DTO

**Data layer**:
The ring at the centre, `kernel/data`: every store's records, in entities. It holds no rule and
knows no module; every module reads and writes it.
_Avoid_: Persistence layer, DAL, repository layer, shared domain

**Application**:
The ring of the behaviour, under `application/`: the modules and, above them, the use cases that
compose them. It holds every business rule; the data layer stores what it decides, the boundary
connects it to the world, and the apps run it.
_Avoid_: Application layer, app (a process under `apps/`), business layer

**Module**:
A business capability whose mission fits one sentence, a folder of `application/` with one
entry, `@app-template/application/<module>`. Its records live in the data layer. Never one per
table or per aggregate.
_Avoid_: Component, core, slice, feature folder, bounded context, service

**Module contract**:
The part of a module other modules may depend on, its folder `contract/`, exported through its
entry: its ids, its errors and the shapes they carry, with no implementation.
_Avoid_: Public API, interface, SDK, client

**API contract**:
The HTTP API described on its own, `http-api`: its routes, the shapes and errors on the wire and
the client derived from them. It imports nothing of the app; the api implements it and the web
calls it. Never a module contract.
_Avoid_: DTO layer, SDK, wire schemas, shared domain

**Use case**:
One scenario that composes domain services, of one module or several, with the files, the jobs,
the assistant or one transaction; what a handler calls when a flow is more than one service
method. It calls each module's rules and holds none of its own.
_Avoid_: Interactor, orchestrator, workflow, application service, job

**Boundary**:
The outer ring, everything that touches the world outside the process.
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
(`AssistantLlmFromConfig`).
_Avoid_: Implementation, provider, DAO, store

**Domain service**:
The owner of one model's rules: every write a rule guards goes through it. It is named by its
model (`ChatService`); one that holds a single operation belonging to no model is named by that
operation, without `Service` (`FundsTransfer`).
_Avoid_: Manager, helper, application service, business logic, service layer

**Handler**:
The entry point of one request or one job in an app.
_Avoid_: Controller, consumer, processor, endpoint

**Job**:
A message on a queue that asks the worker for one unit of work, shaped by its queue definition.
_Avoid_: Task, event, command, message (the chat's word)

**Kernel**:
The workspace `kernel/`: the data layer at its centre, and around it the tools of `packages/*`
configured for this app. It holds no business rule and knows no module.
_Avoid_: Shared kernel, common, core, shared, utils, platform

**Package**:
A folder under `packages/`, imported as `@app-template/packages/<name>`: a tool configured by
its caller that knows no app, so it would work in another project unchanged; the kernel
configures it for this one.
_Avoid_: Library (for a workspace), lib, helper, kernel

**Unit test**:
A test over memory layers, needing no process outside the test runner.
_Avoid_: Fast test, isolated test, mock test

**E2E test**:
A test over the containers the run starts (Postgres, MiniStack).
_Avoid_: Integration test, system test, functional test

**Memory layer**:
A layer of a repository or a port over a `Ref<HashMap>`, one per service; a repository's over
the same entities as the real one. The unit tests' only double.
_Avoid_: Mock, stub, in-memory repository
