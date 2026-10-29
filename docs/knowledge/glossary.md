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
moves through the message stages.
_Avoid_: Prompt, reply, completion, turn

**Message stage**:
Where an assistant message is in its life: `queued` (the chat has asked for it), `preparing`
(the assistant is reading the chat), `generating` (the assistant is writing; the text grows),
`completed`, or `failed` (the assistant gave up; the message carries a reason). The last two are
terminal.
_Avoid_: State, status, in-progress, pending, streaming

**Active message**:
The assistant message of a chat that is not yet terminal (`queued`, `preparing` or `generating`).
A chat has at most one; the chat has no state of its own beyond it.
_Avoid_: Chat status, pending message, current reply

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
The language-model side of a chat, as the user sees it. The model behind it is a provider's
artefact and is named only in `infrastructure`.
_Avoid_: Bot, AI, agent, model

## Architecture language

The words the layers, rules and tickets use for the shape of the code. Each has one meaning here;
the `_Avoid_` lists name the synonyms the sources use that we do not.

**Component**:
A folder named for one aggregate (`chat`, `attachment`, `user`) that appears under the same name
in every layer; its responsibility fits one sentence.
_Avoid_: Module, slice, feature folder, bounded context

**Aggregate**:
The entities whose records change together under one invariant: a chat with its messages, an
attachment, a user. Each entity of it has its own domain service.
_Avoid_: Entity group, root, aggregate root

**Model**:
The `Schema.Class` of an entity as the domain sees it (`Chat`, `Message`).
_Avoid_: Entity (for the class), DTO, row

**Read model**:
A shape a port answers for a reader, composed of models (`ChatSummary`, `MessageDetail`); nothing
writes one.
_Avoid_: View, projection, DTO

**Port**:
A contract the domain declares for what it needs from outside the process (a repository, the
bucket, the assistant), in the domain's words, with no layer of its own.
_Avoid_: Interface, client, gateway, driver, store

**Adapter**:
An implementation of a port over a client, in `infrastructure`: a repository
(`ChatRepositoryPg`), the bucket (`AttachmentBucketS3`), the assistant (`AssistantLlm`).
_Avoid_: Implementation, provider, DAO, store

**Domain service**:
The owner of one entity's rules and the only writer of its records; it reads its ports, the clock
and the id generator, and nothing else. It is named by its entity (`ChatService`); one that holds
a single operation belonging to no entity is named by that operation, without `Service`
(`FundsTransfer`).
_Avoid_: Manager, helper, application service, business logic, service layer

**Use case**:
One scenario that composes domain services with the bucket, the queue, the assistant or one
transaction; what a handler calls when a flow is more than one service method.
_Avoid_: Interactor, orchestrator, workflow, application service, job

**Handler**:
The entry point of one request or one job in an app: it decodes the input, calls one use case or
one domain service method and shapes the outcome; it holds no rule.
_Avoid_: Controller, consumer, processor, endpoint

**Relay**:
An infrastructure layer that moves records from the database to a queue and holds no rule
(`OutboxRelay`).
_Avoid_: Dispatcher, publisher, poller

**Outbox**:
The table a use case writes its jobs to, in the transaction of the records they read; the relay
sends them.
_Avoid_: Event table, queue table

**Job**:
A message on a queue that asks the worker for one unit of work, shaped by its queue definition.
_Avoid_: Task, event, command, message (the chat's word)

**Unit test**:
A test of one module over memory layers of its ports, needing no process outside the test runner.
_Avoid_: Fast test, isolated test, mock test

**E2E test**:
A test over the containers the run starts (Postgres, MiniStack): of an adapter, of the transaction
a use case runs, or of the journey through both apps.
_Avoid_: Integration test, system test, functional test

**Memory layer**:
A layer of a port over a `Ref<HashMap>` in `domain/testing`, one per port, keeping the guards the
database adds; the unit tests' only double of a port.
_Avoid_: Mock, stub, in-memory repository
