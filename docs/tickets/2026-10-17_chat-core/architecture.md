# Chat core — architecture

> Ticket: `2026-10-17_chat-core` · Requirements: [feature.md](./feature.md)

## Overview

Three aggregates (`user`, `chat` with its messages, `attachment`) cross the four layers. The api
authenticates a user by a cookie-borne secret, writes the user's message and a `queued`
assistant message, enqueues two jobs and returns `202`; the worker takes the jobs, streams the
model into throttled snapshots of the assistant message and writes the title; the client polls.
Both processes share one `KeyValueStore`: memory in tests, a file on disk in dev, Postgres later.

```mermaid
sequenceDiagram
  participant W as web (api-client)
  participant A as apps/api
  participant S as KeyValueStore
  participant Q as queue (send · worker)
  participant K as apps/worker
  participant M as LanguageModel
  W->>A: POST /chats/:id/messages {text, attachmentIds}
  A->>S: user message (completed) · assistant message (queued) · bind attachments · index
  A->>Q: GenerateAssistantMessage · GenerateChatTitle (first message only), ids only
  A-->>W: 202 {userMessage, assistantMessage}
  K->>Q: take
  K->>S: stage = preparing · read chat, messages, attachment bytes
  K->>M: streamText(prompt)
  loop every snapshotInterval while dirty
    K->>S: stage = generating, text = accumulated
  end
  K->>S: stage = completed, final text
  loop poll
    W->>A: GET /chats/:id/messages/:mid
    A->>S: read message
  end
```

Dependencies, bottom-up: `domain` holds the schemas, errors, ports and pure rules;
`infrastructure` implements the ports on `KeyValueStore` through one collection-and-index module,
defines the two queues and the model adapter; `application` holds the three services and the two
jobs; `packages/api-contract` is the `HttpApi` with its security middleware declarations;
`packages/api-client` is the `Promise<Result>` facade; `apps/api` and `apps/worker` are
composition roots.

## Structure

New files are marked `+`, removed `−`, changed `~`. Every entity folder keeps an `index.ts`.

### domain

```
+ domain/user/user.id.ts             UserId
+ domain/user/user.model.ts          User · SecretHash · Credential
+ domain/user/user.error.ts          UserUnknownError
+ domain/user/user.service.ts        UserRepository · buildUser
+ domain/chat/chat.id.ts             ChatId · MessageId
+ domain/chat/chat.model.ts          maxTitleLength · ChatTitle · Chat · MessageAuthor ·
                                     MessageStage · ActiveMessageStage · MessageFailure · Message
+ domain/chat/chat.error.ts          ChatNotFoundError · ChatBusyError · MessageNotFoundError ·
                                     MessageInputInvalidError · MessageStageInvalidError
+ domain/chat/chat.service.ts        ChatRepository · MessageRepository · buildChat · buildUserMessage ·
                                     buildAssistantMessage · isTitledChat · isActiveMessage ·
                                     ensureMessageInput · ensureChatAcceptsMessage ·
                                     prepareMessage · generateMessage · completeMessage ·
                                     failMessage
+ domain/attachment/attachment.id.ts       AttachmentId
+ domain/attachment/attachment.model.ts    FileName · MediaType · FileSize · Attachment
+ domain/attachment/attachment.error.ts    AttachmentNotFoundError · AttachmentBoundError
+ domain/attachment/attachment.service.ts  AttachmentRepository · AttachmentStore · buildAttachment ·
                                           ensureBindable
− domain/example/*
~ domain/package.json                exports ./user ./chat ./attachment
```

Each `*.model.ts` and `*.service.ts` has its `*.test.ts` beside it. Ids live in `<aggregate>.id.ts`,
the only file another aggregate's model imports; Biome's `noImportCycles` keeps it so (D20).

### infrastructure

```
+ infrastructure/kv/kv-collection.ts         createCollection · createIndex · createBlobs  (D2)
+ infrastructure/kv/kv-store.ts              KeyValueStoreFileSystem (bundles StoreConfig)   (D4)
~ infrastructure/shared/queue.client.ts      unchanged
+ infrastructure/user/user.repository.ts     UserRepositoryKv
+ infrastructure/chat/chat.repository.ts     ChatRepositoryKv
+ infrastructure/chat/message.repository.ts  MessageRepositoryKv
+ infrastructure/chat/chat.queue.ts          assistantMessageQueue · chatTitleQueue · their message schemas
+ infrastructure/chat/chat.llm.ts            buildChatPrompt · streamAssistantText · suggestChatTitle
+ infrastructure/attachment/attachment.repository.ts  AttachmentRepositoryKv
+ infrastructure/attachment/attachment.storage.ts     AttachmentStoreKv
− infrastructure/example/*  − infrastructure/shared/outbox.repository.ts
```

*Amended in S9:* the title adapter is renamed `suggestChatTitle`: the model proposes a title the
job may discard, and the plan's name differed only by case from the job's `GenerateChatTitle`
payload. `maxTitleLength` joins `chat.model.ts` as the one title limit, read by `ChatTitle`,
the prompt and the cut, and `isTitledChat` joins the domain's predicates.

### application

```
+ application/user/user.service.ts           UserService { ensure, authenticate }
+ application/chat/chat.service.ts           ChatService { create, list, get, rename, delete, send, getMessage }
+ application/chat/assistant-message.job.ts  AssistantMessageJob { enqueue } · .worker · SnapshotInterval
+ application/chat/chat-title.job.ts         ChatTitleJob { enqueue } · .worker
+ application/attachment/attachment.service.ts  AttachmentService { upload, get, download, delete }
− application/example/*
```

### packages

```
+ packages/api-contract/                     new workspace @app-template/api-contract (imports only effect)
    index.ts (Api) · limits.ts · schemas.ts · errors.ts · security.ts (Auth, CurrentUser, SchemaErrors) ·
    health.ts · users.ts · chats.ts · attachments.ts · openapi.ts (writer) · openapi.json (committed)
~ packages/api-client/index.ts               createApiClient over HttpApiClient + FetchHttpClient (D13)
~ packages/queue/queue.ts                    send · worker Layer · jobId · AttemptInfo (D3, D21)
~ packages/llm/client.ts                     stub streams ~20 words at 100 ms; generateText returns a title
~ packages/config/config.ts                  + StoreConfig { path } from STORE_PATH
− packages/db  − packages/storage
```

