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
| L1 | An attachment never expires: one left unsent stays readable, and the expiry's code, tag and bucket rule are gone | minimal | build | in progress |
| L2 | The library reused: the user lists it, sends one attachment of it in two chats, and its delete is refused while a message holds one sent from it | minimal | build | todo |
| L3 | An upload into a chat stays out of the library and goes with the chat; then the play of the whole feature | minimal | build | todo |
| L4 | Right: what the play and the reviews change | right | build | todo |
| L5 | Later: the items of the open list the owner picks, the limit per user first | hard | build | todo |

## L1 — An attachment never expires

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
[D] Like `application/chat/services/live-attachment.service.ts`. (the owner, chat)
  [A:ai] Read as: the service that composes the read with the rule has this file's shape, a
  thin layer over the plain records whose every read pipes the model's rule
  (`live-attachment.service.ts:30`), so a use case takes checked data from it and pipes no
  rule itself. I assume that reading; the owner corrects it if wrong.
  [D:ai] The file's own rule is the expiry, which went, so its body goes with it; its place
  takes the new rule over the same two reads: the attachments one chat may use, the user's own
  and that chat's, any other read as not found. The send's use case and L2's link read
  through it, in place of the pipe drafted in the use case. The layer's name is the
  contract's to settle.
[D] Good. (the owner, chat, to the layer shaped as the live service)
  [N:ai] In Knowledge: three layers, the rule over an attachment and its chat in the middle one.
