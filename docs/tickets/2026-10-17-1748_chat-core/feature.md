# Chat core

> Ticket: `2026-10-17-1748_chat-core` · Source: [roadmap › 3](../../knowledge/roadmap.md#3-chat-core),
> grilling on 2026-10-17
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Goal

Build the example domain end to end, in memory: a user gets a secret, creates a chat, sends a
message with optional attachments, and the assistant answers through a worker job whose progress
the user's client polls; the user lists, reopens, renames and deletes their chats. Every
piece crosses the layers the architecture prescribes (`domain` → `infrastructure` →
`application` → `apps/api` and `apps/worker`), the api is an `HttpApi` contract over the domain that
serves its `/openapi.json` and gives the browser a typed client, and the `example` slice is deleted: `chat` becomes the worked
example every later ticket and every new project reads. Postgres, S3, SQS and real providers each
replace one layer later.

## Context

- **Starting point.** `main` at `196c1ba` (the squashed `template-bootstrap`): the `example`
  slice on Effect 4.0.5 (`Schema.Class` model, `Schema.TaggedError`, `ExampleRepository` port,
  `ExampleRepositoryMemory` on `Ref<HashMap>`, `ExampleService.get`), `packages/queue` over
  `PersistedQueue` (memory and SQLite stores, `JobQueue { send, consume }`), `packages/llm` with
  `LanguageModelStub`, `packages/config` areas, `apps/api` still on `Bun.serve` with one
  `/health` route, `apps/worker` idle, `apps/web` a vanilla page with a health panel over a
  hand-written `fetch` client, and `packages/api-contract` not yet created. `packages/db`,
  `packages/storage` and `infrastructure/shared/outbox.repository.ts` are empty leftovers.
- **Inherited requirements.** `effect-setup` R23–R29a (jobs), R30–R33 (contract and client),
  R35–R36 (runtime and dev modes) are restated below on the chat domain; its decisions D2 (both
  sides of a job in one file), D16 (`static layer` bundles what has one implementation), D17 (a
  service only when something varies), D20, D21 (`KeyValueStore`, not hand-written stores) stand.
- **Where this ticket departs from its roadmap entry.** The assistant's message is produced by a
  **worker job**, not streamed from the api: the api stores the user's message and a `queued`
  assistant message, enqueues the job and returns; the worker writes the growing text into that
  one message record as throttled snapshots, and the client polls the message until it is
  terminal. *Amended in `llm-providers` S1: the worker writes the reply whole, once, at
  `completed`.* SSE is therefore not built here; an SSE tail over the stored message is left to a
  later ticket. The chat title is generated from the **first user message**, in a job that runs
  alongside the first assistant message, not after the first reply. Consequences for roadmap
  entries 6 and 7 are listed under Open questions.
- **Why api and worker need a shared store.** The queue carries the job, not its result; the
  worker writes the assistant message and the title where the api reads them. In production that
  is Postgres (roadmap 4). Here storage is `KeyValueStore`: `layerMemory` in tests and
  `layerFileSystem` under `.data/` in dev, so the two processes see one state, the way they already
  share `.data/queue.sqlite`.
- **Facts verified on 2026-10-17** against `repos/effect` at `4.0.5` (equal to the installed
  version):

  | Fact | Value |
  |---|---|
  | `HttpApiSecurity.apiKey({ key, in: 'cookie' })` | exists; `HttpApiBuilder.securitySetCookie` sets it (`httpOnly`, `secure` by default); `HttpApiMiddleware` with `provides` can hand the current user to handlers, per group |
  | multipart | `HttpApiSchema.asMultipartStream(options)` gives a `Stream<Multipart.Part>` per request; `Multipart.withLimits` takes `maxParts`, `maxFileSize`, `maxTotalSize`, `maxFieldSize`, `fieldMimeTypes`; the generated client sends `FormData` |
  | `KeyValueStore` (`effect/persistence`) | `get`, `set`, `remove`, `has`, `modify`, `size`, `clear`, `isEmpty`; **no key listing**, so "chats of a user" needs an index entry; `prefix`, `toSchemaStore`; layers `layerMemory`, `layerFileSystem(directory)`, `layerSql`, `layerStorage` |
  | `PersistedQueue.offer(value, { id })` | deduplicates by id; `packages/queue` compiles against the vendored source |
  | ids | `Crypto.randomUUIDv7` in `effect/Crypto`, live layer `BunCrypto.layer` (`@effect/platform-bun`); `TestCrypto.layer(seed)` in `effect/testing`, driven by `TestClock` |
  | `effect/ai` | `LanguageModel.streamText` emits `text-start`, `text-delta`, `text-end`, `finish`, `error`, …; `Prompt.FilePart { mediaType, fileName?, data: Uint8Array | string | URL }`; messages have roles `system | user | assistant | tool` |
  | testing | `HttpApiTest.groups(api, groups)` tests handlers without a socket; `BunHttpServer.layerTest` exists |
  | OpenAPI | `OpenApi.fromApi`, `HttpApiScalar.layer(api, { path })`, `HttpApiSwagger.layer` |
  | `@effect/platform-bun` | in the `effect` catalog but declared by no workspace, so not installed |
  | `apps/web` | `src/main.ts` proxies `/api/*` to the api (strips `/api`) and imports `effect` although the Biome override for `apps/web/**` bans it |
  | `HttpApiSchema.StreamSse` | typed end to end, client included (not used here; recorded for the SSE tail) |

- **Client routes compared on 2026-10-17** (experiments on a three-endpoint contract, `bun build
  --minify --target=browser`, registry versions of that day). The user chose Effect's own client.
  *Amended in S12b:* without the facade, which D29 drops; the measured 54 KB is Effect's client.

  | Route | Browser gzip | Errors | Cost |
  |---|---|---|---|
  | **`HttpApiClient` + `FetchHttpClient`, `Promise<Result>` facade (chosen)** | 54 KB | `_tag` union derived from the contract, no codegen | Effect in the bundle; importing `HttpApiError` would double it |
  | `openapi-typescript@7.13.0` + `openapi-fetch@0.17.0` | 2.6 KB | `_tag` union of bodies, status separate | the generator crashes on TypeScript 7 (needs a 5.x beside it); multipart by hand |
  | `@hey-api/openapi-ts@0.99.0` | 4.1 KB | map by status | generator needs TypeScript 5.x; 16 files, fast-moving API |
  | `orval@8.43.0` (fetch) | 0.7 KB | `{ data, status }` union, the best shape | output fails `tsc` strict on multipart and SSE |
  | types from the contract, hand-written `fetch` | 0.15 KB | — | not reachable: Effect 4.0.5 exposes no wire types (`Encoded` is `Json`), and the `.d.ts` still needs `effect` |

  The type-only routes stay an option for `client-publishing` (10), where the consumer may not run
  Effect.
- **Terms** come from [docs/knowledge/glossary.md](../../knowledge/glossary.md): User, User
  secret, Chat, Message, Message stage, Title, Attachment, Assistant. Extended by this grilling:
  `Visitor` was renamed `User` at the user's request; `User` remains anonymous.

## Scope

- `domain/chat`: `User`, `Chat`, `Message`, `Attachment` as `Schema`, the message stages,
  domain errors, ports, pure operations.
- `infrastructure/chat`: adapters on `KeyValueStore` with explicit index entries; the two queue
  definitions; the prompt functions over `LanguageModel`.
- `application/chat`: `UserService`, `ChatService`, `AttachmentService`, and the two jobs,
  each holding both sides in one file.
- `http-api` (*Amended in S12a:* a layer, no longer `packages/api-contract`): the `HttpApi` with the user secret as cookie security, multipart
  upload, the spec served at `/openapi.json` (*Amended in S12:* no longer committed), Scalar UI.
- `ApiClient` in `http-api` (*Amended in S12b:* no longer the `Promise<Result>` facade
  `packages/api-client`): `HttpApiClient` over `FetchHttpClient`, the api's one client for the
  browser, the api's tests and later Effect consumers.
- `apps/api` on `HttpApiBuilder`, `BunHttpServer` and `BunRuntime`; `apps/worker` running the two
  jobs on the queue port; dev state shared through a file-system `KeyValueStore`.
- `apps/web`: the health panel moved to the new client; nothing else.
- Tests at the seams with `@effect/vitest`, `TestClock`, `TestCrypto`, `HttpApiTest` or
  `BunHttpServer.layerTest`, a fake `LanguageModel` that records its prompt.
- Deleting the `example` slice, `packages/db`, `packages/storage`,
  `infrastructure/shared/outbox.repository.ts`; the first `.claude/rules/effect.md`;
  `docs/knowledge/architecture.md › Add a new entity` rewritten on `chat`.

## Out of scope

- Postgres and Drizzle: `postgres-drizzle` (4). S3 and SQS: `aws-local` (5). Real providers,
  context truncation, token accounting, assistant-produced attachments and placeholders:
  `llm-providers` (6). The chat UI, the browser handshake, the polling loop: `web-app` (7).
  Tracing: `observability` (8).
- Streaming the assistant's message to the client (SSE tail over the stored message): a later
  ticket, see Open questions.
- Stopping a generation in flight: the stages leave room for it; the endpoint arrives with the UI.
- Pagination of the chat list and of messages: arrives with Postgres.
- Garbage collection of unbound attachments by age: [`aws-local`](../2026-10-19-1448_aws-local/feature.md) (R7).
- Rate limits, CORS (the web proxies `/api/`), accounts and sign-in.
- Publishing the client outside the monorepo: `client-publishing` (10).

## Requirements

### User

- **R1** — WHEN `POST /users` arrives without a valid user secret, THE SYSTEM SHALL create a
  user with a UUIDv7 id, issue a secret of 32 random bytes encoded base64url, store only the
  secret's SHA-256, return the user (`id`, `createdAt`), and set the secret in a cookie that is
  `HttpOnly`, `SameSite=Lax`, `Max-Age` one year, and `Secure` when `NODE_ENV=production`.
- **R2** — WHEN `POST /users` arrives with a valid user secret, THE SYSTEM SHALL return the
  same user and refresh the cookie; it SHALL NOT create another user.
- **R3** — WHEN any other endpoint except `GET /health` arrives without a valid user secret,
  THE SYSTEM SHALL answer `401 UserUnknownError`.
- **R4** — WHEN a user addresses a chat, message or attachment that does not exist or belongs
  to another user, THE SYSTEM SHALL answer `404 ChatNotFoundError`, `404 MessageNotFoundError` or
  `404 AttachmentNotFoundError`, without distinguishing the two cases.

### Chat

- **R5** — WHEN `POST /chats` succeeds, THE SYSTEM SHALL create an empty chat with a UUIDv7 id,
  `title: none`, no active message, `createdAt` and `updatedAt` from `Clock`, and return it.
- **R6** — WHEN `GET /chats` succeeds, THE SYSTEM SHALL return the user's chats as summaries
  (`id`, `title`, `activeMessage`, `createdAt`, `updatedAt`) sorted by `updatedAt` descending, without
  messages and without pagination. *Amended by the chat-reads refactor on
  `feat/llm-providers`: the chats carry no `activeMessage`; what the client needs is decided
  with `web-app`.*
- **R7** — WHEN `GET /chats/:chatId` succeeds, THE SYSTEM SHALL return the chat with every message
  in creation order, each message with its attachments' metadata, and its `activeMessage`.
  *Amended by the chat-reads refactor on `feat/llm-providers`: it returns the chat with its
  `status` (`busy` while it has an active message, else `idle`); a message is read by `GET
  /chats/:chatId/messages/:messageId`, and a list of them is decided with `web-app`.*
- **R8** — WHEN `PATCH /chats/:chatId` carries a `title` that is non-empty after trimming and at
  most 120 characters, THE SYSTEM SHALL set it trimmed, bump `updatedAt` and return the chat;
  otherwise it SHALL answer `400 RequestInvalidError`. *Amended in plan review: the contract trims the
  title; the domain's `ChatTitle` accepts only trimmed text.* *Amended in S14: the payload
  decodes `Schema.Trim` into `ChatTitle`, so `ApiClient`, whose input is the brand, sends only a
  valid title; an untrimmed or invalid one reaches the api from other clients.*
- **R9** — WHEN `DELETE /chats/:chatId` succeeds, THE SYSTEM SHALL remove the chat, its messages
  and their attachments and answer `204`, whether or not the chat has an active message. IF a job later finds its chat gone,
  THEN it SHALL end successfully without writing.
- **R10** — THE SYSTEM SHALL expose a chat's active message, the assistant message of the chat
  that is `queued`, `preparing` or `generating`, as `activeMessage: { id, stage }`, or `null` when
  there is none. The repository finds it; no stored chat field holds it. *Amended in plan review:
  message stages are the one vocabulary; `Chat.status` is gone, because its `generating` meant
  something other than the message stage of that name.* *Amended by the chat-reads refactor
  on `feat/llm-providers`: no endpoint exposes it; `GET /chats/:chatId` derives the chat's
  `status` from it, and it still guards a send (R12).* *Amended by the repository refactor on
  `feat/llm-providers`: the chat's `status` (`idle | queued | failed`) is a stored column, moved
  by transitions in the transactions that change it: a send moves it to `queued`, the reply's end
  to `idle` or, when the reply failed, `failed`; every endpoint that answers a chat carries it. A send to a
  `queued` chat is R12's `409 ChatBusyError`; a `failed` one accepts a send.*

### Message and the assistant's message

- **R11** — WHEN `POST /chats/:chatId/messages` carries `text` of at most 20 000 characters and up
  to 5 `attachmentIds` of the user's unbound attachments, and `text` is non-empty after trimming
  or at least one attachment is given, THE SYSTEM SHALL store the user's message (`author:
  user`, stage `completed`), bind the attachments to it, store an assistant message (`author:
  assistant`, stage `queued`, empty text), enqueue the assistant-message job with an id derived
  from the assistant message's id, bump the chat's `updatedAt`, and answer `202` with both
  messages.
- **R12** — IF the chat has an active message, THEN `POST /chats/:chatId/messages` SHALL answer
  `409 ChatBusyError` and store nothing.
- **R13** — IF an `attachmentId` is unknown, belongs to another user or is already bound, THEN
  THE SYSTEM SHALL answer `404 AttachmentNotFoundError` or `409 AttachmentBoundError` and store nothing.
- **R14** — WHEN `GET /chats/:chatId/messages/:messageId` succeeds, THE SYSTEM SHALL return the
  message as currently stored, including a partial text while it is `generating`. *Amended in
  `llm-providers` S1: no partial text exists; the text is empty while `generating` and whole
  at `completed`.*
- **R15** — A message SHALL carry `id` (UUIDv7), `chatId`, `author` (`user | assistant`),
  `stage` (`queued | preparing | generating | completed | failed`), `text`, `attachments`
  (metadata), `createdAt`, `updatedAt`, and `error: Option` present only when `failed`. The
  provider's other roles (`system`, `tool`) SHALL appear only in `infrastructure`. *Amended by
  the repository refactor on `feat/llm-providers`: the field is `status`, from the one status
  vocabulary the chat shares, and `completed` is `done`, on the wire too; where these
  requirements say a message's stage or `completed`, read its `status` and `done`.*
- **R16** — WHILE the worker handles an assistant-message job, THE SYSTEM SHALL set the message to
  `preparing` on taking the job; to `generating` when the model request is sent; write the text
  accumulated so far into the message at most once per snapshot interval (a tunable, default
  300 ms) while the model streams; and set `completed` with the final text when the stream ends.
  Each write bumps the message's `updatedAt`; the chat's `updatedAt` moves at send and at the
  terminal stage only. *Amended in architecture: snapshots touch one record (D2).* *Amended in
  `llm-providers` S1: the reply arrives whole; no text is written while generating, and
  `completed` carries the reply's text in one write.*
- **R17** — WHEN the worker builds the model prompt, THE SYSTEM SHALL include every `completed`
  message of the chat in creation order as the provider's `user` and `assistant` messages, with
  each user attachment as a `Prompt.FilePart` read from the store; `failed` and non-terminal
  messages are skipped. *Amended in S8a: an attachment whose bytes are missing from the store is
  left out and the message's text still goes: the bytes vanish only when the chat is deleted
  while the job reads it, and failing the reply would only retry into the same gap.* *Amended
  in `llm-providers` S3: a fixed system prompt opens the prompt, before the messages, and the
  model answers it as a JSON object whose `text` is the reply.*
- **R18** — IF an attempt of the assistant-message job fails, THEN THE SYSTEM SHALL retry it on the
  queue definition's `Schedule` with the message back at `preparing`; WHEN the attempts are
  exhausted, THE SYSTEM SHALL set the message to `failed` with `error: { reason: 'ReplyFailed',
  message, cause }`, where `message` is a user-facing sentence for that reason, carrying no
  provider detail, and `cause` keeps the failure's detail for operators and never appears in an
  api response; the chat then has no active message, so the user may send again. *Amended in
  plan review: the stored failure keeps its cause (D19).* *Amended in S8b: "the attempts" are
  the reply attempts, three of the queue definition's four; the fourth only settles a reply the
  last one left active, because a worker crash on it otherwise leaves the message active (D23).*
  *Amended in [`aws-local`](../2026-10-19-1448_aws-local/feature.md) S5d: the retry waits the
  queue definition's `retryDelay` for that attempt (1 s, then 2 s); the attempts are the
  definition's three, and the last writes `failed` on any outcome but success, an interrupt
  included (D23).* *Amended in `llm-providers` S5: a provider failure no longer fails the
  attempt; the assistant asks again within it, three requests 1 s then 2 s apart, each wait at
  least a rate limit's of up to 30 s, and then fails the message `ReplyFailed`; a failure no
  request can fix (a wrong key, an invalid request, a longer rate limit) fails it at once, and a
  refusal fails it `ReplyRefused`. The queue's attempts now retry only a crash.*
- **R19** — WHEN the worker starts after jobs were queued while it was stopped, or a job's lock
  expires after a crash, THE SYSTEM SHALL process the job, restarting the generation and
  overwriting earlier snapshots. *Amended in S8b: a crash on the last reply attempt does not
  restart the generation; the fourth attempt settles the message as `failed` (R18 amended,
  D23).* *Amended in [`aws-local`](../2026-10-19-1448_aws-local/feature.md) S5d: a worker that
  stops during the last attempt sets the message `failed` instead of restarting it. The message
  stays active, and its job goes to the dead-letter queue, only when that write never happens: a
  killed process, a store failing the write, or a stopped worker's long poll spending the last
  attempt. Accepted; a sweep belongs to ticket 4 or 9 (D23).* *Amended in `llm-providers` S1:
  there are no snapshots; a restarted generation writes no text until it completes.*

### Attachments

- **R20** — WHEN `POST /attachments` carries a multipart body of 1 to 5 files, each at most 10 MB
  and of type `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf` or
  `text/plain`, THE SYSTEM SHALL store each file's bytes and metadata as an unbound attachment of
  the user (UUIDv7 id, `fileName`, `mediaType`, `size`, `messageId: none`, `createdAt`) and
  answer `201` with their metadata.
- **R21** — IF a file exceeds the size limit, THEN THE SYSTEM SHALL answer `413 AttachmentTooLargeError`;
  IF its type is not allowed, `415 AttachmentTypeUnsupportedError`; IF the body has no file, more than
  5, or a file without a name, `400 RequestInvalidError`; in each case nothing is stored. The limits
  SHALL be constants exported by `@app-template/http-api`, never environment variables. *Amended in architecture: the
  multipart limits are fixed at schema definition, so they cannot be runtime tunables (D5). Amended
  in S2: a file without a name is `400`, since the domain's `FileName` is non-empty. Amended in
  S15: a part that is not a file, or a body that is not multipart, is `400` too; a file whose
  extension names another type than it declares is `415` (D5).*
- **R22** — WHEN `GET /attachments/:attachmentId` succeeds, THE SYSTEM SHALL return the metadata;
  WHEN `GET /attachments/:attachmentId/download` succeeds, THE SYSTEM SHALL return the bytes with
  the stored `Content-Type` and `Content-Disposition: inline; filename="…"`, bound or not.
  *Amended in S15: a name that does not fit an ASCII quoted string travels as
  `filename*=UTF-8''…` (RFC 6266) beside an ASCII fallback in `filename=`, since Bun rejects a
  header value that is not ASCII (D10).*
- **R23** — WHEN `DELETE /attachments/:attachmentId` addresses an unbound attachment of the user,
  THE SYSTEM SHALL remove it and answer `204`; IF it is bound, THEN `409 AttachmentBoundError`.

### Title

- **R24** — WHEN the first user message of a chat is stored, THE SYSTEM SHALL enqueue the title
  job with an id derived from the chat's id and a message carrying the chat id and that text.
  *Amended in S6: the message carries the chat id and the first message's id; the worker reads
  the text from the store (R32).*
- **R25** — WHILE the worker handles the title job, THE SYSTEM SHALL ask `LanguageModel` for a title
  of at most 120 characters and set it only IF the chat's title is still `none`; a title set by the
  user is never overwritten. IF the attempts are exhausted, THEN the chat stays untitled and the
  failure is logged. *Amended in S9:* IF the first message's text is blank (no text, or
  whitespace only) or the model's answer is blank, THEN the chat stays untitled, with an `Info`
  log and no retry. *Amended in `llm-providers` S6: the title is a structured answer, non-empty
  and at most 120 characters once trimmed, in the language of the first message; an answer
  that fails it, a blank one included, is asked again within the job, five requests 1, 2, 4
  and 8 s apart, and is no longer cut; a wrong key, a rate limit over 30 s or a refusal stop at
  once; the chat then stays untitled with a `Warning` log. Only a blank first message still
  asks no model.*

### Contract, client and api

- **R26** — `@app-template/http-api`, a layer beside `domain`, SHALL hold the `HttpApi`: groups
  `health`, `users`, `chats`, `attachments`, reusing the domain's ids, models and errors (a DTO only where a field
  is internal or an `Option` must reach the wire as `null`) and declaring only what is HTTP's own,
  the user secret as `HttpApiSecurity.apiKey` in a cookie, required through the `Auth` middleware
  on `chats` and `attachments`; the `users` group SHALL NOT require `Auth` and SHALL read and set
  that cookie itself. The contract SHALL list errors as arrays, each with its status, including
  the 400 for a body that fails decoding. It SHALL import only `effect` and
  `@app-template/domain` and be safe for the browser. *Amended in S11: the cookie was "on every
  group but `health`", which contradicted D6.* *Amended in S12a (D29): the contract was the
  package `@app-template/api-contract`, reused no domain schema and imported only `effect`; every
  wire tag is now the error's class name, so R3, R4, R8, R12, R13, R21, R23 and their
  acceptance name `…Error` tags.*
- **R27** — `apps/api` SHALL serve the spec derived from the contract at `/openapi.json` and the
  Scalar UI at `/docs` in every environment. *Amended in S12 (D16): `make check` regenerated a
  committed `openapi.json` and failed if it differed; no spec file is committed now.*
- **R28** — `apps/api` SHALL implement the contract with `HttpApiBuilder`, serve it with
  `BunHttpServer`, start through `BunRuntime.runMain`, resolve the current user in one middleware
  that provides it to the handlers, encode the domain's errors under the contract's statuses, and
  answer a body that fails decoding with a `400 RequestInvalidError` listing every issue (path and
  message); a failure to encode a response stays a 500. *Amended in S12a (D29): the handlers
  mapped domain errors to contract twins, and the 400 was `RequestInvalid`.*
- **R29** — `@app-template/http-api` SHALL export `ApiClient`, a service over
  `HttpApiClient.make(Api)` with `FetchHttpClient`, with no code generation and no server code, so
  the client decodes with the contract's own schemas. Each endpoint SHALL be an `Effect` whose
  error is the `_tag`-discriminated union derived from the contract: the endpoint's declared
  errors, its middleware's (`RequestInvalidError` on every endpoint, `UserUnknownError` only under
  `Auth`), `HttpClientError` (transport failure or an undeclared status) and `SchemaError` (an
  unexpected response). WHEN the api answers, or the transport fails, THE SYSTEM SHALL succeed
  with the decoded value or fail with the matching error. Multipart endpoints SHALL take a
  `FormData`. *Amended in S12b (D29): the client was the package `@app-template/api-client`, a
  `Promise<Result>` facade that never rejected; `HttpApiClient` offers no `Promise`, `signal` or
  pinned response mode to build it on, so web code runs the client's Effects itself.*
- **R30** — `apps/web` client code SHALL call the api only through `http-api` (`ApiClient`, or
  `Api` for a client built over it), SHALL import no workspace of ours but `@app-template/http-api`
  and `@app-template/ui`, and SHALL keep its health panel working: WHEN the api answers, THE SYSTEM SHALL render `API status: ok`; IF the call
  fails, THEN THE SYSTEM SHALL render one sentence per error tag. *Amended in S12b (D29): web
  client code imported no `effect` or `@effect/*` and called the api through
  `@app-template/api-client`.* *Amended in architecture: the server entry `main.ts` may import
  `effect`; its Biome override already allows it, and the earlier claim to the contrary was
  wrong.*

### Jobs, runtime and dev modes

- **R31** — `infrastructure/chat` SHALL define the two queues as definition values (name, message
  `Schema`, `maxAttempts`, `Schedule`); `application/chat` SHALL own both sides of each job in one
  file (`<entity>-<purpose>.job.ts`): an `enqueue` method and a `worker` layer. `apps/worker` SHALL
  only launch the two `worker` layers; neither app SHALL hold job logic.
- **R32** — Job messages SHALL carry ids and the fields the worker cannot read from the shared
  store, and nothing else.
- **R33** — THE adapters SHALL store objects and rows through `KeyValueStore` with explicit index
  entries (chats per user, messages per chat; no endpoint lists a user's attachments, so they
  have no index): `layerMemory` in tests;
  in dev `layerFileSystem` at `STORE_PATH` (set to `../../.data/store` in `.env.example`,
  gitignored), so `apps/api` and `apps/worker` see one state. *Amended in S3: no default in code;
  a missing `STORE_PATH` fails at startup, like `QUEUE_SQLITE_PATH`.*
- **R34** — `api` and `worker` SHALL log through `Effect.log` at the level from `LOG_LEVEL` and run
  their finalizers on SIGINT and SIGTERM; in dev the `worker` SHALL run with `--watch` and the `api`
  with `--hot`, each reload stopping the previous runtime before it starts; a worker interrupted
  during a job SHALL release it without counting the attempt (`effect-setup` R29, R35, R36).
  *Amended in S13 (D30): both ran with `--watch`, against the rule that keeps the api on `--hot`.*
  *Amended in [`aws-local`](../2026-10-19-1448_aws-local/feature.md) R12 (aws-local D2): on SQS
  an interrupted job comes back at once as its next attempt; the interrupt is counted.*
- **R35** — Ids SHALL be UUIDv7 from `Crypto` and time from `Clock`, provided by
  `@effect/platform-bun` at runtime and `TestCrypto` and `TestClock` in tests, save the api's HTTP
  tests, which run on the real `Crypto`; `domain` SHALL read neither. *Amended in S13: the HTTP
  tests assert ids by shape, so a seeded generator adds nothing there.*

### Cleanup and docs

- **R36** — THE `example` slice SHALL be removed from every layer and app, together with
  `packages/db`, `packages/storage` and `infrastructure/shared/outbox.repository.ts`, their
  workspace entries, references and Biome mentions; `make check` passes after.
- **R37** — WHEN the domain layer of the chat slice is complete, THE SYSTEM SHALL include a first
  `.claude/rules/effect.md` (`paths: **/*.ts`, ≤ ~80 lines) drawn from that code; `claude-toolkit`
  (2) polishes it. *Amended in plan: the domain lands in two steps (`chat`, then `user` and
  `attachment`), and the rule is drawn from all three folders in the second.*
- **R38** — `docs/knowledge/architecture.md › Add a new entity` and its "Where things live" table
  SHALL be rewritten on the `chat` slice, in the commits that change what they describe; the
  roadmap entry's status points to this ticket.

## Acceptance

| Req | How to verify |
|---|---|
| R1–R3 | `curl -i -X POST /users` returns a user and a `Set-Cookie` with `HttpOnly; SameSite=Lax; Max-Age=31536000`, no `Secure` in dev; a second call with the cookie returns the same `id`; `GET /chats` without the cookie is `401 UserUnknownError`; the store holds a SHA-256, not the secret (adapter test). |
| R4 | A chat id created under user A fetched with user B's cookie is `404 ChatNotFoundError`; the same for a message and an attachment. |
| R5–R7 | Create two chats, send a message in the first: `GET /chats` lists the first one first with `title: null`, `activeMessage: { id, stage: 'queued' }`, no messages; `GET /chats/:id` returns the messages in order with attachment metadata. |
| R8–R9 | `PATCH` with `"  "` or 121 characters is `400`; with `"Trip"` the summary shows it. `DELETE` while a message is active is `204`, the job ends with a log line and no write (worker test with a chat removed between enqueue and take). |
| R10 | A repository and a service test: a chat with a `queued` assistant message returns it as `activeMessage`; after `completed` it is `null`; the stored chat has no such field. (*Amended by the repository refactor on `feat/llm-providers`:* the chat's stored `status` is `queued` after a send and `idle` or `failed` after the reply; a send to a `queued` chat is `409`.) |
| R11–R14 | Send returns `202` with a `completed` user message and a `queued` assistant message; a second send while the assistant message is active is `409 ChatBusyError`; an unknown attachment id is `404`, a bound one `409`; polling the assistant message under `TestClock` shows a growing `text` then `completed` (*Amended in [`llm-providers`](../2026-10-29-1435_llm-providers/feature.md) S1:* the polled message shows an empty `text` until `completed` carries the whole reply). |
| R15 | The `Message` schema test; `git grep -n "'system'\|'tool'" -- domain application` finds nothing. |
| R16–R19 | A worker test with a fake `LanguageModel` that emits three deltas under `TestClock`: stages `preparing` → `generating` → `completed`, at most one write per snapshot interval, `updatedAt` bumped (*Amended in [`llm-providers`](../2026-10-29-1435_llm-providers/feature.md) S1:* a fake assistant answers the reply whole, and `completed` is the only write after `generating`); the recorded prompt holds the history with a `file` part per attachment and no `failed` message; a failing model goes back to `preparing` per attempt and ends `failed` with `{ reason: 'ReplyFailed', message, cause }`, no provider text in `message`, and no `cause` in the api's response (*Amended in [`llm-providers`](../2026-10-29-1435_llm-providers/feature.md) S5:* a crashing attempt goes back to `preparing`; a failing provider is asked again within the attempt, in the adapter's suite); with the worker stopped, three sends queue three jobs that run on start. |
| R20–R23 | Uploading two PNGs returns two unbound attachments; an 11 MB file is `413`, a `.zip` is `415`, six files or a nameless file `400`, and nothing is stored (adapter spy); `GET …/download` returns the bytes with `image/png` and `inline`; `DELETE` on an unbound one is `204`, on a bound one `409`. |
| R24–R25 | After the first send, the title job is queued with an id derived from the chat id (a second send queues no second title job); the worker sets a title ≤ 120 chars; a `PATCH` made before the job completes wins; a model that always fails leaves `title: null` and a dead-letter log (*Amended in [`aws-local`](../2026-10-19-1448_aws-local/feature.md) S5c:* the job test shows `title: null` after a failing last attempt; the dead-letter log is the queue's, shown by its own suite); a first message with a blank text (no text, or whitespace only), or a blank answer, leaves `title: null` with an `Info` log and no retry (*Amended in S9*; *amended in `llm-providers` S6:* a blank, an overlong or a failed answer is asked again within the job, shown by the adapter's suite, and the job then leaves `title: null` with a `Warning` log). |
| R26–R27 | `http-api` imports only `effect` and `@app-template/domain` (a probe importing another workspace fails `make lint`); at Seam 7, `OpenApi.fromApi(Api)` names the domain's tags (`UserUnknownError`) and documents the cookie security scheme and the 400; `GET /openapi.json` serves that spec and `GET /docs` serves Scalar. *Amended in aws-local's test pruning:* the cookie scheme and `security: []` are shown by live requests (a route without the cookie passes or gets 401), not by the spec. |
| R28 | A request with a malformed body is `400 RequestInvalidError` listing every issue; `make dev-api` starts through `BunRuntime` and logs finalizers on SIGTERM. |
| R29 | Through `ApiClient` against the test server (Seam 7): an unknown chat id fails with `ChatNotFoundError`, a malformed body with `RequestInvalidError`, a missing cookie with `UserUnknownError`, a stopped server with `HttpClientError` (*Amended in S14:* `ApiClient` runs every schema check on its own encode, so a malformed body cannot leave it; the body that fails decoding is sent over a raw client, and through `ApiClient` the domain's refusal of a blank message fails with `MessageInputInvalidError`; a `FormData` is not checked on encode, so S15 sends six files through `ApiClient` and sees it decode `RequestInvalidError`); a table keyed by an endpoint's error tags (`satisfies Record<tag, …>`) fails `make typecheck` on a missing or an extra tag; `bun build --minify --target=browser apps/web/src/app/main.ts \| gzip` stays near the measured 54 KB, recorded in the step's findings. *Amended in S12b.* *Amended in aws-local's test pruning:* the unknown chat id is checked once, and the stopped-server `HttpClientError` (effect's fetch transport) is no longer tested; `ApiClient.layerFetch`'s type and the web's error table cover the wiring. |
| R30 | A probe in `apps/web/src/features/` importing `@app-template/config`, `@app-template/domain` or another workspace of ours fails `make lint`, and one importing `effect` or `@app-template/http-api` passes; `make dev-api` and `make dev-web` render `API status: ok` at `localhost:3001` and, with the api stopped, the `HttpClientError` sentence. *Amended in S12b.* |
| R31–R32 | The two `.job.ts` files export `enqueue` and `worker`; `apps/worker/src` holds no job logic; the job schemas carry ids only. *Amended in S6: the title job carries the first message's id, not its text.* |
| R33 | `mv .env .env.bak && make test` passes; with `make dev-api` and `make dev-worker` running, a send in one terminal is followed by `completed` on the next poll; `.data/store` exists and is gitignored. |
| R34–R35 | SIGTERM during a job leaves it at the same attempt for the restarted worker (*Amended in [`aws-local`](../2026-10-19-1448_aws-local/feature.md) R12*, aws-local D2: it comes back as the next attempt); after two `--hot` edits of the api, one listener remains and each old runtime logs `api stopped` once before the next `Listening on` (*Amended in S13*, D30); `git grep -E "Date.now|new Date\(|randomUUID" -- 'domain/**/*.ts'` finds nothing; tests fix ids with `TestCrypto`, except Seam 7, which runs the api on the real `Crypto` (`BunServices.layer`) and asserts ids by shape (*Amended in S13*; *amended in aws-local's test pruning:* the shape is asserted in the service suites, not at Seam 7). |
| R36–R38 | `git grep -i example -- ':!docs/tickets' ':!repos'` finds no code; `packages/db` and `packages/storage` are gone; `.claude/rules/effect.md` exists within budget after the first slice; `architecture.md` maps the `chat` files; the roadmap row 3 links here. |

## Open questions

For `/ticket-architecture`:

- **Last attempt.** `JobQueue.consume` hides `attempts`; the worker must know the last attempt to
  write `failed` (R18). Expose attempt metadata to the handler, or let the queue layer call a
  final-failure hook.
- **Cookie mechanics.** `HttpApiBuilder.securitySetCookie` inside the `users` handler versus
  the user middleware setting it; and how the middleware `provides` the current user.
- **Index entries.** Shape of the per-user and per-chat index keys in `KeyValueStore`
  (`modify` for atomic append), and whether `toSchemaStore` covers them.
- **Snapshot cadence.** `Stream.throttle` versus a timer; the tunable's name and home.
- **`@effect/platform-bun`** must be declared by `apps/api` and `apps/worker` (today no workspace
  declares it).
- **Roadmap entries 6 and 7** assumed the api streams: entry 7 depends on 6 "for streaming", and
  entry 6 asks "whether the reply streams through the worker". Both should be re-read once this
  ticket's decision lands; the SSE tail over the stored message is a candidate for 7.