### apps

```
~ apps/api/src/main.ts                       BunRuntime.runMain(Layer.launch(ApiLayer))
+ apps/api/src/layer.ts                      HttpApiBuilder.layer(Api) + groups + Scalar + HttpRouter.serve + BunHttpServer
+ apps/api/src/current-user.ts               AuthLive (cookie → CurrentUser) · SchemaErrorsLive
+ apps/api/src/{health,users,chats,attachments}.handler.ts
~ apps/api/src/http.test.ts                  round trips through api-client with a cookie jar (seam 7)
− apps/api/src/http.ts
~ apps/worker/src/main.ts                    BunRuntime.runMain(Layer.launch(WorkerLayer))
+ apps/worker/src/layer.ts                   AssistantMessageJob.worker + ChatTitleJob.worker + leaves
~ apps/web/src/features/health/health-panel.ts   moved from features/example, on the new client
~ apps/{api,worker}/package.json             + @effect/platform-bun, + @app-template/api-contract; api dev: api-client
```

### root, rules and docs

```
~ tsconfig.json          − packages/db, packages/storage; + packages/api-contract
~ Makefile               + openapi target; check runs it and `git diff --exit-code packages/api-contract/openapi.json`
~ .env.example           + STORE_PATH="../../.data/store"
+ .claude/rules/effect.md
~ .claude/rules/naming.md       + `.job` role (application), `.llm` holds prompt functions
~ docs/knowledge/architecture.md  "Where things live" and "Add a new entity" on the chat slice
```

## Contracts

### Domain shapes

```ts
UserId · ChatId · MessageId · AttachmentId
            = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('<Entity>Id'))
SecretHash  = lower-case hex SHA-256, brand 'SecretHash'
Credential  = { kind: 'secret', hash: SecretHash }
User        = { id, createdAt }
ChatTitle   = Schema.String.check(trimmed, nonEmpty, maxLength(120))
Chat        = { id, userId, title: Option<ChatTitle>, createdAt, updatedAt }
MessageAuthor = 'user' | 'assistant'
MessageStage  = 'queued' | 'preparing' | 'generating' | 'completed' | 'failed'
ActiveMessageStage = MessageStage.pick(['queued', 'preparing', 'generating'])
MessageFailure = { reason: 'ReplyFailed', message: string, cause: string }
                 // message: user-safe, fixed per reason · cause: for operators, never leaves the api
Message     = { id, chatId, author, stage, text, attachmentIds, error: Option<MessageFailure>,
                createdAt, updatedAt }
FileName · MediaType · FileSize = brands: non-empty · type/subtype · Int ≥ 0
Attachment  = { id, userId, messageId: Option<MessageId>, fileName: FileName,
                mediaType: MediaType, size: FileSize, createdAt }
```

