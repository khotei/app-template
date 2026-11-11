# Plan: one level of nesting for Run, Message and Chat

The plan of 2026-11-10, researched and drafted on 2026-11-11. The draft is the reference: where
this document and the draft differ, the draft wins, and the four differences are listed under
"Research outcome".

## Status (2026-11-11)

- The draft is complete and green on branch `wt/reply-run-L3-nesting`, tip `1c9f59f729`, in the
  worktree `.claude/worktrees/reply-run-L3-nesting` (ports of `make worktree N=1`): 10 commits
  over `feat/reply-run` (`8c0e4cfb56`), `make check` exit 0, 251 unit and 91 e2e. Read it with
  `git -C .claude/worktrees/reply-run-L3-nesting log --oneline feat/reply-run..HEAD` and
  `git diff feat/reply-run`.
- The main tree holds only this file and the `[R]` line in `lab.md`, both uncommitted; the
  earlier flat-Run attempt was discarded (a copy: the session's scratchpad, `variant-a.patch`).
- Nothing of the draft is on `feat/reply-run` yet.

## Run it (a fresh session)

Each step on the ticket branch, in the main tree, from `/lab implement next` or by hand:

1. Commit this file and the `[R]` line of `lab.md` as `:memo: docs(reply-run): L3.18 (PLAN)
   Plan one level of nesting`.
2. Cherry-pick the draft's commits onto `feat/reply-run` in the draft's order, one round each,
   `L3.19` to `L3.28`; the simplification `1c9f59f729` follows `094382b299` (it changes only
   `message.entity.ts`). After each pick, before anyone reads it: reword the subject with its
   round id (the draft's subjects all say `L3.18`), add the piece's `[N:ai]` line to the Pieces
   of L3 in `lab.md`, and let the pre-commit `make check` prove it green. A conflict means the
   order was wrong; stop and resolve by hand, never with `--theirs`.
3. `/review-brief L3` for the owner, then `/lab-review L3`, the play (`make up`, `make dev`, a
   send, `GET /chats/:chatId/runs/:runId` until `done`), then `/lab close L3`.
4. On the owner's word, the worktree goes, in a command of its own: `make reset` inside it,
   `git worktree remove --force .claude/worktrees/reply-run-L3-nesting`,
   `git branch -D wt/reply-run-L3-nesting`.
5. Next steps as the Map says: L4 `GET /chats/:chatId/messages` (the read exists:
   `MessageRepository.selectMany({ chatId, userId })` answers messages with `run`), L5 the retry.

Open with the owner, defaults if no word comes: keep the names `messages.latestRun` /
`messages.replyOf`, `runJsonColumns`, `ApiMessageFields`, `withRun` in both entity files;
`ApiRun` stays without `chat` on the wire; `HistoryMessage` carrying each message's `run` goes
to Later as "the history takes `MessageFields` plus attachments".

## Goal

Every read answers one top-level entity that nests the flat shape of its neighbours, never a
nested one:

```
Run     { …columns, chat: ChatColumns, userMessage: MessageColumns,
          assistantMessage: MessageColumns | null }      -- null until done
Chat    { …columns, attachments, run: RunColumns | null }      -- the newest; none before a send
Message { …columns, attachments, run: RunColumns | null }
          -- a user's: the newest Run that answers it (a retry is a new Run of the same message)
          -- an assistant's: the Run that wrote it
```

The domain mirrors it: `Run { …RunFields, chat: ChatFields, userMessage: MessageFields,
assistantMessage: Option<MessageFields> }`, `Chat { …, run: Option<RunFields> }`,
`Message { …, attachments, run: Option<RunFields> }`. A nested message carries no attachments
and no Run; a nested Run carries no messages and no chat. Every `with` names top-level relations
only, never a nested `with`.

## How to work

- No hacks and no helper functions written to patch a gap: Drizzle rc.5 and Effect 4 provide
  what this needs (relations, `with`, `Schema.Struct`, `Schema.Class`, `decodeTo`, getters).
  Where the plan's snippet is not the simplest way, show the simpler one.
- The measure is code that is easy to read and to change later, then its size.
- Bring options where they exist, each with its code and cost; recommend one.

## Decided by the owner (2026-11-10)

- Keys stay as they are (K1): `runs.user_message_id` not null, `runs.assistant_message_id`
  nullable and unique. `messages.run_id` was rejected: it breaks "a retry is a new Run of the
  same message" (L5) and loses the checks "done ⇔ reply" and "every Run has a user message".
- `Message.run` is read through two relations and the author picks one (K1 a, below). No helper
  function in the repository: the pick is a codec in the entity file.
- The domain gets a flat `Fields` struct per entity, placed in the model and mapper files where
  it belongs; one file apart only where `noImportCycles` forces it.
- `Schema.withConstructorDefault` on the `Option` fields and on `status`, so the build functions
  list no defaults.
- The chat's newest Run is also named `run`, with a comment that it is the newest.
- `ApiRun.userMessage` and `ApiRun.assistantMessage` carry no `attachments`.
- No library update: Drizzle 1.0.0-rc.5 is the newest build; Effect 4.1 adds nothing for this
  and breaks `effect/Crypto`.

## Facts verified (research of 2026-11-10)

- A relation joins on an AND of column equalities plus a static filter of the target table; no
  OR, no reference to the source row (`repos/drizzle/drizzle-orm/src/relations.ts:1752-1758`,
  `:2705-2758`). So one relation cannot find a message's Run over two columns.
- `r.one` always renders `limit 1`, with the `orderBy` of the `with` config
  (`repos/drizzle/drizzle-orm/src/pg-core/dialect.ts:845`).
- `optional: false` changes only the type (`relations.ts:775-781`); the join stays a left lateral
  join, so a missing row is caught only by the entity's Effect Schema decode.
- Relations in both directions cause no type recursion: inference follows the query's `with`
  (`relations.ts:785`, `:851-881`).
- `createSelectSchema` yields the table's columns only
  (`repos/drizzle/drizzle-orm/src/effect-schema/schema.ts:100-109`).
- A struct field that is a nested *class* transformation typechecks but fails on encode:
  `decodeTo` does not relate `From["Type"]` to `To["Encoded"]`
  (`repos/effect/packages/effect/src/Schema.ts:5663`) and a class's encode checks `instanceof`.
  A nested *Struct* codec has no such problem, so the `.from` trick goes away.
- `encodeRowWith` drops keys the insert schema lacks, in types and at runtime
  (`packages/db/db.client.ts:52-58`; decoder default `"ignore"`, `Schema.ts:16810-16821`).
- `new Run({ ...run, userMessage: fullMessage })` strips the nested value to the struct's keys at
  construction (`Struct.fields`, `Schema.ts:3493-3510`), so no deeper nesting leaks in at runtime.
- `Schema.decodeTo(to, { decode, encode })` takes two getters (`Schema.ts:5666`);
  `SchemaGetter.transform` (`SchemaGetter.ts:722`) and `SchemaGetter.forbiddenEncoding`
  (`SchemaGetter.ts:475`) exist.

## Data layer

### Columns in the table files

`export const RunColumns = createSelectSchema(runs, refine)` in `run.table.ts` (with `refine`),
`MessageColumns` in `message.table.ts`, `ChatColumns` in `chat.table.ts`. Reason: the entity
files would otherwise import each other (`run.entity` needs the message's and chat's flat shape,
`message.entity` and `chat.entity` need the Run's). The table files already form a DAG:

```
user.table ◀── chat.table ◀── message.table ◀── run.table
run.entity     ──▶ run.table, chat.table, message.table
message.entity ──▶ message.table, run.table, attachment.entity
chat.entity    ──▶ chat.table, run.table, attachment.entity
```

"Row" is a word the glossary avoids for an entity (`docs/knowledge/glossary.md:91`), hence
`Columns`.

### Run and Chat

```ts
// kernel/data/relations.ts
runs: {
  chat: r.one.chats({ from: r.runs.chatId, to: r.chats.id, optional: false }),
  userMessage: r.one.messages({ from: r.runs.userMessageId, to: r.messages.id, optional: false }),
  assistantMessage: r.one.messages({ from: r.runs.assistantMessageId, to: r.messages.id }),
},
chats: { run: r.one.runs({ from: r.chats.id, to: r.runs.chatId }) },

// kernel/data/chat/run.entity.ts
export const RunEntity = Schema.Struct({
  ...RunColumns.fields,
  chat: ChatColumns,
  userMessage: MessageColumns,
  assistantMessage: Schema.NullOr(MessageColumns),
})
export const withChatAndMessages = { chat: true, userMessage: true, assistantMessage: true } as const

// kernel/data/chat/chat.entity.ts
export const ChatEntity = Schema.Struct({
  ...ChatColumns.fields,
  attachments: Schema.Array(AttachmentEntity),
  /** The newest Run, read with `{ run: { orderBy: newestFirst } }`; none before the first send. */
  run: Schema.NullOr(RunColumns),
})
```

### Message: K1 (a), the author picks the relation

```ts
// kernel/data/chat/message.entity.ts
export const newestFirst = { createdAt: 'desc', id: 'desc' } as const

/** The relation that holds a message's Run: a user's its newest, a reply's the one that wrote it. */
export const runOf = {
  user: 'latestRun',
  assistant: 'replyOf',
} as const satisfies Record<MessageColumns['author'], string>

export const withRun = { latestRun: { orderBy: newestFirst }, replyOf: true } as const

/** What a read returns before the pick: both relations. */
const MessageRead = Schema.Struct({
  ...MessageColumns.fields,
  attachments: Schema.Array(AttachmentEntity),
  latestRun: Schema.NullOr(RunColumns),
  replyOf: Schema.NullOr(RunColumns),
})

export const MessageEntity = Schema.Struct({
  ...MessageColumns.fields,
  attachments: Schema.Array(AttachmentEntity),
  /** A user's newest Run, an assistant's own; read, never written. */
  run: Schema.NullOr(RunColumns),
})
export type MessageEntity = typeof MessageEntity.Type

/** Decodes a read into the entity: the author names the relation that holds the Run. */
export const MessageEntityFromRead = MessageRead.pipe(
  Schema.decodeTo(MessageEntity, {
    decode: SchemaGetter.transform(({ latestRun, replyOf, ...message }) => ({
      ...message,
      run: { latestRun, replyOf }[runOf[message.author]],
    })),
    encode: SchemaGetter.forbiddenEncoding,
  }),
)
```

The repository then decodes with `decodeOptionalRow(MessageEntityFromRead)` and
`Schema.decodeEffect(Schema.Array(MessageEntityFromRead))`; `keepOneRun`, `runId` and both
`Effect.map` pipes go. The memory fake imports `runOf` instead of its own `runKeyOf`, and one
generic `oneWhere(rows, predicate)` (the newest row matching) replaces `newestRunWhere`.

`MessageEntityWhere.id` goes back to one id: no app caller passes an array.

## Domain

```ts
// application/chat/domain/run-fields.model.ts  (RunStatus, RunFailure, RunFields; nothing of
// message.model or chat.model, so the models form a DAG)
export const RunFields = Schema.Struct({
  id: RunId, chatId: ChatId, userMessageId: MessageId,
  status: RunStatus.pipe(Schema.withConstructorDefault(Effect.succeed('queued' as const))),
  failure: Schema.Option(RunFailure).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  provenance: ReplyProvenance,
  assistantMessageId: Schema.Option(MessageId).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  createdAt: Schema.DateTimeUtc, updatedAt: Schema.DateTimeUtc,
})

// application/chat/domain/message.model.ts
export const MessageFields = Schema.Struct({ id: MessageId, chatId: ChatId, author: MessageAuthor,
  text: Schema.String, createdAt: Schema.DateTimeUtc })
export class Message extends Schema.Class<Message>('Message')({
  ...MessageFields.fields,
  attachments: Schema.Array(Attachment),
  run: Schema.Option(RunFields).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
}) {}

// application/chat/domain/chat.model.ts: ChatFields the same way; run: Option(RunFields)

// application/chat/domain/run.model.ts  (Run and its transitions)
export class Run extends Schema.Class<Run>('Run')({
  ...RunFields.fields,
  chat: ChatFields,
  userMessage: MessageFields,
  assistantMessage: Schema.Option(MessageFields).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
}) {}
export const buildRun = ({ id, chat, userMessage, provenance, createdAt }) =>
  new Run({ id, chatId: chat.id, userMessageId: userMessage.id, chat, userMessage, provenance,
    createdAt, updatedAt: createdAt })
export const completeRun = (run, { reply, at }: { reply: Message; at }) =>
  move(run, { to: 'done', at, patch: { assistantMessageId: Option.some(reply.id),
    assistantMessage: Option.some(reply) } })
```

Why `run-fields.model.ts` stands apart: `run.model` imports `message.model` and `chat.model`
for their `Fields`, and both import the Run's; the Run's is the one both need, so it is the one
file that moves. Any other cut needs two files.

`RunFailure` becomes a `Schema.Struct` (no behaviour), so the mapper needs no
`Schema.toEncoded`. `runId` leaves `Message`: `Option.map(message.run, Struct.get('id'))` where
an id is needed.

### Mappers

```ts
// application/chat/services/run-fields.mapper.ts  (the same cut as the models)
export const RunFieldsFromColumns = Schema.Struct({
  ...RunColumns.fields, id: RunId, chatId: ChatId, userMessageId: MessageId,
  failure: Schema.OptionFromNullOr(RunFailure), assistantMessageId: Schema.OptionFromNullOr(MessageId),
  createdAt: Schema.DateTimeUtcFromDate, updatedAt: Schema.DateTimeUtcFromDate,
})
// application/chat/services/run.mapper.ts
export const RunFromEntity = Schema.Struct({
  ...RunFieldsFromColumns.fields,
  chat: ChatFieldsFromColumns,
  userMessage: MessageFieldsFromColumns,
  assistantMessage: Schema.OptionFromNullOr(MessageFieldsFromColumns),
}).pipe(Schema.decodeTo(Run))
export const encodeRun = encodeRowWith(RunFieldsFromColumns, RunEntityInsert)  // takes a Run
export const decodeRun = decodeOptionalWith(RunFromEntity)
// message.mapper.ts: run: Schema.OptionFromNullOr(RunFieldsFromColumns) — no `.from`
```

### Services, use case, worker, API

- `RunService.create(chat: Chat, userMessage: Message): Effect<Run>` builds the nested Run in
  memory from what the use case holds and inserts the flat row; `getOne` reads the nested Run in
  one query. No `RunDetail`.
- `create-user-message.use-case.ts`: `Effect.flatMap((message) => runService.create(chat, message))`;
  the title job takes `run.userMessage.id` and the "first send" test reads `chat.run`. Order
  stays message → bind → Run.
- Worker: `completeRun(generating, { reply, at })`.
- `http-api`: `ApiRun.userMessage` and `assistantMessage` are the message's fields without
  `attachments`; `apps/api/chat/chat.mapper.ts` builds them from the nested fields.
- Docs in the same commits: `docs/knowledge/database.md` (columns in table files, the read codec),
  `glossary.md` (Entity: the read codec; Model: the `Fields` struct as the model's supertype),
  `.claude/rules/deep-modules.md:45-47` ("one shape per entity": a `Fields` supertype is not a
  second shape).

## What the research must answer

1. Does every snippet above typecheck inside the repository (`make check`), including
   `decodeOptionalRow(MessageEntityFromRead)` against Drizzle's `findFirst` result type and
   `RunEntity` against `findFirst` with `withChatAndMessages`?
2. Is the file cut minimal? Confirm with Biome that `run-fields.model.ts` and
   `run-fields.mapper.ts` are the only files `noImportCycles` forces, or show a smaller cut.
3. `Schema.withConstructorDefault` on class fields: are the keys optional in `new Run({...})`
   while decoding still requires them, and does `Schema.decodeTo(Run)` from the mapper still
   accept the struct?
4. The pieces: a list, each at most 100 lines of code and tests, each green on its own, in the
   order the dependencies allow (data first), with an estimate per piece and the net change for
   `kernel/data`, `application`, `apps/api` + `http-api`, tests and docs.
5. What breaks that the plan does not name: tests, fixtures, the web client's use of `ApiRun`.

## Research outcome (2026-11-11, the draft)

The plan held as written; Drizzle rc.5 and Effect 4.0.6 provided everything, no helper function
was written. Four differences, all simplifications, each in its commit's `Decision:`:

- `runJsonColumns` (the `refine` of the jsonb columns) is exported once from `run.table.ts`, as
  `RunColumns` and `RunEntityInsert` both need it.
- `newestFirst` lives in `run.entity.ts`: `chat.entity.ts`, `message.entity.ts` and
  `run.repository.ts` all order by it, and `run.entity.ts` is the one file all three import
  without a cycle.
- The message's read codec indexes the two read values by the author directly,
  `run: { user: read.latestRun, assistant: read.replyOf }[read.author]`; the entity's decoder
  drops `latestRun` and `replyOf` (a `Struct` decode keeps only its own keys), so there is no
  table of relation names and no destructuring (`1c9f59f729`).
- Every write encodes through its `<Model>FieldsFromColumns`, not only `encodeRun`: one rule in
  `database.md`.

Confirmed by Biome: with `RunFields` inside `run.model.ts`, `noImportCycles` fails on four
imports, so `run-fields.model.ts` and `run-fields.mapper.ts` are the only new files.

What the plan did not name, found by the draft: the assistant's history now carries each
message's `run` (`readHistory` decodes whole messages); four use-case test expectations assert a
message's `run`; `run.model.test` needs a chat fixture; the OpenAPI snapshot loses 280 lines
(no attachment schema under the Run's messages); `apps/web` does not reference `ApiRun`; the
memory fake's `selectMany` decodes through the codec, so it is an effect, not a pure map.

Pieces, as the draft's commits (code + tests): Columns in the table files +50 −36; the `Fields`
structs with constructor defaults and `RunFailure` as a Struct +85 −68; the `FieldsFromColumns`
codecs +44 −21; `Chat.run` +58 −56; `Run.chat` and `RunService.create(chat, message)` +85 −52;
the Run's messages flat and `ApiMessageFields` +55 −58 (the snapshot +4 −280 apart);
`MessageEntity.run` through two relations and the codec +86 −27; `Message.run` and its tests
+92 −11; docs +58 −32; the codec simplification +7 −10. Net over `feat/reply-run`: 43 files,
+586 −610 before the simplification.
