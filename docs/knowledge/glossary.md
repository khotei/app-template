# Glossary

The words of App Template: its example domain, an anonymous chat with an assistant the way
ChatGPT or Claude works before signing in, and the words its code, docs and rules use for their
own shape, queues and tests. Each word means only what its entry says, in every folder and in a
name, a comment, a test's name, a log or a lint message alike. Where the code cannot avoid a
library's or a protocol's sense of a word, the entry's last sentence names that sense and the
form that tells it apart: a capital (Run), a qualifier (a queue message, a language model), code
font (`queued`) or the library's own name (`Effect.retry`). The `_Avoid_` lists name the banned
synonyms, a parenthesis the sense such a word keeps elsewhere. The verbs a name opens with and the
file suffixes: [naming.md](../../.claude/rules/naming.md); the rings, folders and imports:
[architecture.md](architecture.md); why each boundary holds: [decisions.md](decisions.md).

## Chat

**User**:
An anonymous browser the api recognises by a secret it issued on first contact; the owner of chats.
Not an account: there is nothing to sign in to. Not the person who works on this repository,
whom the toolkit calls the owner, nor a database role (`username`). Its model and id are the
`user` module's; recognising it is `identity`'s.
_Avoid_: Visitor, account, anonymous user, device, session

**User secret**:
The credential the api issues to a user on first contact and recognises them by afterwards. Only
the user's browser holds it. Not a secret of the deployment (Pulumi's passphrase, a CI secret,
AWS's `secretAccessKey`), which keeps its tool's name.
_Avoid_: Token, session id, api key, cookie (the cookie carries it; it is not the secret)

