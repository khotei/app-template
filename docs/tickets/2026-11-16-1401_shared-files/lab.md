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
| L2 | The library reused: the user lists it, sends one attachment of it in two chats, and its delete is refused while a message holds one sent from it | minimal | build | in progress |
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

### Shape

Accepted by the owner in the chat, the names proposed by the agent; the contract in code is the
next move. It serves L1 to L3.

An **Attachment** is a file a user uploaded, in the place where it lives: the user's
**library**, or one chat. The place is set by the upload. A chat's attachment is bound to one
message by a send, as today. A send of a library attachment leaves it in the library and adds
to the chat a record of its own, bound to the message, that names the library attachment as its
source and carries its name, type and size; the bytes are stored once, under the source's id.

```text
POST   /attachments                          upload into the library          (today)
GET    /attachments                          the library, in upload order     (new, L2)
GET    /attachments/:attachmentId            any attachment of the user       (today)
GET    /attachments/:attachmentId/download   302 to the bytes                 (today)
DELETE /attachments/:attachmentId            409 while a message holds it,    (today, wider in L2)
                                             or holds one sent from it
POST   /chats/:chatId/attachments            upload into the chat             (new, L3)
POST   /chats/:chatId/messages               { text, attachmentIds }          (today)
```

```text
attachments  + source_id? -> attachments, no cascade: the library attachment it was sent from
             a message without a chat is refused, as is a source without a message
             chat_id -> chats, cascading, so an unsent upload goes with its chat
```

| Name | What it is |
|---|---|
| `sourceId` | the model's and the wire's field for `source_id`, an `Option` |
| `isInLibrary` | predicate: no chat |
| `buildFileId` | the id the bytes are stored under: the source's, else its own |
| `buildAttachmentFrom` | the chat's record of a library attachment, for a message |
| `ensureAllReachableFrom(chatId)` | each is in the library or in this chat, else not found |
| `ensureUnused(uses)` | refuses a delete while a record names it, with their chats |
| `AttachmentBoundError` | gains `chatIds`; no new error |
| `AttachmentService.list` | the user's library, as `ChatService.list` is the user's chats |
| `UploadChatAttachmentUseCase` | the chat's service, then the upload with the chat as place |

```text
model     the rules above, pure, in `attachment.model.ts`
services  `AttachmentService`, the plain records; `FileAttachmentService`, the records with
          their bytes: `upload` takes the place, `bind` binds a chat's and adds a library's
          record, `delete` reads the uses and calls the rule
use case  the send pipes `ensureAllReachableFrom` where it pipes `ensureAllUnbound` today; the
          upload into a chat is the one new use case
```

### Notes

- [Q:ai] The first of the five questions fails for the send's swap. With
  `ensureAllReachableFrom` in place of `ensureAllUnbound`
  (`application/use-cases/chat/create-user-message.use-case.ts:66`), an attachment of this chat
  that a message already holds is refused by `bind` alone, after the message's insert (`:69`),
  while `layering.md › Use cases` wants every check before the first write. Pipe both, reachable
  then unbound, and keep `ensureAllUnbound`?

### Pieces

- [N:ai] L2.2 `GET /attachments` answers the user's library, the attachments no chat holds, in
  upload order; until the send's piece lands, a sent one still leaves it · visible:
  `bun --bun vitest run --project unit apps/api/__tests__/attachment/attachment.handler.test.ts
  -t 'GET /attachments answers'`

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
- The roadmap's entry 16 still names a pool, links and a `drive` module
  (`docs/knowledge/roadmap.md:501`). Open, at the lab's close: the roadmap on this branch is
  behind `feat/web-app`'s.