Pure rules: `isActiveMessage(message)` holds for an assistant message in `queued`, `preparing` or
`generating`; `ensureChatAcceptsMessage(current: Option<Message>)` fails `ChatBusyError` (with
the message's `chatId`) when the chat's current message is active, whatever message the caller
passes; `ensureMessageInput({ text, attachmentIds })` fails `MessageInputInvalidError` when the
trimmed text is empty and no attachment is given;
`ensureBindable(id, found: Option<Attachment>, userId)` returns the attachment, or fails
`AttachmentNotFoundError` when it is missing or foreign and `AttachmentBoundError` when it is
bound; `send` traverses the ids with `Effect.forEach` over `selectById`; `isActiveMessage` checks the stage with
`Schema.is(ActiveMessageStage)`.

Transitions are named for the stage they move to, check their source stage, and fail
`MessageStageInvalidError { id, from, to }` otherwise (D18):

| Transition | From | Sets |
|---|---|---|
| `prepareMessage(message, at)` | any active stage | `preparing`, empty text, no error |
| `generateMessage(message, at)` | `preparing` | `generating` |
| `completeMessage(message, text, at)` | any active stage | `completed`, final text, no error |
| `failMessage(message, reason, cause, at)` | any active stage | `failed`, the reason's fixed sentence and the cause |

### Ports (domain, `Context.Service`, no layer)

```ts
UserRepository       { insert(user, credential); selectById(id); selectByCredential(credential) }
ChatRepository       { insert(chat); update(chat); selectById(id); selectByUser(userId);
                       delete(id) }
MessageRepository    { insert(message); update(message); selectById(id); selectByChat(chatId);
                       selectActiveByChat(chatId); deleteByChat(chatId) }
AttachmentRepository { insert(a); update(a); selectById(id); selectByIds(ids); deleteByIds(ids) }
AttachmentStore      { insert(id, bytes: Uint8Array); select(id): Option<Uint8Array>; delete(id) }
```

Every `select*` returns `Option` or an array in insertion order; none throws a not-found error:
the application turns `Option.none` into the domain error, so the HTTP layer sees one error type
per case. `selectByUser` returns chats unordered; `ChatService.list` sorts by `updatedAt`.
`selectActiveByChat` returns the chat's active message, if any (`isActiveMessage`); the
application assembles `{ chat, activeMessage }` for the chat list and detail. Ports declare no
error channel: a store failure is a defect (D17).

### Store layout (`KeyValueStore`, D2)

| Key | Value | Written by |
|---|---|---|
| `users/<userId>` | `User` | api |
| `credentials/secret/<sha256-hex>` | `UserId` | api |
| `chats/<chatId>` | `Chat` | api (create, rename, send, delete) · worker (title, `updatedAt` at completion) |
| `users/<userId>/chats` | `ChatId[]` index | api only |
| `messages/<messageId>` | `Message` | api (insert, `deleteByChat`) · worker (stages, snapshots): two writers, see Risks |
| `chats/<chatId>/messages` | `MessageId[]` index | api only |
| `attachments/<attachmentId>` | `Attachment` | api |
| `attachments/<attachmentId>/bytes` | `Uint8Array` | api |

`createCollection(store, { prefix, schema })` gives `get / set / modify / delete` over
`prefix(store, …)` + `toSchemaStore`; `createIndex(store, { prefix, id })` gives
`append / remove / list / delete` on a JSON array. Every operation of the module, collection and
index alike, runs under one per-process `Semaphore(1)`: `KeyValueStore.modify` is get-then-set and
skips a missing key, the file store writes non-atomically, and a plain `set` must not race a
`modify` on the same key. *Amended in S4:* collections gain `update(key, f)`, which reads and writes
under one permit only when the key exists (`none` and no write otherwise), so a port's `update`
never creates a record; `createBlobs(store, { prefix })` gives `get / set / delete` of raw bytes
over `getUint8Array` and `set(key, Uint8Array)`, under the same lock and defect policy, so
`attachments/<id>/bytes` holds the file's bytes, not base64 JSON. *Amended in S5:* collections
gain `getMany(keys)`, which reads every key under one permit, in the order asked, leaving missing
keys out; the repositories' list reads (`selectByUser`, `selectByChat`, `selectByIds`) use it.

### Jobs (`packages/queue` definitions in `infrastructure/chat/chat.queue.ts`)

```ts
GenerateAssistantMessage = { chatId, messageId }   // queue 'assistant-message', job id messageId
GenerateChatTitle        = { chatId, messageId }   // queue 'chat-title', job id chatId
                                                   // messageId: the first user message
AttemptInfo              = { attempt, maxAttempts, isLastAttempt }   // the handler's 2nd argument
```

Each definition carries its `jobId`; a job sends with `send(definition, message)` and consumes
with `worker(definition, handle)`, a Layer (D21). A job id needs no queue prefix: the store keys
uniqueness on `(id, queue_name)`. *Amended in S6.*

### HTTP contract (`@app-template/api-contract`)

| Group · endpoint | Success | Errors |
|---|---|---|
| `health` · `GET /health` | `{ status: 'ok' }` | — |
| `users` · `POST /users` | `201 User` + `Set-Cookie: user_secret` | — |
| `chats` · `POST /chats` | `201 Chat` | `UserUnknown` |
| `chats` · `GET /chats` | `ChatSummary[]` | `UserUnknown` |
| `chats` · `GET /chats/:chatId` | `ChatDetail` (chat + messages with attachment metadata) | `UserUnknown`, `ChatNotFound` |
| `chats` · `PATCH /chats/:chatId` `{ title }` | `Chat` | `UserUnknown`, `ChatNotFound`, `RequestInvalid` |
| `chats` · `DELETE /chats/:chatId` | `204` | `UserUnknown`, `ChatNotFound` |
| `chats` · `POST /chats/:chatId/messages` `{ text, attachmentIds }` | `202 { userMessage, assistantMessage }` | `UserUnknown`, `ChatNotFound`, `ChatBusy`, `AttachmentNotFound`, `AttachmentBound`, `RequestInvalid` |
| `chats` · `GET /chats/:chatId/messages/:messageId` | `Message` | `UserUnknown`, `ChatNotFound`, `MessageNotFound` |
| `attachments` · `POST /attachments` multipart | `201 Attachment[]` | `UserUnknown`, `AttachmentTooLarge` 413, `AttachmentTypeUnsupported` 415, `RequestInvalid` |
| `attachments` · `GET /attachments/:attachmentId` | `Attachment` | `UserUnknown`, `AttachmentNotFound` |
| `attachments` · `GET /attachments/:attachmentId/download` | bytes (`asUint8Array`), real `Content-Type` | `UserUnknown`, `AttachmentNotFound` |
| `attachments` · `DELETE /attachments/:attachmentId` | `204` | `UserUnknown`, `AttachmentNotFound`, `AttachmentBound` |

Errors are `Schema.TaggedError` with `httpApiStatus`: `UserUnknown` 401, `*NotFound` 404,
`ChatBusy` and `AttachmentBound` 409, `RequestInvalid` 400 with
`issues: { path: string[], message: string }[]`. `RequestInvalid` is produced by the
`SchemaErrors` middleware (`HttpApiMiddleware.layerSchemaErrorTransform`) on the whole api, so
every endpoint lists it. `limits.ts` exports `attachment = { maxFileSize: '10 MiB', maxFiles: 5,
mediaTypes: [...] }`, `message = { maxTextLength: 20_000 }`, `chat = { maxTitleLength: 120 }`,
used by the schemas (`maxLength`, `AttachmentMediaType = Schema.Literals(mediaTypes)`), by
`asMultipartStream({ maxParts: maxFiles, maxFileSize })` and by the handlers. `security.ts`
declares `CurrentUser` (`{ id: UserId }`), the `Auth` middleware (`apiKey` in cookie
`user_secret`, `provides: CurrentUser`, `error: UserUnknown`) attached to `chats` and
`attachments`, and `SchemaErrors`. DTOs are the contract's own: `User`, `Chat` (`title: string |
null`), `ChatSummary` (+ `activeMessage: { id, stage } | null`), `ChatDetail` (summary + `messages`), `Message` (`attachments:
Attachment[]`, `error: { reason, message } | null`, never `cause`), `Attachment`. `failMessage` builds the
failure from a reason: the `message` is a fixed user-facing sentence per reason; the provider's
cause is stored beside it for operators (D19). The `rename` payload trims `title` before checking it, so `" Trip"`
is stored as `"Trip"`; the domain's `ChatTitle` itself accepts only trimmed text.

### Client

```ts
createApiClient(baseUrl: string): ApiClient
type ApiClient = { [G in groups]: { [E in endpoints]: (input) => Promise<Result<Success, Error>> } }
type Result<A, E> = { ok: true; value: A } | { ok: false; error: E }
// E = declared errors | RequestInvalid | UserUnknown | HttpClientError | SchemaError (unexpected response), by _tag
```

### Configuration

`StoreConfig { path }` from `STORE_PATH`; `ApiConfig`, `RuntimeConfig`, `QueueConfig` unchanged.
The cookie is `Secure` when `RuntimeConfig.nodeEnv === 'production'`. The snapshot interval is
`SnapshotInterval`, a `Context.Reference<Duration>` in `assistant-message.job.ts`, default 300 ms.

## Seams

| Seam | Catches | Misses |
|---|---|---|
| 1 `domain/*` schemas and pure rules | the active-message predicate, message input rule, binding rules, stage transitions, title constraint | persistence, ordering, HTTP |
| 2 `infrastructure/kv/kv-collection` on `layerMemory` and on `layerFileSystem` in a temp dir | key encoding (`/` in keys), index append, remove and delete, missing-key semantics, JSON codec, lost updates under concurrent `modify` | cross-process races |
| 3 repositories and `AttachmentStoreKv` through their ports on `layerMemory` | field mapping, index maintenance (`selectByUser`, `selectActiveByChat`, `deleteByChat` cascade, `deleteByIds`) | the real file store (covered for the module in 2) |
| 4 `send` and `worker` in `packages/queue` on the memory store under `TestClock` | `AttemptInfo` values per attempt, `isLastAttempt` on the dead-letter attempt and no attempt after it, release when the worker's scope closes, one job per `jobId` | SQLite timing |
| 5 `UserService`, `ChatService`, `AttachmentService` on memory adapters, `QueueClientMemory`, `TestClock`, `TestCrypto` | ensure/authenticate, send writes two messages and enqueues one or two jobs, `409` while a message is active, bound and foreign attachments, rename rules, delete cascade, title job only on the first message | HTTP statuses, cookies |
| 6 `AssistantMessageJob.worker` and `ChatTitleJob.worker` with a fake `LanguageModel` under `TestClock` | stage sequence, snapshot cadence and final write, `failed` only on the last reply attempt (the third of four, D23), prompt content (history, roles, file parts), title only if `none`, chat deleted meanwhile, a blank text or answer (D25) | a real provider, the SQLite queue |
| 7 `apps/api` through `BunHttpServer.layerTest` + `@app-template/api-client` with `HttpClient.withCookiesRef` | the whole wire: cookie attributes, `401`/`404`/`409`/`413`/`415`/`400` bodies, multipart limits, download headers, `202` shape, the `Result` facade mapping, a stopped server → transport tag | browser cookie behaviour, the web proxy, `Secure` on http |
| 8 `make check` drift of `packages/api-contract/openapi.json` | a contract edit without regeneration; the cookie security scheme and every declared error in the spec | semantics |

Dev-mode behaviour (two processes sharing `.data/store`, `--watch`, SIGTERM) is verified by hand
per the acceptance table, not by a test.

## Decisions

- **D1 — Three aggregates, three folders: `user`, `chat` (with `Message`), `attachment`.** A
  message never exists outside its chat and its stages are the chat's state machine, so they share
  a model file and a service file; an attachment lives before it is bound, so it stands alone.
  *Rejected:* one `domain/chat` folder for everything (a 200-line model file and one barrel that
  hides the aggregates); a folder per entity including `message` (splits one state machine over
  two folders and two repositories' tests). *Amended by D20:* ids move to `<aggregate>.id.ts`.
- **D2 — One collection-and-index module over `KeyValueStore`; indexes written by the api only;
  the active message is found by the repository.** `KeyValueStore` cannot list keys and its `modify` is
  get-then-set that skips a missing key, so every repository would repeat the same index code.
  `createCollection`/`createIndex` hide the prefixing, the JSON codec, the missing-key case and the
  per-process `Semaphore`. The worker writes only its own keys (`messages/<id>`, `chats/<id>`), so
  no index is ever written from two processes. The chat has no state word of its own: the
  contract exposes its active message (`{ id, stage }`), so message stages are the one vocabulary
  and the client knows which message to poll. `MessageRepository.selectActiveByChat` finds it;
  the KV adapter reads the last message of the index, which is equivalent because sends are
  refused while a message is active, and Postgres will query `stage IN (…)` on a partial index.
  *Rejected:* an index per repository (four copies); a stored chat status (two keys and no
  transaction: a crash between the message's terminal write and the chat's leaves the chat busy
  forever, and R12 then refuses every send); a derived `Chat.status = idle | generating` (a second
  vocabulary whose `generating` also covered `queued` and `preparing`); `EXISTS … SELECT 1` as a
  boolean port (the client needs the id and the stage). *Amended in S3:* the module is
  `infrastructure/kv/` (`kv-collection.ts`, with the file-store wiring beside it as `kv-store.ts`)
  and is fully serialised per process: every collection and index operation, reads included,
  takes the one `Semaphore(1)`. Its verbs split by what they touch: whole-key `get / set / modify /
  delete`, index-member `append / remove / list`; `delete` matches `naming.md`, and the ports keep
  its `select / insert / update / delete`. *Rejected:* `infrastructure/shared` (a grab bag beside
  the queue wiring, with no entity barrel of its own); `packages/kv` (packages hold no row
  abstraction of ours over `KeyValueStore`, and the module carries project policy: failures die,
  D17).
  *Amended in S4:* the module gains `Collection.update` (writes only an existing key, under one
  permit) and `createBlobs` (raw bytes, same lock and defects). *Rejected:* read-then-`set` in the
  adapter (two permits: a delete between them is undone); `Schema.Uint8Array` in a collection
  (base64 JSON, a third larger); raw `KeyValueStore` calls in the adapter (bypass the lock and
  repeat `Effect.orDie`).
  *Amended in S5:* collections gain `getMany(keys)` (one permit for the whole read, the order
  asked, missing keys left out), replacing three list-then-`get` copies in the adapters. The
  premise "sends are refused while a message is active" is enforced, not assumed: on KV by a
  per-chat lock in `ChatService.send` that makes the check and the inserts one critical section
  in the api process; on Postgres by a partial unique index allowing one active message per chat.
  *Rejected:* a `get` per id (a permit each, so a write lands between reads, and three copies);
  the unlocked check-then-insert (two concurrent sends both see no active message, and the last
  message then hides the other active one from `selectActiveByChat`).
- **D3 — The assistant message is produced by `Ref` + `Schedule.spaced` snapshots with an
  explicit final write, and the handler learns the last attempt from `AttemptInfo`.** The worker
  folds `text-delta` parts into a `Ref` and raises a `dirty` flag; a racing
  `Effect.repeat(snapshot, Schedule.spaced(SnapshotInterval))` writes the accumulated text while
  the flag is up; when the stream ends the job writes `completed` itself, and `onExit` handles the
  failure path. Experiments showed `Stream.throttle('enforce')` drops the final delta,
  `debounce` emits no intermediate state, and `aggregateWithin(Sink.last)` writes twice at the
  window edge. `PersistedQueue.take` exposes `attempts` but not `maxAttempts` and has no
  dead-letter hook, so `JobQueue.consume` now passes `{ attempt, maxAttempts, isLastAttempt }`,
  computed from the same condition the store uses to mark `failed`. *Rejected:* a pure `Stream`
  pipeline (less explicit about the final write); writing `failed` on every attempt (the UI would
  flash `failed` between retries); a dead-letter callback in the store (none exists). *Amended in
  S6:* the handler is the one passed to `worker(definition, handle)` (D21). *Amended in S8a:* the
  `dirty` flag became a comparison: a snapshot writes only when the accumulated text differs
  (`Equal.equals`) from the text it last wrote, so the cadence is the same and a run of empty
  deltas writes nothing. A snapshot runs `uninterruptible`: the race interrupts the snapshot loop
  when the stream ends, and a write cut short then could still land after the final one; the
  race awaits its interrupted loser, so the final write always comes last.
- **D4 — Dev state is `KeyValueStore.layerFileSystem` at `STORE_PATH`, bundled with
  `StoreConfig` in `infrastructure/kv/kv-store.ts`; tests use `layerMemory`.** The two processes
  need one state and the queue already shares `.data/queue.sqlite`. `layerFileSystem` stores
  keys flat with `encodeURIComponent`, needs `FileSystem | Path` (both in `BunHttpServer.layer` and
  `BunServices.layer`), and has no locking: last write wins. D2 keeps every index single-writer;
  only the rows `chats/<id>` (title race) and `messages/<id>` (delete race) are written from both
  processes, see Risks. *Rejected:* `layerSql` over the queue's SQLite file (atomic
  writes and cross-process locking, but a SQL store in the "in-memory" ticket; it remains the
  one-line switch if the file store proves flaky); `layerMemory` in dev (the worker would never see
  the api's writes). *Amended in S3:* the wiring is `infrastructure/kv/kv-store.ts`, beside the
  module (D2); `STORE_PATH` has no default in code and is set in `.env.example`. *Amended in S5:*
  `messages/<id>` has two writers, the api (insert, `deleteByChat`) and the worker (stages,
  snapshots); the earlier wording named `chats/<id>` as the only one.
- **D5 — Limits are constants in `@app-template/api-contract`, and the declared media type is
  checked with a `Schema`.** `asMultipartStream(withLimits)` fixes its limits at schema
  definition, so they cannot be runtime tunables; the contract is browser-safe, so the UI later
  reads the same `limits`. The type check decodes each part's `contentType` with
  `AttachmentMediaType = Schema.Literals(mediaTypes)`; `Mime.getType(fileName)` from
  `effect/http` must agree when the extension is known. Effect has no content sniffing; the part's
  `contentType` is client-supplied. *Rejected:* `Context.Reference` tunables (impossible for the
  transport limits; amends feature R21); limits in `domain` (the contract may not import it, so
  two copies); magic-byte sniffing (no Effect module; out of scope).
- **D6 — `CurrentUser`, `Auth` and `SchemaErrors` are declared in the contract; the `users` group
  has no `Auth`; the cookie is set with `HttpApiBuilder.securitySetCookie`.** `HttpApiGroup
  .middleware(Auth)` is part of the group definition, so the declarations must live where the
  groups do, and `CurrentUser` carries the contract's `UserId` (the same brand string as the
  domain's, so the types unify). A missing cookie reaches the middleware as `Redacted('')`; the
  middleware fails `UserUnknown`, which the endpoint's error codec renders as `401` and OpenAPI
  documents with the `cookie` security scheme. `POST /users` reads an existing cookie with
  `securityDecode` and always calls `securitySetCookie` (`httpOnly`, `sameSite: 'lax'`, `maxAge:
  1 year`, `secure` in production), keeping its JSON success schema-encoded. The built-in decode
  failure is an empty `400` absent from OpenAPI, so `layerSchemaErrorTransform` turns it into
  `RequestInvalid` with issues from `SchemaIssue.makeFormatterStandardSchemaV1`. *Rejected:*
  `Auth` on the whole api with an exemption for `users` (none exists); `handleRaw` +
  `HttpServerResponse.setCookie` (loses response encoding and the OpenAPI check); the default
  `400`.
- **D7 — The user secret is 32 random bytes in base64url; the store keeps its hex SHA-256 under
  `credentials/secret/<hash>`.** `Crypto.randomBytes` and `Crypto.digest('SHA-256')` are platform
  services, so `UserService` does both without an infrastructure adapter. A random 256-bit secret
  has no dictionary, so a fast hash suffices and a store dump reveals no credential. The
  `credentials/<kind>/…` collection and the `Credential { kind, hash }` value leave room for a
  provider identity later (`kind: 'github'`, …) without renaming. *Rejected:* storing the secret
  (a dump is a login); bcrypt or Argon2 (slow hashing protects weak secrets, not random ones);
  a `user-secrets` collection (names today's only kind). *Amended in S7:* the plaintext secret
  is `UserSecret = Redacted.Redacted<string>` in `application/user`, the type the cookie
  security decodes and `securitySetCookie` accepts; `UserService.ensure(secret)` returns
  `{ user, secret }`, creating a user whenever the secret is absent or unknown, and the
  `PlatformError` of `Crypto` dies as a store failure does (D17). *Rejected:* a domain brand
  for the plaintext (no check to carry: the domain knows only the hash).
- **D8 — Uploads are buffered per part in the handler and handed to `AttachmentService.upload` as
  `{ fileName, mediaType, bytes }`.** `KeyValueStore.set` needs the whole value anyway and the
  cap is 10 MiB; `MultipartError` surfaces inside the handler and is mapped there: `FileTooLarge`
  and `BodyTooLarge` → `AttachmentTooLarge` 413, `TooManyParts` → `RequestInvalid` 400, an
  unsupported type → `AttachmentTypeUnsupported` 415, each before anything is stored. An
  undeclared error would be a `500`. *Rejected:* streaming parts into the store (no streaming
  `set`; S3 brings it in roadmap 5); the buffered `asMultipart` (temp files, and the builder
  `die`s on its errors).
- **D9 — The api test seam is `BunHttpServer.layerTest` with `HttpApiClient` and a cookie jar.**
  `HttpClient.withCookiesRef` keeps the `Set-Cookie` of `POST /users` for the next calls, and
  `responseMode: 'decoded-and-response'` exposes the cookie attributes; the same server also runs
  `@app-template/api-client`, so the facade is covered by the same suite. *Rejected:*
  `HttpApiTest.groups` (no socket, but no `transformClient`, so no cookie); a raw `fetch` test
  (untyped).
- **D10 — `download` is a `handleRaw` returning `HttpServerResponse.uint8Array(bytes, {
  contentType, headers })` under a success declared `asUint8Array()`.** The real type travels in
  the header while OpenAPI documents `application/octet-stream`; `204` is
  `HttpApiSchema.NoContent`, `202` is `HttpApiSchema.status(202)` on the success struct.
  *Rejected:* one success schema per media type (six endpoints' worth of spec for one route).
- **D11 — Attachment metadata and bytes are two ports.** `AttachmentRepository` becomes a Postgres
  table and `AttachmentStore` becomes S3, in different tickets; one port would force both to move
  together. *Rejected:* one port with `put`/`get` of bytes alongside rows.
- **D12 — `ChatService.send` enqueues `ChatTitleJob` when the chat had no messages; the worker
  writes the title only if it is still `none`, re-reading right before the write.** The trigger
  is known in `send` (the last message was `none`), the job carries the text so the worker needs
  no history, and a user's rename always wins except for the millisecond race accepted in Risks.
  *Rejected:* titling inside the assistant-message job (couples two outcomes and two retry
  policies); titling after the first reply (later, and needs the reply). *Amended in S6:* the job
  carries the first message's id, not its text; the worker reads that one message from the store,
  still without history, and the user's text is never copied into the queue table, where it would
  outlive the chat's deletion.
- **D13 — The client is one mapped type over `HttpApiClient` with `FetchHttpClient`, returning
  `Promise<Result>`; it manages no cookies, and takes an optional `fetch`.** The browser sends
  same-origin cookies by itself and the web dev server proxies `/api/`; the `Result` shape and
  the `_tag` unions come from `effect-setup` D4. `createApiClient(baseUrl, { fetch })` feeds
  `FetchHttpClient.Fetch`, so the api test suite and a later Node consumer can attach a cookie in
  their own `fetch` while the browser passes nothing. *Rejected:* a wrapper per endpoint; a
  cookie jar in the client (the browser owns the cookie); a facade without an injection point
  (the facade's error mapping could then be tested only on unauthenticated routes).
- **D14 — `.job` joins `naming.md` as the application role for both sides of a queued job, and
  prompt functions live in the `.llm` adapter.** `effect-setup` D2 placed the job file; the rule
  table never recorded it, and `.prompt` would be a second role for one function. *Rejected:* a
  `.prompt` role; job files under `.service`. *Amended in S6:* `infrastructure/<entity>/
  <entity>.queue.ts` holds only the queue definitions (name, schema, retry policy, `jobId`); jobs
  call `send` and `worker` from `packages/queue` (D21), so no adapter wraps them a second time.
- **D15 — The dev `LanguageModelStub` streams about twenty words with a 100 ms delay each and
  answers `generateText` with a short title; tests use their own fake.** The polling demo shows
  snapshots growing without a provider; a test fake controls timing with `TestClock` and records
  the prompt. *Rejected:* an instant stub (every dev poll already sees `completed`).
- **D16 — `openapi.json` is written by `make openapi` (a script in `packages/api-contract`) and
  checked by `make check` with `git diff --exit-code`.** Library workspaces hold no scripts and
  every command goes through `make`; `OpenApi.fromApi` is deterministic. *Rejected:* a vitest
  snapshot (a failing test for a doc file, and `--update` semantics).
- **D17 — Ports declare no error channel; adapters turn store failures into defects.** A failed
  read or write of the store, or a stored value that no longer decodes, has one outcome for every
  caller: the request fails with a `500` and the job attempt fails and retries. A typed
  `RepositoryError` on every port would travel through every service signature and handler to
  reach that same outcome. Not-found stays a value (`Option`), never an error. *Rejected:* a typed
  error per port (noise in every signature for one shared outcome). *Amended in S3:* for the KV
  adapters the kv module (`infrastructure/kv/kv-collection.ts`) turns a `KeyValueStoreError` or
  a `SchemaError` into a defect once, so no KV adapter repeats `Effect.orDie`.
- **D18 — Message transitions are named for their target stage, check their source, and fail a
  typed `MessageStageInvalidError`.** The worker needs four moves, so there are four functions
  instead of one ordered `advance`; `prepareMessage` serves the first attempt, a retry and the
  recovery after a crashed worker alike (it clears the text, so earlier snapshots are overwritten).
  A move from a wrong stage is a typed failure in the error channel: the job lets it fail the
  attempt, except at its entry, where `prepareMessage` failing on a terminal message means the
  reply was already written before the lock expired, and the job ends without writing.
  *Rejected:* a generic `advanceMessage` over the literal order (an index comparison for two moves,
  and a silent no-op that hides a caller's mistake); `Option.none` for a refused move (no
  `from`/`to` for the log, and a `match` at every step of the job); `throw` (a defect that bypasses
  the error channel and reads as an infrastructure failure, D17).
- **D19 — A failed message keeps the failure's cause for operators; the contract never exposes
  it.** `MessageFailure` carries `reason` for code, `message` for the user and `cause` (the
  worker's `Cause.pretty`, as text) for whoever investigates, so a failure is traceable from the
  message itself rather than only by matching log lines. The DTO has no `cause` field, and a seam
  7 test asserts its absence. *Rejected:* the cause in the log only (no link from a message to its
  failure); the cause in the user-facing `message` (leaks provider detail to the user).
- **D20 — Each aggregate's ids live in `<aggregate>.id.ts`, and Biome's `noImportCycles` fails
  any import cycle.** `Message.attachmentIds` and `Attachment.messageId` made the chat and
  attachment models import each other, so in whichever loaded first the other's id was not yet
  initialised and building the schema threw. An id file imports nothing of its aggregate, so models depend on ids,
  never on each other, and the lint rule turns the constraint into a check. *Rejected:*
  `Schema.suspend` on both sides (works, but hides the coupling behind comments with no check);
  one shared ids file (breaks one folder per aggregate, D1).
- **D21 — A queue is a static definition value carrying its `jobId`; a job sends with
  `send(definition, message)` and consumes with `worker(definition, handle)`, a Layer whose scope
  owns the consumer fiber.** The definition already holds everything a queue needs, so the id
  rule sits beside the schema and no caller passes an id; `worker` is
  `Layer.effectDiscard(Effect.forkScoped(…))`, so the app merges job layers and closing the scope
  interrupts the consumer, which releases its job at the same attempt. The shape follows effect's
  `DurableQueue`. Any cause that ends the consumer, a typed `QueueError` or a defect (the SQL
  store's `ack` retries, then dies), is logged at `Error` with the queue's name and the consumer
  restarts after a delay that grows from 1 s and is capped at 1 min, with no limit: `tapCause`,
  `Effect.sandbox`, `Effect.retry`, as effect's own SQL poll loop does
  (`Effect.tapCause(Effect.logWarning)`, `Effect.sandbox`, `Effect.retry(Schedule.spaced(500))`).
  An interrupt-only cause is not logged: a handler that interrupts itself releases its job, and
  the consumer restarts. A defect the store adds while settling a failed attempt is logged at
  `Error` before the attempt's failure is recovered, so it is never dropped unseen. The schedule
  is one constant in `packages/queue`, not a definition field, and its state never resets, so
  after a run of failures every restart waits the 1-minute cap (`Schedule` 4.0.5 has no
  `resetAfter`); a restarted consumer still takes the queued jobs, so R19 holds.
  *Rejected:* `QueueClient.make` at call sites (each job repeats the fork, the lifecycle and the
  error policy); a `Context.Service` per queue (a middle man around a value that is already
  static); effect's `DurableQueue` itself (it needs `WorkflowEngine` and is request/response);
  `Effect.orDie` on a store failure (a probe showed a defect in a `forkScoped` fiber is neither
  logged nor ends `Layer.launch`, so the process lives on without a consumer); retrying only a
  typed `QueueError` (the SQL store's defects would end the consumer the same way); a `worker`
  Effect run under `runMain` (gives up the Layer shape); dying after a bounded retry through a
  `Deferred` the main fiber awaits (coupling for no gain: a restart heals an unavailable store no
  better than a retry).
- **D22 — `effect` is patched so `Equal.equals` ignores the position keys Bun puts on an
  `Error`.** *Added in S7.* Without it, `assertEquals` on two equal domain errors fails at random
  on Bun, so `make check` is not a gate. `patches/effect@4.0.5.patch` lives in the root
  `patchedDependencies`; tests and `effect-tests.md` stay as they are. The cause, the fix and what
  a catalog bump must do with it: [tooling.md › Patched
  dependencies](../../knowledge/tooling.md#patched-dependencies). *Rejected:* comparing
  `{ ...error }` spreads in the tests (treats the symptom in every test and drops the prototype
  check); rerunning a red `make check` (a gate that lies and worsens with each new test).

- **D23 — The assistant-message queue keeps one attempt beyond its replies, and that attempt only
  settles a reply the last one left active.** *Added in S8b.* The SQL store marks a job whose
  final attempt lost its lock `failed` without calling the handler, so a crash on the last reply
  would leave the message active and the chat busy for good, against R18. `chat.queue.ts`
  exports `replyAttempts = 3`, and `assistantMessageQueue` has `maxAttempts: replyAttempts + 1`:
  attempts 1–3 reply; the third, the last reply, catches its own failure,
  writes `failed` with `Cause.pretty` of it, logs `Error` and ends, so the queue never reaches
  attempt 4 in the normal path. Attempt 4 runs only when attempt 3 did not settle: it writes
  `failed` with a fixed operator cause and logs `Error` "assistant reply left unsettled by the
  last reply attempt", without calling the model, or ends with the `Info` "already settled" line
  when the message is already terminal. An interrupt-only cause on the last reply is neither caught nor
  logged, so a stopped worker hands the job on at the same attempt (R34). Two paths reach
  attempt 4 without a dead worker, and the cause names both ("its worker stopped or the store
  failed"): a store defect in attempt 3 before its reply starts (reading the chat or the message
  sits outside the reply's catch, and its cause is in the queue's `Warn` line), and a store
  defect in attempt 3's own `failed` write. A lock that expires on a live worker (a stall longer
  than the lock expiry) gives the job to a second worker while the first still runs, the
  duplicate delivery R19 already accepts: attempt 4 may then write `failed` and the live
  attempt 3 overwrite it with snapshots and `completed`, so the message settles on whichever
  writes last. The residual window is a crash during attempt 4's single write. *Rejected:* an
  api-side staleness rule (`ChatService` failing an active message whose `updatedAt` is older
  than the lock expiry: a reply waiting for its first token writes nothing for that long, so it
  needs a heartbeat and races a live but slow worker); a generic recovery attempt in
  `packages/queue` (it changes the dead-letter contract of every queue, and the title job's only
  casualty is a chat left untitled); moving the reads into the last reply's catch (a store that
  fails the read fails the `failed` write too, and the attempt 4 cause covers it); accepting the
  stuck chat (R12 then refuses every send in it).
- **D24 — The job builds its prompt from the store on every attempt and does not use
  `effect/ai/Chat`.** *Added in S8a.* `Chat` keeps its own history in a `Ref` (or in
  `Chat.Persistence`, keyed by chat id), a second source of truth beside `MessageRepository` that
  drifts on `deleteByChat`, failed messages and the api's writes; `Chat.streamText` appends the
  partial response to that history in the release phase of `acquireUseRelease`
  (`repos/effect/packages/effect/src/ai/Chat.ts`, lines 463–486) on failure and interruption too,
  so a retried attempt would see the previous fragment; and its `Semaphore(1)` is per process,
  while the job is stateless and exclusion already comes from one active message per chat
  (`selectActiveByChat`). Seam 6 asserts the prompt that the pure `buildChatPrompt` produces with
  `Prompt.make`, `file` parts included. *Rejected:* `Chat.fromPrompt(…)` or `Chat.layerPersisted`
  as the job's history. Where `Chat` would fit: an ephemeral session inside one attempt, built
  from the store's prompt, if the chat ever gets tools and a reply spans several model turns.
- **D25 — A chat with nothing to title stays untitled: a first message with a blank text (no
  text, or whitespace only, which `ensureMessageInput` allows beside attachments) never reaches
  the model, and a blank answer is no title; both end the job with an `Info` log and no retry.**
  *Added in S9.* Providers reject an empty text block, so a blank text has nothing to ask about;
  a blank answer decodes to no `ChatTitle`, and the user can still rename the chat. *Rejected:*
  failing the attempt so the queue retries (a blank text fails the same way five times and ends
  in a dead letter, an `Error` log for a normal input); a title cut from the message's own text
  (it repeats the user's words, and the title would then have two sources with different
  rules).

## Risks

| Risk | Mitigation |
|---|---|
| Title race: a rename lands between the worker's re-read of the chat and its write of the title or `updatedAt` on the file store, and is lost | the worker re-reads the chat just before each write, never writing a chat read at take time; Postgres (roadmap 4) makes them `UPDATE … WHERE title IS NULL` and `UPDATE … SET updated_at` |
| Delete race: the api's `deleteByChat` lands between a worker's read and write of a message | `Collection.update` writes only an existing key, but the two processes hold separate locks, so the worker can rewrite a deleted message: an orphan `messages/<id>` row no index lists, harmless but leaked; Postgres closes it with a foreign key `ON DELETE CASCADE` |
| Two concurrent `send`s on one chat both pass the "no active message" check | a per-chat lock in `ChatService.send` serialises check and inserts within the api process; it does not span processes, so a second api process needs Postgres's partial unique index (one active message per chat) first |
| `layerFileSystem` has no locking or atomic rename; a crash mid-write leaves a partial file | every index is single-writer, and only the `chats/<id>` and `messages/<id>` rows have a writer in each process (D2, D4); `layerSql` over SQLite is the one-line fallback (D4) |
| `@effect/platform-bun` is in the catalog but installed nowhere | declared by `apps/api` and `apps/worker` in the first step that needs it; `make typecheck` catches a missing declaration |
| `Secure` cookies are dropped by browsers on `http://localhost` | `secure` only when `nodeEnv === 'production'`; verified in `web-app` (7) |
| `maxFileSize` rejected a 5-byte file at a `'10 B'` limit in an experiment | limits are expressed in MiB; the test uses realistic sizes (1 MiB passes, 11 MiB fails) |
| The multipart part's `contentType` is client-supplied | documented in D5; sniffing is out of scope |
| Effect in the browser bundle (~54 KB gzip) | accepted in `feature.md`; measured once in the client step's findings |
| Unstable modules (`http-api`, `persistence`, `ai`) change in a patch | exact lock-step catalog; seams 2, 4, 6, 7 catch behaviour changes |
| A step over ~400 lines | `/ticket-plan` cuts by seam: domain per aggregate, kv-collection, repositories, queue change, services, jobs, contract, client, api groups, worker, web, cleanup, docs |
| A worker crashes on the final attempt: the SQL store's lock-expiry sweep marks the job `failed` without calling the handler (`PersistedQueue.ts`, "Lock expired after final attempt"), so the message stays `preparing` or `generating` and the chat stays busy, against R18 | D23: the definition's final attempt only settles a reply the last one left active; what remains is a crash during that attempt's single write, two crashes in a row |
| A lock expires on a live worker (a stall past the lock expiry): a second worker takes the job while the first still writes, so two attempts interleave snapshots and the settling attempt's `failed` can be overwritten by the live attempt's `completed` | accepted as the duplicate delivery R19 already implies; the message settles on the last writer; Postgres (roadmap 4) can guard the terminal write with `UPDATE … WHERE stage IN (active stages)` |
| A long chat's history grows without bound: every attempt sends every completed message and its files, until the prompt exceeds the model's context window and every reply fails | none in this ticket; roadmap entry 6 (`llm-providers`) trims the history to the window |
| Dev store grows with attachment bytes | `.data/` is gitignored; `rm -rf .data` resets both store and queue |
| An attachment `DELETE` races a `send` that binds the same unbound attachment: both service checks pass on the unbound row (check-then-act in `AttachmentService.delete` and `ChatService.send`) | the atomic `Collection.update` stops the deleted row from being resurrected, but the message may then reference a deleted attachment; Postgres closes it with `UPDATE … WHERE message_id IS NULL` on bind and a delete guarded the same way |

## To verify during implementation

- **V1** — a `Secure`-less cookie set over the web proxy (`localhost:3001` → `localhost:3000`)
  is stored and sent back by the browser; a `curl` round trip in the api step, the browser in 7.
- **V2** — `TestCrypto.randomUUIDv7` within one `TestClock` millisecond is not monotonic; tests
  rely on index order, never on id order.
- **V3** — the `StandardSchemaV1` formatter's `path` for nested payload issues (`['attachmentIds',
  2]`), asserted in seam 7.