**Identity**:
Who a request's credential says its sender is, in two names. `IdentityClaims` is the value, a
schema of the identity module (`{ userId }`): what the credential claims, today a user's id, later
a token's claims; `IdentityService` answers it, `POST /identity` responds with it and
`GET /identity` reads it. `Identity` is the API contract's key under which `IdentityMiddleware`
provides the request's claims to the handlers (`yield* Identity`). Not the `User`, the user's whole
record, which extends the claims. The `identity` module recognises a user by their user secret:
`IdentityService.recognise` answers the claims of the user a known secret names, or of a new user
with a new secret; `authenticate` answers the claims or fails `IdentityUnknownError` on a secret
it does not know.
_Avoid_: Current user, principal, login, session, auth (the api's middleware is
`IdentityMiddleware`), `RequestIdentity` (reads as a request for an identity), payload (a record's
stored bytes, or a request's body)

**Chat**:
The ordered messages between one user and the assistant, with an optional title. While the chat
has an active Run, the user cannot ask it again. Once its context is cut it holds where the
context starts and a summary of the messages before.
_Avoid_: Conversation, thread, dialogue, session (an agent's session in the toolkit)

**History**:
Every finished message of a chat, oldest first, as the database holds them and the chat's list
shows them.
_Avoid_: Context (below), log, transcript

**Context**:
What a chat's reply sends the language model: the chat's messages from a stored head, which a
cut moves to a later message once the last prompt and its reply pass a share of the tokens
limit, opened by the summary the cut wrote of the messages before it. Its rules are
`ChatContextPolicy` and `ChatContextTokenizer`; the model's context window is written whole. Not
Effect's `Context` module (`Context.Service`), which every service file imports.
_Avoid_: History (above), window (the model's), prompt

**Message**:
What the user or the assistant says once in a chat: finished text, and no status. A user's
message is stored when the user asks; an assistant's message is written by the Run that answers,
once it is done, and the Run names it. Not a queue message, an error's or a log line's
`message`, nor a provider's message (`Prompt.MessageEncoded`, Anthropic's Messages API), each
written with its qualifier or its library's name.
_Avoid_: Prompt, completion, turn

**Ask**:
What the user does to a chat: their message stored with a queued Run, then its event sent
(`UserMessageCreated`), which the reply hears, and a new chat's `ChatInitialized`
(`POST /chats/:chatId/messages`, `askChat`). A chat no ask has
reached is new and `idle`; asking a `queued` chat is refused as busy. The same verb names a Run
asking the assistant for its reply and the assistant asking the language model (`LlmCall.ask`): one
act, asking for an answer. Never an event put on its queue, which is a send.
_Avoid_: Send (an event's, below), submit, post

**Run**:
The work of answering one user message: its status, its failure and, once done, its usage (the
model that answered, the tokens of the prompt and of the reply, and how many of the prompt's the
cache served and stored). An ask creates one, queued; the worker starts it (`generating`) and,
once it is done, writes the assistant's message.
Capitalised in prose; in code `Run`, and `run` or `runs` for a value or the table. Not the verb
*run* (Effect's `run*`, `Transaction`'s `run`, a test that runs), which never takes a Run as its
object; *a run* as a noun only qualified (a test run, a dry run).
_Avoid_: Job (a queue message that hands the worker work), task, attempt

**Retry**:
A new Run of the message a failed Run answered, which the user asks for (`POST
/chats/:chatId/runs`, `AskChatService.retry`), its event `MessageRetried`; only a chat's newest
Run, once failed, can be retried (`RunPolicy.ensureRetryable`, `RunNotRetryableError`). Not a
call repeated after its failure (`Effect.retry`, a `Schedule`, a provider's `retryAfter`), which
is written with the call it repeats (*the model call's retries*,
`PostgresConnection.retryWhileUnreachable`) and never alone.
_Avoid_: Rerun, resend, regenerate

**Reply**:
What the assistant answers to a user's message: the text a Run asks the assistant for and, once
the Run is done, the assistant's message that holds it. Never the Run, which is the work.
_Avoid_: Response (an HTTP response keeps the word), completion

**Run status**:
Where a Run is, as `runs` stores it: `queued` (the chat has asked for it), `generating` (the
assistant reads the chat and writes; the text appears whole when it is done), `done`, or
`failed` (the assistant gave up or declined; the Run keeps the full text of what ended it, off
the wire). The last two are terminal: a Run in either is settled.
_Avoid_: Stage (a deployment's name, [aws.md](aws.md#the-inventory)), state, completed, in-progress,
pending, streaming

**Active Run**:
A Run that is not yet terminal (`queued` or `generating`). A chat has at most one. A read of a
user message's active Run, in its chat and of its user, that finds none (its Run done, failed or
gone with its chat) fails `RunNotFoundError` by that message.
_Avoid_: Pending run, current reply

**Chat state**:
What the chat's newest Run makes of it (`ChatState.build`): `queued` while that Run is active,
`failed` after it failed, else `idle`, also before the first ask. Read with the chat, never
stored; the wire's `state` of a chat. Asking a `queued` chat is refused as busy
(`ChatBusyError`). A value is written in code font, or as a word before chat (a failed chat).
_Avoid_: Busy as a state, chat status; a Run's status (`generating`)

**Title**:
The few words that stand for a chat in the user's chat list. The assistant proposes them from
the first message unless the user has already set a title; a user's title is never overwritten.
Not a PR's title, written *a PR's title*.
_Avoid_: Name, subject, summary

**Assistant**:
The language-model side of a chat, as the user sees it. The language model behind it is a
provider's artefact and is named only at the boundary.
_Avoid_: Bot, AI (`effect/ai` keeps it), agent (a Claude Code agent of the toolkit), model

## Architecture language

The words the rings, layers, rules and tickets use for the shape of the code. The rings and which
folder holds what: [architecture.md › The three rings](architecture.md#the-three-rings). Each
word has the senses its entry gives; the `_Avoid_` lists name the synonyms the sources use that we
do not.

**Part**:
A folder other code reaches only through its entry: a module, the use cases, a
folder of the kernel (`kernel/<part>`) or a package. It reaches its own files through
`#<part>/…`, the kernel's through `#kernel/<part>/…`, and its test support through
`#testing/<part>/…`.
_Avoid_: Unit (the code a change composes, below), slice, component

**Entry**:
A part's `index.ts`, published as `@app-template/<folder>` and, for its test support,
`<folder>/testing` and `<folder>/testing/e2e`; a kernel part may also publish one file straight
as a sub-path, `@app-template/kernel/<part>/<role>`, which loads none of the part's clients. Not
a process's `main.ts`, its *main*.
_Avoid_: Barrel, entry point, public API

**Unit**:
A piece of code with one purpose that a change edits or composes: a model's function, a domain
service, a util or a use case ([composition.md](../../.claude/rules/composition.md)). A *unit
test* is its own term.
_Avoid_: Part (a folder others import), component, building block

**Contract**:
What a caller may depend on of a unit or a part: its names, types, errors and wire shapes. A
module's is its module contract, the api's its API contract.
_Avoid_: Interface (TypeScript's `interface` keeps it), API

**Record**:
One stored instance of a model: a row of its table, or an object in the bucket with its metadata,
read and written as its entity. Not an entry of `decisions.md`, which is a decision; not SQS's
record (`SqsRecord`, an `SqsEvent`'s `Records`), written *SQS record*; not a fake that keeps the
calls it takes (`record<Thing>()`); TypeScript's `Record` is the library's.
_Avoid_: Document, item, row (its table's encoded form)

**Store**:
Where records live outside the process: Postgres, or the bucket. The data layer holds one
repository per store's kind of record (`ChatRepository` over `Db`, `FileRepository` over
`S3Bucket`).
_Avoid_: Database (for the bucket), storage, persistence

**Entity**:
A record as the data layer reads and writes it, derived from its table in the data layer's own
types (`ChatEntity`, with its `Where` and `Set`): the one shape every read of its store
returns, nesting a neighbour's `<Name>Columns` one level deep. Where a read's shape differs, a
static of a group in the entity file builds the entity from the read. Never a model; it is a
model's encoded side, which the model decodes.
_Avoid_: Model, row type, record class, DTO

**Data layer**:
The ring at the centre, `kernel/data`: every store's records, in entities. It holds no rule and
knows no module; every module reads and writes it.
_Avoid_: Persistence layer, DAL, repository layer, shared domain

**Application**:
The ring of the behaviour, under `application/`: the modules and, above them, the use cases that
compose them. It holds every business rule; the data layer stores what it
decides, the boundary connects it to the world, and the apps run it. Not the whole template,
which is *the template*.
_Avoid_: Application layer, app (a process under `apps/`), business layer

**Module**:
A business capability whose mission fits one sentence, a folder of `application/` with one
entry, `@app-template/application/<module>`. Its records live in the data layer. Never one per
table or per aggregate. Not an Effect module (`Array`, `Schema`), written *an Effect module*.
_Avoid_: Component, core, slice, feature folder, bounded context, service

**Layer**:
Effect's `Layer`, the value that builds a service over its dependencies, always in code font or
a `layer…` name (`<Service>.layer`, `layerChatTest`). A module's folders `domain/`, `services/`
and `infrastructure/` are *a module's layers*, always with the module named
([A module's layers](decisions.md#a-modules-layers)); the data layer is a ring.
_Avoid_: Tier, level

**Module contract**:
The part of a module other modules may depend on, an entry of its own,
`@app-template/application/<module>/contract` (`contract/index.ts`), which exports by name, from
the module's `domain/` files, the ids, models, errors and the group a wire shape reads
(`ChatState`) that readers outside the module take, and so loads no service, store or kernel file.
_Avoid_: Public API, interface, SDK, client

**API contract**:
The api's HTTP surface: the one `Api` of groups `application/http-api` declares from the domain's
schemas, taken through the module contracts, and the OpenAPI document the api writes from it,
`apps/api/openapi.json`, from which the web's client is generated. Never a module contract.
_Avoid_: DTO layer, SDK, wire schemas, shared domain

**Use case**:
One scenario that composes domain services and model rules over modules, their writes in one
transaction; what a handler calls when a flow is more than one service method and
no one service owns it ([which flow](../../.claude/rules/layering.md#use-cases)). It holds only its
flow, the order of the calls, the transaction, what it skips and logs; each module's rules, records,
jobs and events stay in its models and services, and an order over one module's services is that
module's `<Verb><Model>Service`.
_Avoid_: Interactor, orchestrator, workflow, application service, job

**Boundary**:
The outer ring, everything that touches the world outside the process.
_Avoid_: Edge, shell, outer layer, infrastructure layer

**Aggregate**:
The models whose records change together under one invariant: a chat with its messages, a
user. Each model of it has its own domain services: `<Model>Service` and those composed over it.
_Avoid_: Entity group, root, aggregate root

**Model**:
The class of a domain concept as its module sees it, with its pure operations (`Chat`,
`Message`): a stored record's is a `Model.Class`, one no store holds a `Schema.Class`
(`IdentityClaims`). A stored model's encoded side is the row of its one store (`null`, a `Date`); the
rules read its type side only. Its variants are the shapes one field list gives each use: the
class what a read decodes, `insert` and `update` what a write encodes, `json` what the api
serves; a record read with it from another table is a field of the class alone
(`Chat.run: Option<Run>`). Not
the language model, which keeps both words in prose and is `LanguageModel` or `llm…` in code
(`LlmError`, `llmModels`).
_Avoid_: Entity, DTO, row

**Rule**:
A business rule: a pure function over values passed in, a static of its model's group of its
kind (a Policy, a Move, a State), in a file of its own beside the model (`run-policy.ts`); a
service, a use case or a repository reads, calls it and writes. Not a lint rule, written *lint
rule*, nor a file of `.claude/rules/`, the toolkit's rule.
_Avoid_: validator, business logic

**State**:
What a record's values say of it, derived and never stored: a static of `<Model>State`
(`ChatState.build`, `RunState.isActive`). A status is what a record stores (`Run.status`); a
chat has a state, a Run a status. Not an HTTP status (`{ httpApiStatus: 404 }`), written *HTTP
status*, nor the health check's `status: 'ok'` on the wire, nor a tool's (`git status`).
_Avoid_: Status for a derived value, stage

**Policy**:
A model's checks before a write, `<Model>Policy`, each an `ensure<Rule>` that fails with a
refusal or passes, returning nothing (`ChatPolicy.ensureNotBusy`); a check that returns its record
is generic over it (`RunPolicy.ensureUnstarted`). Not the language model's call policy
(`LlmCall`, its retries and finish reasons), nor SQS's `RedrivePolicy`.
_Avoid_: Guard (a check by configuration), validator

**Move**:
A record's change of status to an allowed next one: a pure transition, a static of the model's
`<Model>Move` named for the act (`RunMove.start`, `RunMove.complete`, `RunMove.fail`), which
`<Model>Service.update` writes under the status the record was read in
(`runs.update(run, yield* RunMove.start(run))`). A move the table of `<Model>Move` refuses dies
(`RunStatusInvalidError`).
_Avoid_: Transition (the move's pure half), state change

**Refusal**:
A typed failure the user can reach, from a check before a write, failing an error of its own
(`ChatBusyError`, `RunNotRetryableError`). Not a store's or a write guard's refusal, which dies;
not SQS's (*a refused send*) nor the language model's (*the model's refusal*); a check that
rejects code *fails*.
_Avoid_: Rejection, denial

**Guard**:
A check by configuration that refuses code: `exports`, the isolated linker, `tsc -b` and Biome
with its GritQL plugin ([decisions.md](decisions.md#guards-are-configuration)).
The condition a write carries is a *write guard* ([database.md](database.md#guards)).
_Avoid_: Fitness test, architecture test

**Util**:
A pure function with no domain meaning, generic over its types, in the `<model>.util.ts` of the
model whose code calls it, beside that model's branded id: it names no model, error or word of
this glossary, so a refusal it raises comes from its caller. A function that names a word of
this glossary, a refusal or a move is a model's, however short.
_Avoid_: Helper, lib, common, shared

**Port**:
A contract the domain declares for what it needs from outside the process, in the domain's
words, with no layer of its own, for a need with several implementations or a domain service
that reaches out; a store's repository is the data layer's, and a service in `infrastructure/`
with one implementation (the assistants) is its own contract, so neither is a port. Not a TCP
port, which the code names for its process (`apiPort`, `API_PORT`) or by its library
(`Config.Port`, `url.port`) and prose calls *a TCP port*.
_Avoid_: Interface, client, gateway, driver, store

**Adapter**:
An implementation of a port over a client, in a module's `infrastructure/`; none stands
today, as the assistants are services of their own (`MessageAssistant`, `ChatAssistant`).
_Avoid_: Implementation, provider, DAO, store

**Domain service**:
The owner of one model's rules, or of one operation that belongs to no model: every write a rule
guards goes through it. A model starts with `<Model>Service` over its repository; a purpose past it
is a service composed over it, named for what it adds (`File<Model>Service`). The last grouping
of a module's logic before a handler or use case is a `<Verb><Model>Service` (`AskChatService`,
`ReplyChatService`, `TitleChatService`): its role in
[layering.md](../../.claude/rules/layering.md#ports-and-domain-services), its form in
[naming.md](../../.claude/rules/naming.md#symbols).
_Avoid_: Manager, helper, application service, business logic, service layer

**Composition**:
How the code grows: a change edits a unit only to fix it or extend the purpose it was made for; any
other change is a new unit that wraps it (the same interface, for every holder) or composes it
(a new name built from it, for the callers that need what it adds), for models, services, utils
and use cases alike. Decision:
[Composition: wrap or compose](decisions.md#composition-wrap-or-compose).
_Avoid_: Layering (an Effect `Layer` is the wiring, not the unit), inheritance, decoration

**Handler**:
The function that serves one request or one queue message in an app: an HTTP group's
(`<Name>Handler`) or, in the worker, a job's or an event's listener's (`<Name>Handler.<work>`),
which ends its work in one tail; a queue lists its handlers, and each runs on every message of
it. Not a Lambda's `handler` setting, AWS's field.
_Avoid_: Controller, consumer (the function that runs a queue's handlers), processor, endpoint

**Kernel**:
The workspace `kernel/`: the data layer at its centre, and around it the tools of `packages/*`
configured for this app. It holds no business rule and knows no module.
_Avoid_: Shared kernel, common, core, shared, utils, platform

**Package**:
A folder under `packages/`, imported as `@app-template/packages/<name>`: a tool configured by
its caller that knows no app, so it would work in another project unchanged; the kernel
configures it for this one. Not an npm package, written *a dependency* or *an npm package*.
_Avoid_: Library (for a workspace), lib, helper, kernel

## Queues

The words of the work the api hands to the worker. The queues, the stand and its stages:
[aws.md](aws.md).

**Job**:
A queue message that hands one handler in the worker one piece of work, a command, shaped by its
queue definition and named `<Verb><Object>` in this glossary's words for that work
(`ShipOrder`). Unheard, its work stays undone, so its sender settles a refused send. The chat
sends none: the owner made each of its queue messages an event, the reply's two included, whose
sender settles a refused send all the same. Not a CI job (a workflow's `jobs:`).
_Avoid_: Task, message (the chat's word)

**Event**:
A queue message that states a fact a module's commit made true, named `<Object><PastVerb>`
(`UserMessageCreated` and `MessageRetried`, which name the user's message, its chat and its user,
and which the reply hears; `ChatInitialized`, below): a list of listeners, any module's handlers
in the worker, each ending alone, none required but the reply, as the sender of its two events
fails the Run on a refused send. Not a job, a command with one handler whose sender settles its
refused send; not SQS's event (`SqsEvent`), the batch the worker is posted.
_Avoid_: Notification, signal, message (the chat's word)

**Initialized**:
Of a chat: it got its first user message (`ChatInitialized`, which names that message, its chat and
its user, and which the title hears). Not the chat's creation, which stores no message.
_Avoid_: Started, first message created

**Queue message**:
A message on a queue as `packages/aws/queue` sends and consumes it: a body its definition's schema
encodes, with the sender's `traceparent`. Every job and event is one; SQS's own names stay
(`MessageBody`, `messageId`, `messageAttributes`), and a log names its id `queueMessageId`.
_Avoid_: Message (the chat's word), envelope

**Send**:
A job or an event put on its queue after the commit of what it reads: `<Model>Queue.send<Name>`
in its module's `<model>.queue` file, over `QueueSender.send`, which encodes it by its definition
and carries the current trace. A send SQS refuses is logged, and fails the Run whose reply the
event asks for (`UserMessageCreated`, `MessageRetried`).
_Avoid_: Publish, enqueue, dispatch, ask (the user's act)

**Handling**:
The worker's work on one delivery: the queue's handler under the consumer's span. A Run is the
work of answering, whichever handling does it.
_Avoid_: Run (the domain's), execution, processing

## Tests

The words of the tests and their support; where each kind lives:
[tooling.md › Tests](tooling.md#tests).

**Unit test**:
A test over mocks of the repositories and fakes of the other leaves (the assistants, the queue's
sender, the files), needing no process outside the test runner.
_Avoid_: Fast test, isolated test, mock test

**E2E test**:
A test over the containers its test run starts (Postgres, MiniStack).
_Avoid_: Integration test, system test, functional test

**Leaf**:
A service of this app with none of this app's below it, which reaches outside the process: a
repository, an assistant, the queue's sender, the transaction. A unit test replaces only leaves.
_Avoid_: Edge, terminal service

**Fake**:
The test implementation of a leaf in a `.test-fake.ts`, over a `Ref`, one per service, keeping
the whole promise of what it stands for (`FileRepositoryTest`); one that also keeps the calls it
takes is built by `record<Thing>()` and returns `{ <handle>, layer }` (`recordMessageAssistant`).
Fowler's *fake*, or his *spy* when it records.
_Avoid_: Memory layer, stub, in-memory repository, double (for one of these)

**Mock**:
A `Layer.mock` of a repository in a unit test, implementing only the methods the test gives; any
other call dies with `UnimplementedError`. Fowler would call it a stub; the name is Effect's.
_Avoid_: Stub, memory repository

## Observability

The words of the telemetry the `api` and the `worker` emit about themselves.

**Telemetry**:
The traces, logs and metrics the processes emit about themselves; each one exported carries the
process's name.
_Avoid_: Monitoring data, diagnostics, instrumentation

**Trace**:
The tree of spans that follows one request in the `api`, or one queue message's handling in the
`worker`; one trace id joins them.
_Avoid_: Request log, transaction, flow

**Span**:
One timed step in a trace, such as a request, a service call, a database statement or a
language-model call.
_Avoid_: Segment, step, event

**Telemetry backend**:
The service that receives telemetry and shows it; locally a container `make up` starts beside the
others, elsewhere whatever the environment names.
_Avoid_: Collector (it is one part), monitoring tool, APM
