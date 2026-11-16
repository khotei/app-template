# Shared files

Flow: lab

## Intent

Common files on three levels: global (the user's), a chat's and a message's. Every message-level
file becomes a chat-level one. A user-level file can be attached to a chat, to a message, or to
both. The api manages the files and their attachments, mostly CRUD: the user's files, a chat's, a
message's. Managing files has to be friendly: attaching, reviewing, listing. No overengineering:
a minimal working feature first; edge cases and improvements of little value come later.

## Map

Drafted by the agent on the owner's `[DO]` in L1, and accepted with the `[D]` lines of its
Notes.

| Step | Goal | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | An attachment is the user's own or one chat's, by where it is uploaded, with no expiry: the user lists their own, a chat takes an upload, and a send attaches either by id, the user's own to any number of messages | minimal | build | todo |
| L2 | A chat's attachments: link the user's own to a chat and remove one, list the chat's with its messages'; the reply reads them; then the play of the whole feature | minimal | build | todo |
| L3 | Right: what the play and the reviews change | right | build | todo |
| L4 | Later: the items of the open list the owner picks, the limit per user first | hard | build | todo |

## L1 — The user's own attachments and a chat's

### Shape

Drafted by the agent on the `[DO]` below and accepted by the owner in the chat; the contract in
code is the next move.

One word: an **Attachment** is a file a user uploaded, and the only way to its bytes. It has an
owner, set by where it is uploaded and marked on it: the user, or one chat of theirs. The
user's own is listed for the user, linked to any chat or message of theirs, and kept until
deleted. A chat's own is listed in that chat only, linked to its messages only, and deleted
with the chat. A message's attachment is its chat's too.

```text
POST   /attachments                                upload the user's own, 1 to 5  (today)
GET    /attachments                                the user's own, in upload order (new)
GET    /attachments/:attachmentId                  one                            (today)
GET    /attachments/:attachmentId/download         302 to the bytes               (today)
DELETE /attachments/:attachmentId                  the attachment and its bytes   (today)
                                                   409 while a chat or a message holds it

POST   /chats/:chatId/attachments                  upload the chat's own          (new)
GET    /chats/:chatId/attachments                  its own and the linked         (new, L2)
PUT    /chats/:chatId/attachments/:attachmentId    link the user's own            (new, L2)
DELETE /chats/:chatId/attachments/:attachmentId    remove from the chat: unlink   (new, L2)
                                                   the user's own, delete its own

POST   /chats/:chatId/messages                     { text, attachmentIds }        (today)
GET    /chats/:chatId/messages[/:messageId]        a message with its attachments (today)
```

```text
attachments  id, user_id, chat_id? -> chats (its owner, none for the user's own), file_name,
             media_type, size, created_at; message_id leaves
<links>      attachment_id -> attachments, chat_id -> chats, message_id? -> messages, created_at
             a chat's delete takes its own attachments and every link to it
```

```text
model     the rules, pure functions over the values passed in
services  the plain records; the records with their bytes, calling a rule of their own model
use case  a flow that needs the chat's service too: an upload into a chat, a link, an unlink,
          the send; it passes what the services read to a rule over both
handler   one service for the user's own upload, the list, the read, the download, the delete
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
  [N:ai] Changed by the owner mark, accepted below: a chat also takes the upload of its own.
[Q] About `POST /chats/:chatId/attachments` and `POST /chats/:chatId/messages`: we upload the
file first and then attach it, and an existing one is only linked? These routes never upload,
only link? (the owner, chat)
  [A:ai] Yes. The bytes enter once, through `POST /attachments`
  (`http-api/attachment/api-attachment.http.ts:20`); a chat's routes take ids and no bytes, as
  the send does today with `attachmentIds` (`http-api/chat/api-chat.http.ts:53`). The link to a
  chat is drafted as `PUT /chats/:chatId/attachments/:attachmentId`, not a `POST` with a body:
  the id is in the path, and a repeat changes nothing.
[Q] How will the same attachment or file be attached to different chats and messages? (the
owner, chat)
  [A:ai] By its id, sent again: the bytes are stored once under the attachment's id
  (`kernel/data/file/file.entity.ts:6`), and each attaching adds one row to a table of links.
  Today the attachment's own row names its one message
  (`kernel/data/attachment/attachment.table.ts:24`), so a second message has no place to be
  written; those two columns move into the links, one row per chat or message that holds it. A
  chat's read takes the links of its `chat_id`, a message's those of its `message_id`, and the
  delete of the attachment is refused while a link names it.
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
  [N:ai] Changed by the owner mark, accepted below: it holds for the user's own only, and a
  chat's own are deleted with it, bytes too, as today.
[Q:ai] Question 1 of the five (what breaks if this is removed?) fails for a message's own routes
  (`/chats/:chatId/messages/:messageId/attachments`): a sent message is finished text and its
  Run has read its files, so there is nothing to add or remove, and the message already carries
  its attachments. I propose none: attach at the send, read with the message.
[Q:ai] I assume "attached to a chat" means the assistant reads the attachment in every reply of
  that chat, before the messages. Is that the meaning? (L2)
[Q:ai] The record `decisions.md › Modules by capability` names this ticket as the one that splits
  a `drive` module out of `chat`. With one word and the routes in place, I propose no split in
  the minimal pass, and the question again in the right pass.
[D] Ok, to the five questions put in the chat. (the owner, chat)
  [N:ai] Settled, each a line of Knowledge: `/attachments` as the CRUD with only a link and an
  unlink under a chat; `409` for the delete of an attachment in use; no routes of a message's
  own; a chat's attachment read in every reply; the upload into a chat dropped from Later. The
  `[D:ai]` lines on the expiry, the chat's delete and the `drive` module stay proposals until
  L1's contract.
[Q] What else has to be reviewed and resolved now, for the minimal implementation? (the owner,
chat)
  [A:ai] Three choices shape L1 and are the owner's: the expiry goes; a chat's delete only
  unlinks; attachments stay in `chat`, with no `drive` module yet (the three `[D:ai]` above).
  One has a deadline, not a place in L1: a cap on what one user keeps, since the expiry was the
  only bound. The agent settles the rest in L1's contract: the schema changes by regenerating
  the one `init` migration (`decisions.md › One initial migration`); the link's key to its
  attachment does not cascade, so a delete racing a link is refused in the write
  (`decisions.md › Guards in the write, no lock`); `AttachmentBoundError` gains the chats that
  hold the attachment (`http-api/attachment/api-attachment.error.ts:13`); `ApiAttachment` loses
  `messageId` and `chatId` (`http-api/attachment/api-attachment.model.ts:28`), a change no
  outside client sees, the client being private (`http-api/package.json:3`). L2's own
  questions wait for L2: the shape of a chat's list, an unlink of one only messages hold, the
  same attachment read twice by the assistant, a cap per chat.
[D] 1. Yes: the expiry goes. 3. Ok: we now just have attachments, no `drive`. (the owner, chat)
  [N:ai] Both in Knowledge.
[R] If a chat's delete only unlinks, how do we keep the user's own files apart from the ones
only attached to a chat, which the user never meant to be global: folders, or every file global
and some hidden? A file is user-level even when attached; another is chat-level even when
attached to a chat or a message. How do other companies and services divide, show and hide
them? (the owner, chat)
  [N:ai] Sent to two researchers on the same brief, the fork being the data model's: how
  products tell a user's kept files from a conversation's uploads, list them and delete them.
  [A:ai] Both researchers, read 2026-11-16, name the same two models and no folders. One
  store for every upload, which a conversation only points at and which outlives it: ChatGPT's
  Library "automatically saves uploaded and created files, including files uploaded in chats",
  and "Deleting a chat containing files does not delete a separate file that remains saved in
  Library" (<https://help.openai.com/en/articles/20001052>). Or a file owned by its container
  and deleted with it: in Claude, "When a user deletes a chat in claude.ai, its message
  content, attached files, tool-generated files, and artifacts are deleted with it"
  (<https://platform.claude.com/docs/en/manage-claude/compliance-content-data>), and kept files
  live in a project; in Perplexity, "When you delete a session, any files or images attached
  to it will also be deleted", a project's being kept "until they are deleted"
  (<https://www.perplexity.ai/help-center/en/articles/10354810>). Anthropic's api holds both in
  one store and marks the kind on the file: `scope: {type: "session", id}`, null for a file the
  user uploaded; a session's delete leaves "Files you uploaded through the Files API" and
  removes those "scoped to it"
  (<https://platform.claude.com/docs/en/managed-agents/session-operations>). Where the two
  differ: one found an older ChatGPT page that keeps a file only "up to the retention period
  of the corresponding chat", against the Library page; one read Perplexity only in search
  snippets, the other on the live page. Not verified by either: whether a single file of a
  Claude chat can be saved to a project, and what a ChatGPT chat shows once its Library file
  is deleted.
  [D:ai] An attachment is the user's own or one chat's, marked on it as Anthropic's `scope` is:
  the chat that owns it, or none. Where it is uploaded decides: `POST /attachments` makes the
  user's own, listed by `GET /attachments`, linked to any chat or message, kept until deleted;
  an upload under a chat makes that chat's, listed only there, linked only to its messages,
  deleted with the chat as today (`application/chat/services/chat.service.ts:101`). This
  rewrites two settled lines of Knowledge, on the owner's word only: a chat's route would take
  bytes again (`POST /chats/:chatId/attachments`), and a chat's delete would unlink the
  user's own attachments and delete its own. The column `chat_id` then stays on the
  attachment as its owner (`kernel/data/attachment/attachment.table.ts:25`); only `message_id`
  moves to the links.
[R] What limits do other companies put on a user's files? Ours should be configured in `.env`
or in a ts file, easy to change. (the owner, chat)
  [N:ai] Sent to one researcher: the limits of the chat products and their apis.
  [A:ai] Four kinds recur (researcher, read 2026-11-16; the ChatGPT page from its archive copy
  of 2026-09-18, the live one answering 403). A size per file: ChatGPT "512MB per file", Claude
  "500MB per file" in a chat and "30MB per file" in a project, Gemini "up to 100 MB". A count
  per scope: Claude "Up to 20 files per chat", Gemini "up to 10" a prompt, ChatGPT 5 to 40 a
  project by plan. A storage total: ChatGPT "Each end-user is capped at 25GB. Each
  organization is capped at 100GB", Perplexity "5 GB of total storage" a project, OpenAI's api
  "up to 2.5 TB" a project, Anthropic's 1 TB an organisation. A rolling upload allowance:
  ChatGPT "up to 80 files every 3 hours", free users "3 file uploads per day". At the limit
  Anthropic's api answers "Storage limit exceeded (400)" and "File too large (413)". Sources:
  <https://web.archive.org/web/20260918172014/https://help.openai.com/en/articles/8555545-file-uploads-faq>,
  <https://support.claude.com/en/articles/8241126>,
  <https://support.google.com/gemini/answer/14903178>,
  <https://www.perplexity.ai/help-center/en/articles/10354807>,
  <https://platform.claude.com/docs/en/build-with-claude/files>. Not verified: a cap of files
  per message in ChatGPT, any storage total in Claude's apps.
[D] The limit per user is use-case or domain level, not the api contract's: the api keeps its
own limits, and the business verifies against what the user already holds. (the owner, chat)
  [A:ai] Agreed, and of the two the domain: a use case holds no rule of its own
  (`docs/knowledge/glossary.md`, Use case), and an upload is one service's method, with no use
  case above it. The rule is a pure function in the attachment's model over what the user
  holds and the limit, its number a constant beside it, as `unboundLifetime` is today
  (`application/chat/domain/attachment.model.ts:54`); the service that uploads reads the
  user's rows and calls it. `http-api/shared/limits.ts` keeps what one request may carry,
  checked by the schema before any code runs.
[DO] The rules are not part of `FileAttachmentService`: add services of their own, a
`FileAttachmentGuard` or a limits service, used on a delete, an upload and so on, and compose
them with `FileAttachmentService` in a use case. Think which features we will have over
attachments, and how to split and compose them over the services. (the owner, chat)
  [A:ai] The rules already sit outside the service: each is a pure function in
  `application/chat/domain/attachment.model.ts`, which a service or a use case calls
  (`decisions.md › Rules as pure functions`); the send's use case pipes one today
  (`application/use-cases/chat/create-user-message.use-case.ts:66`). A guard as a service fails
  three lines of the rules. `effect-services.md:28`: a `Context.Service` only when something
  varies, and nothing does in a check. `layering.md:32`: every method is safe on its own, and
  an upload whose limit a use case checks beside it is not. And the limit cannot be checked
  before the upload at all: a file's size is known once its bytes are stored
  (`application/chat/services/file-attachment.service.ts:79`), so the check runs inside the
  upload, per file, where the cleanup already removes what was stored (line 114).
  [D:ai] Split by what the records ask. The model holds the rules as pure functions. Two
  services stay, the plain records and the records with their bytes; `LiveAttachmentService`
  goes with the expiry. A use case composes wherever a flow needs the chat's service too: an
  upload into a chat, a link and an unlink, the send. A handler calls the service alone for
  the user's own upload, the list, the read, the download and the delete. A limits service
  earns its place only as the source of the numbers, if they are to come from `.env`.
[D] Ok: the owner of an attachment is the user or one chat, by where it is uploaded, with the
two changes to Knowledge; and the limit per user is a total in bytes, 1 GiB. (the owner, chat)
  [N:ai] Both in Knowledge. The total counts every attachment of the user, their chats' too:
  the agent's reading, one sum over the user's rows.
[D] A service is needed only where a database or another outside system is: the rules are
pure functions of the model. They need data, so, to keep repositories out of a use case, a
service composes the read with the rule and the use case uses it; or, where it is no big deal,
the use case gets the data and passes it to the pure functions. (the owner, chat)
  [N:ai] In Knowledge. Which of the two, per rule: a rule over its own model's records is
  called inside that model's service, so the method is safe alone (`layering.md:32`); a rule
  over an attachment and a chat is called by the use case, on what the two services read.

### Pieces

<[N:ai] L1.1 <what it gives> · visible: <command or link>>

### Output

<Proposed by the agent, accepted by the owner.>

## Knowledge

- An attachment is the user's own or one chat's, marked on it and set by where it is uploaded:
  `POST /attachments` makes the user's own, `POST /chats/:chatId/attachments` that chat's.
  The user's own is listed by `GET /attachments`, linked to any chat or message of the user and
  kept until deleted; a chat's own is listed and linked in that chat only.
- `/attachments` is the CRUD of the user's own. Under a chat, a route uploads the chat's own
  or links and unlinks the user's own; a link takes an id, never bytes.
- A chat's delete deletes the chat's own attachments, bytes too, and only unlinks the user's
  own.
- One user's attachments together hold at most 1 GiB, their chats' own counted; the number is
  a constant beside its rule in the model.
- A rule is a pure function of the model, and there is no guard service. A service reads what
  a rule of its own model needs and calls it; a use case composes the services where a flow
  needs the chat too, and passes what they read to a rule over both.
- One attachment is linked to any number of chats and messages by its id; its bytes are stored
  once.
- `DELETE /attachments/:attachmentId` answers `409`, naming where the attachment is held, while
  a chat or a message holds it.
- A message has no attachment routes of its own: a send links by `attachmentIds`, and the
  message's read carries them.
- The assistant reads a chat's attachments in every reply of that chat.
- An attachment does not expire: the 24-hour lifetime of an unbound one, the `unbound` tag and
  the bucket's rule that removed it go.
- Attachments stay in `chat` in the minimal pass; no `drive` module is split out.

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>

## Later

- The limit per user, 1 GiB in total: with no expiry nothing else bounds what an anonymous
  user keeps. Open, first in L4. Two uploads at once may pass it together, by one request's
  files at most.
- Delete an attachment in use after the alert (`?force`), from every chat and message. Open.
- With no expiry, a crash between the bytes' write and the row's insert leaves bytes no rule
  removes; the `unbound` tag's rule removed them within a day. Open.
- A cap on a chat's own attachments: every reply reads the bytes of all of them
  (`application/use-cases/chat/generate-assistant-message.use-case.ts:87`). Open, L2.
- An attachment a chat holds and a message of it holds too reaches the assistant twice. Open,
  L2.
- Make a chat's attachment the user's own ("save to my files"); until then, upload it again.
  Open.
- Rename an attachment (`PATCH /attachments/:attachmentId`); until then, delete and upload
  again. Open.
- Pages, search and a filter by media type for `GET /attachments`. Open.
- Where an attachment is used: its chats, in its read. Open.
- Upload straight into a chat (`POST /chats/:chatId/attachments` with the bytes). Done in L1's
  shape: it makes the chat's own attachment.
- The same bytes uploaded twice are stored twice. Open.
- An attachment's delete removes the rows, then the bytes: a failure between them leaves bytes
  no rule removes (roadmap entry 16, inherited from `jobs`). Open.
