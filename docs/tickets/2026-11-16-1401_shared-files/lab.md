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
| L1 | A user's attachments live on their own: the routes under `/attachments` and a list of them, with no expiry; a send attaches them by id, one attachment to any number of messages | minimal | build | todo |
| L2 | A chat's attachments: attach one to a chat and remove it, list the chat's own with its messages'; the reply reads them; then the play of the whole feature | minimal | build | todo |
| L3 | Right: what the play and the reviews change | right | build | todo |
| L4 | Later: the items of the open list the owner picks | hard | build | todo |

## L1 — A user's attachments on their own

### Shape

Draft by the agent, on the `[DO]` below; the contract in code follows the owner's word on it.

One word, as the owner asked: an **Attachment** is a file a user uploaded, and the only way to
its bytes. It is the user's from the upload, and may be attached to chats and to messages; a
message's attachment is its chat's too. The api gains three routes under a chat and one list.

```text
POST   /attachments                                upload 1 to 5 files            (today)
GET    /attachments                                the user's, in upload order    (new)
GET    /attachments/:attachmentId                  one                            (today)
GET    /attachments/:attachmentId/download         302 to the bytes               (today)
DELETE /attachments/:attachmentId                  the attachment and its bytes   (today)
                                                   409 while a chat or a message holds it

GET    /chats/:chatId/attachments                  its own and its messages'      (new, L2)
PUT    /chats/:chatId/attachments/:attachmentId    attach to the chat             (new, L2)
DELETE /chats/:chatId/attachments/:attachmentId    remove from the chat; it stays (new, L2)

POST   /chats/:chatId/messages                     { text, attachmentIds }        (today)
GET    /chats/:chatId/messages[/:messageId]        a message with its attachments (today)
```

```text
attachments  id, user_id, file_name, media_type, size, created_at; message_id, chat_id leave
<links>      attachment_id -> attachments, chat_id -> chats, message_id? -> messages, created_at
             deleting a chat or a message takes its links, never an attachment
```

### Notes

[DO] Think how it could be organised for user-friendly managing of files: attaching, reviewing,
listing; which features the api gives the user. Minimal, no overengineering. (the owner, chat)
  [N:ai] The Shape draft above, the Map and the `[D:ai]` and `[Q:ai]` lines below.
[Q] Or attachments instead of files in the api? Think what we need. (the owner, chat)
  [A:ai] First answer, withdrawn below: two words, File and Attachment, since with one word a
  delete under a chat could not say whether the file goes or only its link.
