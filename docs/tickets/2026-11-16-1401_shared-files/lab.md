# Shared files

Flow: lab

## Intent

Common files on three levels: global (the user's), a chat's and a message's. Every message-level
file becomes a chat-level one. A user-level file can be attached to a chat, to a message, or to
both. The api manages the files and their attachments, mostly CRUD: the user's files, a chat's, a
message's. Managing files has to be friendly: attaching, reviewing, listing. No overengineering:
a minimal working feature first; edge cases and improvements of little value come later.

## Map

Draft by the agent, on the owner's `[DO]` in L1; the owner confirms or changes it.

| Step | Goal | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | A user's files live on their own: upload, list, read, download and delete under `/files`, with no expiry; a send attaches them by id, one file to any number of messages | minimal | build | todo |
| L2 | A chat's attachments: attach a file to a chat and detach it, list the chat's own with its messages'; the reply reads them; then the play of the whole feature | minimal | build | todo |
| L3 | Right: what the play and the reviews change | right | build | todo |
| L4 | Later: the items of the open list the owner picks | hard | build | todo |

## L1 — A user's files on their own

### Shape

Draft by the agent, on the `[DO]` below; the contract in code follows the owner's word on it.

Two words for two things: a **File** is what a user uploaded and keeps until they delete it; an
**Attachment** is a file linked to a chat, or to one message of it. A message's attachment is a
chat's too, since it names both.

```text
POST   /files                               upload 1 to 5 files          -> 201 File[]
GET    /files                               the user's files, in upload order
GET    /files/:fileId                       one file
GET    /files/:fileId/download              302 to the bytes
DELETE /files/:fileId                       the file, its bytes, its every attachment

GET    /chats/:chatId/attachments           the chat's own and its messages'   (L2)
PUT    /chats/:chatId/attachments/:fileId   attach a file to the chat          (L2)
DELETE /chats/:chatId/attachments/:fileId   detach it; the file stays          (L2)

POST   /chats/:chatId/messages              { text, fileIds }: a send attaches to its message
GET    /chats/:chatId/messages[/:messageId] a message carries its attachments, as today
```

```text
files        id, user_id, file_name, media_type, size, created_at
attachments  file_id -> files, chat_id -> chats, message_id? -> messages, created_at
             deleting a file, a chat or a message takes its attachments, never a file
```

### Notes

[DO] Think how it could be organised for user-friendly managing of files: attaching, reviewing,
listing; which features the api gives the user. Minimal, no overengineering. (the owner, chat)
  [N:ai] The Shape draft above, the Map and the `[D:ai]` and `[Q:ai]` lines below.
[Q] Or attachments instead of files in the api? Think what we need. (the owner, chat)
  [A:ai] Both, one per thing. With one word, `DELETE /chats/:chatId/attachments/:id` cannot say
  whether the file is destroyed or only detached, and the glossary has to keep "an attachment
  attached to nothing". Anthropic's Files API draws the same line: a file is "create-once,
  use-many-times" under `/v1/files`, a message refers to it by `file_id`, and "files persist
  until you delete them" (<https://platform.claude.com/docs/en/build-with-claude/files>, read
  2026-11-16). I assume OpenAI's Assistants API names the link `attachments: [{ file_id }]`; its
  reference answered 403 today, so this is from memory.
[D:ai] No expiry: a file lives until its owner deletes it (roadmap entry 16, inherited from
  `architecture-audit`). `unboundLifetime` (`application/chat/domain/attachment.model.ts:54`),
  `LiveAttachmentService`, the `unbound` tag and the bucket's `expire-unbound` rule
  (`deployment/aws/storage.ts:21`) go.
[D:ai] One file attaches to any number of chats and messages, so `AttachmentBoundError` goes.
[D:ai] Deleting a chat takes its attachments and leaves the files, so the chat's delete stops
  deleting bytes inside the request (`application/chat/services/chat.service.ts:101`).
[D:ai] `/files` replaces `/attachments` (`http-api/attachment/api-attachment.http.ts:20`) and
  `fileIds` replaces `attachmentIds` (`http-api/chat/api-chat.http.ts:53`), with no alias: no
  client but the e2e calls them.
[Q:ai] `DELETE /files/:fileId` of a file some message holds: (a) the file and its every
  attachment go, and the message shows without it; (b) `409` until its chats are deleted. I
  propose (a): the owner of a file can always remove it; a trace of the deleted file in the
  message is in Later.
[Q:ai] Question 1 of the five (what breaks if this is removed?) fails for a message's own routes
  (`/chats/:chatId/messages/:messageId/files`): a sent message is finished text and its Run has
  read its files, so there is nothing to add or remove, and the message already carries its
  attachments. I propose none: attach at the send, read with the message.
[Q:ai] I assume "attached to a chat" means the assistant reads the file in every reply of that
  chat, before the messages. Is that the meaning? (L2)
[Q:ai] The record `decisions.md › Modules by capability` names this ticket as the one that splits
  a `drive` module out of `chat`: `drive` owns the files, `chat` the attachments, and the send
  spans both in its use case, as it already is one. In L1, or in the right pass? The pool's rows
  and the S3 objects also both want the name `FileEntity` (`kernel/data/file/file.entity.ts`).

### Pieces

<[N:ai] L1.1 <what it gives> · visible: <command or link>>

### Output

<Proposed by the agent, accepted by the owner.>

## Knowledge

<Only an accepted [D] or Output, written in the commit that settles it.>

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>

## Later

- A quota per user, in files or bytes: with no expiry nothing bounds what an anonymous user
  keeps; before any public deploy. Open.
- Rename a file (`PATCH /files/:fileId`); until then, delete and upload again. Open.
- Pages, search and a filter by media type for `GET /files`. Open.
- Where a file is used: its chats, in the file's read. Open.
- Upload straight into a chat (`POST /chats/:chatId/attachments` with the bytes), one call for
  the two. Open.
- A message keeps a trace of a deleted file (its name at attach time). Open.
- The same bytes uploaded twice are stored twice. Open.
- A file's delete removes the rows, then the bytes: a failure between them leaves bytes no rule
  removes (roadmap entry 16, inherited from `jobs`). Open.
