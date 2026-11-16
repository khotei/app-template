# Shared files

Flow: lab

## Intent

Common files on three levels: global (the user's), a chat's and a message's. Every message-level
file becomes a chat-level one. A user-level file can be attached to a chat, to a message, or to
both. The api manages the files and their attachments, mostly CRUD: the user's files, a chat's, a
message's. Managing files has to be friendly: attaching, reviewing, listing. No overengineering:
a minimal working feature first; edge cases and improvements of little value come later.

## Map

| Step | Goal | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | An attachment never expires: one left unsent stays readable, and the expiry's code, tag and bucket rule are gone | minimal | build | done |
| L2 | The library reused: the user lists it, sends one attachment of it in two chats, and its delete is refused while a message holds one sent from it | minimal | build | done |
| L3 | An upload into a chat stays out of the library and goes with the chat; then the play of the whole feature | minimal | build | todo |
| L4 | Right: what the play and the reviews change | right | build | todo |
| L5 | Later: the items of the open list the owner picks, the limit per user first | hard | build | todo |

## L1 — An attachment never expires

### Output

An attachment no longer expires. One no message holds is read, downloaded, sent and deleted
at any age; an upload tags no object, a send writes nothing to the store, and the bucket has
no rule that removes an object. Gone with the expiry: the model's `unboundLifetime`, `isLiveAt`,
`ensureLive` and `ensureAllLive`; `LiveAttachmentService`; `FileRepository.update`;
`S3Bucket.untag`; the `expire-unbound` rule and `unboundExpirationDays`. A send names an absent
row and absent bytes in one `AttachmentNotFoundError`.

See it: `bun --bun vitest run --project unit
application/chat/__tests__/services/file-attachment.service.test.ts -t '24 h'`;
`git grep -nE 'unboundLifetime|LiveAttachment|unboundTag|expire-unbound' -- ':!docs' ':!repos'`
answers nothing; `make check`.

## L2 — The library reused

### Output

The library is reused. `GET /attachments` lists the user's library, the attachments no chat
holds, in upload order. A send of a library attachment adds to the chat a record of its own,
bound to the message and naming the library one in `sourceId`; the library attachment stays,
to be sent again in any chat, and the bytes are stored once, read by `buildFileId`. A send
refuses an attachment of another chat with `404` and one a message holds with `409`, both
before the message is stored. A delete of a library attachment answers `409` with `chatIds`
while a message holds a record sent from it, and goes once those chats are deleted; a send
that adds a record between the delete's check and its write makes it die on
`attachments_source_id_fk`, a `500`. A chat's delete keeps the library attachment and its
bytes.

In code: `source_id` with its check and key; the model's `sourceId`, `isInLibrary`,
`buildFileId`, `buildAttachmentFrom`, `ensureAllReachableFrom` and `ensureUnused`;
`AttachmentService.list`; `AttachmentBoundError.chatIds`. `bind`'s update of a chat's own
attachment has no row to bind until L3's upload into a chat.

See it: `bun --bun vitest run --project e2e apps/e2e/api/chat.e2e.ts -t 'library attachment'`
(one upload sent to two chats; its delete refused, naming the chat, until the chat is
deleted); `bun --bun vitest run --project unit
apps/api/__tests__/attachment/attachment.handler.test.ts -t 'GET /attachments answers'`;
`make check`.

## L3 — An upload into a chat

### Shape

Carried from L2's Shape, which the owner accepted in the chat, the names proposed by the
agent: the lines L3 still builds, as they stood there.

An **Attachment** is a file a user uploaded, in the place where it lives: the user's
**library**, or one chat. The place is set by the upload. A chat's attachment is bound to one
message by a send, as today.

```text
POST   /chats/:chatId/attachments            upload into the chat             (new, L3)
```

```text
attachments  chat_id -> chats, cascading, so an unsent upload goes with its chat
```

| Name | What it is |
|---|---|
| `UploadChatAttachmentUseCase` | the chat's service, then the upload with the chat as place |

```text
services  `AttachmentService`, the plain records; `FileAttachmentService`, the records with
          their bytes: `upload` takes the place, `bind` binds a chat's and adds a library's
          record, `delete` reads the uses and calls the rule
use case  the send pipes `ensureAllReachableFrom` where it pipes `ensureAllUnbound` today; the
          upload into a chat is the one new use case
```

### Notes

### Pieces

### Output

<Proposed by the agent, accepted by the owner.>

## Knowledge

- One word for the file, an attachment, and one for where a user keeps them, the library.
- An attachment lives in the library or in one chat, by where it is uploaded: `POST
  /attachments` the library, `POST /chats/:chatId/attachments` that chat. The library's is
  kept until deleted; a chat's is seen in that chat only and deleted with it, bytes too.
- A send binds a chat's attachment to its message, one attachment to one message, as today. A
  send of a library attachment adds the chat's own record of it, bound to the message and
  naming its source; the library attachment stays, to be sent again in any chat.
- The bytes are stored once, under the source's id. A delete is refused with `409`, naming the
  chats, while a message holds the attachment or one sent from it; a key from a record to its
  source refuses the race in the write.
- A send refuses an attachment of another chat as not found and one a message holds as
  bound, both before the message is stored.
- A message has no attachment routes of its own, and a chat has none but its upload: each
  read carries its attachments, and a file enters a chat's context by a send.
- An attachment does not expire: the 24-hour lifetime of an unbound one, the `unbound` tag and
  the bucket's rule that removed it go.
- A rule is a pure function of the model, with no guard service; a service reads what a rule
  of its own model needs and calls it, and a use case composes the services with the chat's.
- An attachment has two services, the plain records and the records with their bytes, and no
  layer for a rule between them (`decisions.md › Layered services of one model`).
- From L5 on, one user's attachments together hold at most 1 GiB, counted over the bytes
  stored, a record sent from the library adding none; the number is a constant beside its rule.
- Attachments stay in `chat`; no `drive` module is split out.

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>

## Later

- The limit per user, 1 GiB in total: with no expiry nothing else bounds what one user keeps.
  Open, first in L5. Uploads at once may pass it together, each by its own request's files.
- A limit per user stops no script, a user being made by `POST /users`: a condition of the
  first public deploy. To the roadmap at the lab's close, on the owner's word.
- With no expiry, a crash between the bytes' write and the row's insert leaves bytes no rule
  removes; the `unbound` tag's rule removed them within a day. Open.
- Delete a library attachment in use, from every chat that holds it (`?force`). Open.
- Make a chat's attachment the library's ("save to my files"); until then, upload it again.
  Open.
- Bind a library attachment to a chat with no message, as its context for every reply. Open.
- One library attachment sent in two messages of a chat reaches the assistant twice; send it
  once. Open.
- The attachment's chat is the user's by the use case's check alone; a key over the chat and
  its user would hold it in the table. Open.
- Records added by one send share an instant, so their order within the message rests on
  their ids. Open.
  - [N:ai] The review's hunt, claimed: `bind` stamps every record of one send with one
    `createdAt` (`application/chat/services/file-attachment.service.ts:158`), and a read
    orders by `createdAt`, then `id` (`kernel/data/chat/message.entity.ts:30`), a UUIDv7
    whose tail is random within a millisecond. A send of `[a, b]` answers `[a, b]` and may
    read back `[b, a]`, in the message, the chat and the assistant's history; no test sends
    two attachments.
- Rename an attachment (`PATCH /attachments/:attachmentId`); until then, delete and upload
  again. Open.
- Pages, search and a filter by media type for `GET /attachments`. Open.
- `GET /attachments` filters by `user_id`, which no index covers
  (`kernel/data/attachment/attachment.table.ts:45`), so it scans the table. Open.
- A chat's delete removes its bytes inside the request, and a failure after the rows are gone
  leaves bytes no rule removes (roadmap entry 16, inherited from `jobs`). Open.
- `deployment` imports nothing of the data layer since L1.1, yet the guard and its docs still
  allow it (`.misc/lint/biome-imports.grit:81`, `docs/knowledge/architecture.md:84`,
  `.claude/rules/modules.md:29`). Open.
- `AttachmentBoundError.chatIds` may be empty by its type, though a refusal always has a chat
  (`application/chat/domain/attachment.error.ts:16`): the model does not tie an attachment's
  chat to its message, as the table's check does. Open.
- `effect-style.md › Signatures` asks a named function to be a declaration, while the
  models' functions are arrows, L2's as those before them
  (`application/chat/domain/attachment.model.ts:48`, `application/chat/domain/chat.model.ts:51`).
  Open: the rule or the code, outside this lab.
- The roadmap's entry 16 still names a pool, links and a `drive` module
  (`docs/knowledge/roadmap.md:501`). Open, at the lab's close: the roadmap on this branch is
  behind `feat/web-app`'s.