[Q] Why do we need the files api, if we use the attachment shell everywhere, and a file does not
live, and is not reached, without an attachment? (the owner, chat)
  [A:ai] We do not. Deletion audit, on the draft, as no code exists yet: without `/files` and
  the word File nothing is lost, since `/attachments` already uploads, reads, downloads and
  deletes (`http-api/attachment/api-attachment.http.ts:20`), and the path says what a delete
  means, which my first answer missed. What the feature needs whatever the word: a list of the
  user's attachments, and a record of where each is attached once one goes to several chats.
  [N:ai] Stop (the owner's word): the `/files` routes, the word File, the rename of
  `attachmentIds` and the clash with `FileEntity` went from the draft.
[D] `DELETE /chats/:chatId/attachments/:id` deletes the attachment, and alerts if it is attached
anywhere. (the owner, chat)
  [Q:ai] Read literally, an attachment in chats C and D can leave neither: each delete alerts
  about the other. I propose the path picks the meaning: under a chat the delete removes it from
  that chat only and never alerts; `DELETE /attachments/:id` deletes the attachment itself and
  answers `409` naming where it is attached, the client's alert, as it does today for one a
  message holds (`http-api/attachment/api-attachment.http.ts:40`). Is that the rule?
[Q] Delete or unlink is a good question. Maybe `/attachments` is the CRUD, and anything under
`/chats/...` unlinks, links or uploads. How do other companies, such as Claude or ChatGPT, do
it? (the owner, chat)
  [A:ai] The same split, in both apis read on 2026-11-16. OpenAI keeps files under `/v1/files`
  and links them to a container: `POST /vector_stores/{vector_store_id}/files` "attaching a
  File to a vector store", and `DELETE /vector_stores/{vector_store_id}/files/{file_id}`: "This
  will remove the file from the vector store but the file itself will not be deleted. To delete
  the file, use the delete file endpoint"
  (<https://raw.githubusercontent.com/openai/openai-python/main/src/openai/resources/vector_stores/files.py>).
  Anthropic keeps files under `/v1/files`, "create-once, use-many-times"; a message names one by
  `file_id`, and `DELETE /v1/files/{file_id}` is the only delete
  (<https://platform.claude.com/docs/en/build-with-claude/files>). Neither refuses the delete of
  a file in use: I assume OpenAI's removes it from every vector store, from memory. In the
  Claude app a project's knowledge base is the chat-level twin: files uploaded to it serve "your
  individual chats within that project"
  (<https://support.claude.com/en/articles/9517075-what-are-projects>). ChatGPT's help page
  answered 403, so nothing is claimed of its app.
[D:ai] `/attachments` is the CRUD of the attachment itself. Under a chat a route only links or
  unlinks: `PUT` attaches, `DELETE` removes from that chat and leaves the attachment with the
  user. The alert is the `409` of `DELETE /attachments/:attachmentId`, naming where it is held.
  An upload straight into a chat stays in Later: without it the client makes two calls.
[Q] About `POST /chats/:chatId/attachments` and `POST /chats/:chatId/messages`: we upload the
file first and then attach it, and an existing one is only linked? These routes never upload,
only link? (the owner, chat)
  [A:ai] Yes. The bytes enter once, through `POST /attachments`
  (`http-api/attachment/api-attachment.http.ts:20`); a chat's routes take ids and no bytes, as
  the send does today with `attachmentIds` (`http-api/chat/api-chat.http.ts:53`). The link to a
  chat is drafted as `PUT /chats/:chatId/attachments/:attachmentId`, not a `POST` with a body:
  the id is in the path, and a repeat changes nothing.
[D:ai] No expiry: an attachment lives until its owner deletes it (roadmap entry 16, inherited
  from `architecture-audit`). `unboundLifetime`
  (`application/chat/domain/attachment.model.ts:54`), `LiveAttachmentService`, the `unbound` tag
  and the bucket's `expire-unbound` rule (`deployment/aws/storage.ts:21`) go.
[D:ai] One attachment goes to any number of chats and messages, so a send no longer refuses a
  bound one (`application/use-cases/chat/create-user-message.use-case.ts:66`);
  `AttachmentBoundError` stays for the delete.
[D:ai] Deleting a chat takes its links and leaves the attachments with the user, so the chat's
  delete stops deleting bytes inside the request
  (`application/chat/services/chat.service.ts:101`).
[Q:ai] Question 1 of the five (what breaks if this is removed?) fails for a message's own routes
  (`/chats/:chatId/messages/:messageId/attachments`): a sent message is finished text and its
  Run has read its files, so there is nothing to add or remove, and the message already carries
  its attachments. I propose none: attach at the send, read with the message.
[Q:ai] I assume "attached to a chat" means the assistant reads the attachment in every reply of
  that chat, before the messages. Is that the meaning? (L2)
[Q:ai] The record `decisions.md › Modules by capability` names this ticket as the one that splits
  a `drive` module out of `chat`. With one word and the routes in place, I propose no split in
  the minimal pass, and the question again in the right pass.

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

- A quota per user, in attachments or bytes: with no expiry nothing bounds what an anonymous
  user keeps; before any public deploy. Open.
- Delete an attachment in use after the alert (`?force`), from every chat and message. Open.
- Rename an attachment (`PATCH /attachments/:attachmentId`); until then, delete and upload
  again. Open.
- Pages, search and a filter by media type for `GET /attachments`. Open.
- Where an attachment is used: its chats, in its read. Open.
- Upload straight into a chat (`POST /chats/:chatId/attachments` with the bytes), one call for
  the two. Open.
- The same bytes uploaded twice are stored twice. Open.
- An attachment's delete removes the rows, then the bytes: a failure between them leaves bytes
  no rule removes (roadmap entry 16, inherited from `jobs`). Open.