[DO] Review the ticket again: find the conflicts and the missed cases, audit that everything is
clear and aligned with the feature and the application, before the implementation starts. (the
owner, chat)
  [N:ai] Two passes: the agent's own, and a `reviewer` in a fresh context on the binding parts
  against the code. Fixed at once, being wording: Knowledge named two readings of where the
  chat's rule is called, and stated the limit as holding before L4. The rest, below.
  [D:ai] Never deferred, loss of stored data: a chat's delete removes the bytes of every id in
  `chat.attachments` (`application/chat/services/chat.service.ts:101`), which will hold the
  user's own once they are bound to the chat. The delete picks bytes by the owner mark alone,
  and a test of the contract says so: a chat's delete keeps the bytes of a user's own.
  [Q:ai] Never deferred, a hole for the owner to weigh: a user is an anonymous browser, made by
  `POST /users` (`http-api/user/api-user.http.ts:13`), so a limit per user stops no script; and
  with the expiry gone, what a script uploads stays for good, where it expired in a day. I
  propose to record it as a condition of the first public deploy, in the roadmap, and not to
  build a limit on users here.
  [Q:ai] One table of links cannot serve a chat's read: an attachment bound to a chat and to
  two of its messages is three rows, so the chat reads it three times, and separate keys let a
  link name chat C with a message of chat D. I propose two tables, one per level:
  `chat_attachments (chat_id, attachment_id)` and `message_attachments (message_id, chat_id,
  attachment_id)`, each pair unique, the message's keyed over `(message_id, chat_id)` to its
  message as today (`kernel/data/attachment/attachment.table.ts:40`) and over `(chat_id,
  attachment_id)` to the chat's row, so a message holds only what its chat holds and an unbind
  racing a send is refused in the write. Drizzle reads through such a table
  (`repos/drizzle/integration-tests/tests/pg/common-cache.ts:561`); a run on our schema is a
  learn step's.
  [Q:ai] A chat already carries its attachments in its read (`http-api/chat/api-chat.model.ts:24`),
  as a message does, so `GET /chats/:chatId/attachments` adds nothing. I propose to drop the
  route: `Chat.attachments` is everything bound to the chat, its own, the user's and its
  messages'.
  [Q:ai] One act has four words here: link, attach, hold, bind. The code and the glossary say
  `bind` and bound (`application/chat/domain/attachment.model.ts:127`). I propose that one,
  with unbind, and no other.
  [Q:ai] L1 is too wide for the thinnest slice: the owner mark, the binds, the upload into a
  chat and the end of the expiry, which alone touches some fifteen files. I propose a Map of
  six: a learn step for the read through a bind table; the user's own reused across chats, with
  the expiry gone; a chat's own; the bind to a chat and the reply's read, with the play; right;
  Later.
  [D:ai] Settled by the agent, for the contract: `GET` and the download under `/attachments`
  reach any attachment of the user, a chat's own too. A delete is refused while anything but
  its owner holds the attachment: any chat for the user's own, a message for a chat's own; the
  `409` names the chats. `ApiAttachment` keeps `chatId` as the owner mark and loses
  `messageId`. A message's attachments stay in upload order (`decisions.md › Reads in creation
  order`). A key that must refuse is `NO ACTION`, so a chat's delete cascades in one statement.
  The owner mark is keyed over `(chat_id, user_id)` to the chat, so an upload cannot land on
  another user's chat. The memory fakes cascade as the tables do
  (`kernel/data/__tests__/testing/chat.test-fake.ts:243`).
  [D:ai] The e2e races of two sends on one file (`apps/e2e/api/chat.e2e.ts:215`) lose their
  subject, as both sends now bind it; a race of a delete and a send takes their place, and the
  record `decisions.md › Guards in the write, no lock` names it. With them the records and
  docs rewritten in the commits that change the behaviour: `decisions.md` (Modules by
  capability, Layered services of one model, Files in the data layer), the glossary's
  Attachment, `database.md`, `aws.md`, `.claude/rules/layering.md` (the live layer's name), the
  roadmap's entry 16.
  [N:ai] Rejected, a reviewer's: objects left in the bucket after a reset. `make reset` removes
  MiniStack and `.data` (`Makefile:67`), and no deployed bucket exists.
[Q] It will be a link: the file is one, attached in different places, and the duplicates can be
removed, also when the message goes to the AI. Or how does Claude organise files in a chat, a
message? (the owner, chat)
  [A:ai] Right, and "one table cannot serve a chat's read" was too strong: it serves it with
  one dedupe in the read. Claude keeps no file on a chat at all (read 2026-11-16,
  <https://platform.claude.com/docs/en/manage-claude/compliance-content-data>): each message
  carries its own, "`files` are the files and text attachments ... the user attached to the
  message"; files "aren't listed independently", their ids "come from the chat messages
  endpoint ... or, for project-level uploads, from the project attachments endpoint"; a chat's
  delete "also deletes the chat's messages and any files attached to those messages". The
  shared level is the project above the chats, whose attachments serve every chat in it.
  [D:ai] The duplicates have one cause, a bind to the chat beside the binds to its messages,
  and Claude's shape has no such bind. Take it out of the minimal feature: an attachment is
  bound to messages only, in one table; the user's own is reused by a send in any chat; a
  chat's attachments are the ones uploaded into it, read by the owner mark as the relation
  reads them today (`kernel/data/relations.ts:18`). The assistant reads every message's files
  in every reply already
  (`application/use-cases/chat/generate-assistant-message.use-case.ts:87`), so a file sent once
  is the chat's context from then on; what goes is a file in the context with no message.
  With it go `PUT` and `DELETE` under a chat, the chat's read through a bind table, and the
  chat's delete that could remove a user's bytes: it deletes `chat.attachments`, now the
  chat's own by construction. This rewrites three settled lines of Knowledge, on the owner's
  word only.
[DO] Think how to organise it with simple logic, without splitting tables; maybe rethink files
and attachments, and do as the other AI services do. (the owner, chat)
  [A:ai] The services reuse a kept file in one of two ways. By reference: one file, many
  messages point at it (ChatGPT's "Add from library", a `file_id` in the apis), which needs a
  record of every place that points and a refusal to delete a file in use. By copy: the kept
  file stays where it is and the place that uses it gets its own. Anthropic's Managed Agents
  do so: "A new `file_id` is created that references the instance of the file in the session",
  and "Files mounted in the sandbox are read-only copies"
  (<https://platform.claude.com/docs/en/managed-agents/files>, read 2026-11-16); a researcher
  read the same of Perplexity, "Moving a file creates a copy with the destination's rules",
  which the agent did not re-read.
  [D:ai] By copy, since it shares nothing. An attachment lives in one of two places, the
  user's own files or one chat, by where it is uploaded. A send takes a chat's attachment as
  today, one attachment to one message; given one of the user's own, it puts a copy into the
  chat and binds the copy, and the original stays the user's. A chat's delete removes its
  attachments, as today; the delete of a user's own touches no chat. The table keeps its
  shape, with no table of binds, no refusal of a delete in use, no repeats to drop, and no
  chat's delete that could reach a user's bytes. The price: each reuse stores the bytes again,
  counted in the user's limit, and a send of a user's own makes one copy request to the store,
  a call `packages/s3/bucket.ts` lacks today. This replaces the binds of the earlier `[D]`
  lines and rewrites Knowledge, on the owner's word only.
[Q] Why not solve it without a copy? Copy only the link: create a link, a copy of the record,
for the specific place, a chat or a message. (the owner, chat)
  [A:ai] It works, and stores the bytes once. The copy of the bytes was proposed because it
  leaves nothing shared; a copy of the record shares the bytes, which costs one rule: who
  removes them, and when. The simplest answer is the one the owner chose before as the alert:
  the original cannot be deleted while a record made from it exists.
  [D:ai] A send of a user's own attachment adds a record of its own in the chat, bound to the
  message as any attachment is today, naming the original and carrying its name, type and
  size; no bytes move. The table keeps its shape and gains that one name of the original.
  The bytes belong to the original: a chat's delete removes its records and the bytes of the
  attachments uploaded into it only; the delete of a user's own answers `409`, naming the
  chats, while a record made from it exists, and a key from the record to its original refuses
  the race in the write. Over the copy of the bytes: no second storing and no copy request to
  the store; the price is that a user's file sent in a message is deleted only after its
  chats. Proposed in place of the `[D:ai]` above it.
[D] Yes: a record per use naming its original, the original's delete refused with `409`. Then
review the decisions, the names and the architecture of this solution: improve it, find the
elegant, composable and minimal, check the abstractions and the names. (the owner, chat)
  [N:ai] Map, Shape, Knowledge and Later rewritten to it. What the review changed:
  - No table and no layer is added. The table gains one column; a message's and a chat's
    reads stay the relations they are (`kernel/data/relations.ts:18`, `:24`).
  - A chat's delete keeps its line (`application/chat/services/chat.service.ts:101`): it
    removes the bytes under each of its attachments' ids, and a record sent from the library
    has none under its own id, the store's delete being a no-op on a missing object
    (`kernel/data/file/file.repository.ts:40`). A test of the contract holds it.
  - The layer shaped as the live service loses its reason: with no bind to a chat, the send is
    the only reader of the rule, and the record `Layered services of one model` says to
    revisit a layer left with one caller. The send pipes the rule as it pipes one today
    (`application/use-cases/chat/create-user-message.use-case.ts:66`). An accepted `[D]`, so
    it waits for the owner's word.
  - One error, wider, over a second one for a library attachment in use.
  - One word is new, the library; the verb stays bind, for a message only.
  - Rejected: every send adding a record, a chat's upload too. One path for the write, but a
    chat would read each of its sent uploads twice.
[Q:ai] Question 4 of the five (no wrapper) fails for `LiveAttachmentService` once the expiry
  goes: its `getOne` only forwards the plain one
  (`application/chat/services/live-attachment.service.ts:30`), and its `getMany` adds the check
  of every id, which `ensureAllStored` repeats one call later
  (`application/chat/services/file-attachment.service.ts:134`). I propose that L1.2 deletes the
  service and rewrites the record `decisions.md › Layered services of one model` and
  `.claude/rules/layering.md:24` to two layers, the plain records and the records with their
  bytes; the layer comes back in L2 only on the owner's word, the open question above.

### Pieces

[N:ai] L1.1 A new object carries no `unbound` tag, a send writes nothing to the store, and the
  bucket has no rule that removes an object; `FileRepository.update`, `S3Bucket.untag` and the
  inventory's `unboundExpirationDays` went with them. The 24-hour lifetime in the model stays
  for L1.2 · visible: `git grep -nE 'unboundTag|untag|expire-unbound' -- ':!docs' ':!repos'`
  answers nothing; `make check`

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
  first public deploy, for the roadmap. Open, on the owner's word.
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
- A chat's delete removes its bytes inside the request, and a failure after the rows are gone
  leaves bytes no rule removes (roadmap entry 16, inherited from `jobs`). Open.
- `deployment` imports nothing of the data layer since L1.1, yet the guard and its docs still
  allow it (`.misc/lint/biome-imports.grit:81`, `docs/knowledge/architecture.md:84`,
  `.claude/rules/modules.md:29`). Open.
- The roadmap's entry 16 still names a pool, links and a `drive` module
  (`docs/knowledge/roadmap.md:501`). Open, at the lab's close: the roadmap on this branch is
  behind `feat/web-app`'s.
