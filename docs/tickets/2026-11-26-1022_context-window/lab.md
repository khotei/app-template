# Context window

Flow: lab · Branch: `docs/roadmap-context-window` (PR #61, which planned the entry and now
carries its build, on the owner's word)

## Intent

The owner's, 2026-11-26: "Implement https://github.com/khotei/app-template/pull/61 in this pr,
fresh it from main and start execute".

PR #61 is roadmap entry 20, which seeds the rest: a long chat keeps answering at a cost its owner
can see. Each reply records what it sent and what the cache served, and the history sent to the
model is cut before it outgrows the model's context window, rarely and in large steps, so the
prompt cache keeps serving the turns between two cuts. Four parts, each usable alone; the entry's
facts, its out-of-scope list and its open questions stand
([roadmap.md › 20](../../knowledge/roadmap.md#20-context-window)).

## Map

| Step | Goal, and how to see it | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | A Run that is done holds its reply's usage and the model that answered · visible: `make test-unit`; after a reply under `make dev`, `select usage from runs` shows the counts | minimal | build | done |
| L2 | The prompt of a chat's next reply starts with the prompt of its last one · visible: a test that fails when the system prompt or an earlier message's encoding changes between two replies | minimal | build | done |
| L3 | A chat's context, what its reply sends the model, is cut once its last prompt and reply pass 0.8 of the tokens limit, down to 0.3, from a user message; its start is stored and a fixed note tells the model that earlier messages are not shown · visible: a chat past the upper share sends a context that starts later, and its list still shows every message | minimal | build | done |
| L4 | A cut keeps a summary of what it left out, stored and sent in place of the note · visible: after a cut, the next request opens with the summary | minimal | build | done |
| L5 | A reply that fails for its length names the limit that ended it in the Run's failure text · visible: a test over `max_tokens` and `model_context_window_exceeded` | minimal | build | todo |
| L6 | Later: the items of the open list the owner picks | hard | build | todo |

## L1 — A done Run holds its usage and model

### Output

A done Run holds `usage` (`runs.usage`, jsonb): the model that answered, the prompt's tokens with
the cached ones counted in, the output's, and the cache-read and cache-write counts, read by
`MessageAssistant.reply` from the provider's response. The wire is unchanged. See it:
`make test-e2e` (a reply through the api ends `done` only with a usage, by `runs_usage_check`);
under `make dev`, after a reply, `select usage from runs`.

## L2 — The next prompt starts with the last one

### Output

`make test-unit` holds a case, "reply sends a chat's next request, at a later time, equal to the
last one but for the messages it adds, the cache asked for", that fails when a chat's next request
no longer starts with its last one. Not caught: a system prompt that differs between two
processes; a header that differs between two requests.

## L3 — A chat's context is cut and its start stored

### Output

A reply reads its chat's context, the messages from the start the chat holds
(`chats.context`, null until a cut). Once a reply's prompt and text pass 0.8 of
`LLM_REPLY_CONTEXT_TOKENS_LIMIT` (`ChatContextPolicy.isOverLimit`), the context is cut
(`ChatContextTokenizer.splitToCompact`) to the oldest user message whose tail holds at most 0.3 of it,
or to the newest user message, and its start stored. The chat's list still shows every
message. See it: `make test-unit`, "getMessages reads the context of the user's chat: a cut chat, those from
the start its context stores, opened by its summary"; `make test-e2e`, the repository reads a chat's
messages between two ids and writes a chat's context; under `make dev` with a low limit,
`select context from chats`. The fixed note a cut context opened with is gone since L4, whose
cut always holds a summary.

After the close, on the owner's word ("ok apply", 2026-11-26): the rule's check and its cut are
two statics, `isOversized` and `cut`, where one `findContext` held both; the chat's total and
`tokensSize`, which nothing read, are gone, a Run's usage holding the counts.

## L4 — A cut keeps a summary of what it left out

### Output

A cut keeps a summary of what it leaves out. After a reply is committed, `ReplyChatService`
reads the context's size from the reply's Run and asks `ChatContextPolicy.isOverLimit`; past
0.8 of the limit it calls `ChatContextService.compact`, which reads the context again, takes
from `ChatContextTokenizer.splitToCompact` the messages to compact and those that remain, asks
`MessageAssistant.summarise` for a summary of those left out, opened by the summary before, and
stores it with the first that remains (`chats.context`: `compacted`, `headMessageId`). The next reply reads the
messages from that start, opened by the summary (`ChatContextService.getMessages`). A summary that
fails leaves the context uncut, with a warning, for the chat's next reply. See it:
`make test-unit`, "compact summarises the messages a cut leaves out, with the summary the
context had, and stores the summary with the first message kept", "reply after a cut prompts
with the summary and the chat's messages from the start it stored"; under `make dev` with a low limit,
`select context from chats`.

Built in twenty-eight rounds, L4.3 to L4.28 on the owner's reviews of PR #61 and words in the
terminal. Not run: a reply, a cut and a summary on the provider's API; a read of a cut chat's
messages from Postgres with the reply's Run.

## Knowledge

- [D] (the owner's "ok", 2026-11-26) A Run's usage is one jsonb column shaped as `failure`, tied
  to `done` by a check; it is read and written whole.
- [D] The usage stays off the wire until a client reads it.
- [D] A response with a count or the model's name missing fails the reply as an `LlmError`.
- [D] (the owner's, 2026-11-26) The history is every finished message of a chat; the context is
  what a reply sends the model, the messages from a stored start.
- [D] (the owner's) A chat holds where its context starts as one jsonb column, `context`
  (`compacted`, `headMessageId`), written by a cut after the reply's commit; a value
  nothing reads (a total of the replies' counts, the context's size) is not stored, a Run's
  usage holding them.
- [D] (the owner's, PR #61's review) The cut is two rule groups of the domain: `ChatContextPolicy`,
  when a context is over its limit, and `ChatContextTokenizer`, how it is counted, where it
  and where it starts. `ChatContextService` reads a context as a reply sends it
  (`getMessages`) and cuts one (`compact`), holding the message's assistant for the summary;
  `ReplyChatService` checks the limit, calls them and settles a failed summary. No class of a
  context stands between.
- [D] (the owner's) An assistant takes the messages ready to send and only encodes them; what a
  cut context opens with is the domain's (`ChatContextTokenizer.withContext`), and
  `ContextMessage`, a message as it is sent, is the domain's type. Tried and taken back on the
  owner's word ("roll back to getMessages withContext"): the summary as an argument of its own,
  with the type in the assistant's file (L4.19 to L4.22).
- [D] (the owner's) `ChatService.update` writes the update variant whole, as before the column;
  a rename and a cut that land in the same milliseconds may lose one of the two.
- [D] (the owner's) A where's range is a plain object, `{ from, to }`, which `encodeWhere` turns
  into `{ gte, lte }`; no marker class stands for an operator and no method writes one.
- [D] The limit is `MessageAssistant.contextTokensLimit`, so a reply's flow reads no setting.
- [D] (the owner's, "if id exists there should be summary") A cut context always holds a summary:
  one that fails leaves the context uncut, where an earlier round cut it all the same.
- [D] (the owner's) A cut reads the context's size from the Run read with its last message, the
  reply's, so the messages and their size are one value.
- [D] (the owner's "yes") `AssistantReply` is declared beside the call that returns it, in the
  assistant's file; the decision "The language model in the kernel" says so.
- [D] A chat with no tail within the lower share is cut to its newest user message: a chat never
  cut breaks for good once past the model's window.

## Later

- Whether `usage` reaches the wire, for a cost shown in the chat — L1 — open
- A reply whose cache counts the provider sends as `null` has no case of its own: the package
  turns them into 0 today — `application/chat/__tests__/infrastructure/assistant.llm.test.ts:68` — open
- With Anthropic's `fallbacks` on, a response holds two `response-metadata` parts and
  `Arr.findFirst` keeps the model asked, not the one that answered; the app sends none —
  `application/chat/infrastructure/message-assistant.llm.ts:120` — open
- A chat whose newest user message and its reply hold more than 0.3 of the limit is cut to that
  message alone, and stays past 0.3 — `application/chat/domain/chat-context-tokenizer.ts:55` — open
- The tokens of a summary's call are stored nowhere: a Run's usage holds its reply's alone —
  `application/chat/infrastructure/message-assistant.llm.ts:144` — open
- A worker stopped during a summary's call logs "reply failed", though its Run is done; the cut
  is found again after the chat's next reply —
  `application/chat/services/reply-chat.service.ts:95` — open
- A summary that outlasts the worker's 600 s is never stored, so its chat is not cut; reachable
  only with a limit near the model's window — `kernel/aws/resources/resources.ts:3` — open
- A chat whose summary fails after every reply is never cut, and breaks for good once past its
  model's window — `application/chat/services/chat-context.service.ts:75` — open
- `ChatContextService.compact` cuts a context under its limit too when called on one: the check
  is its caller's — `application/chat/services/reply-chat.service.ts:92` — open
- The service is named `ChatContextService`, where `naming.md` asks `<Aspect><Model>Service` of
  a service composed over a model's — `.claude/rules/naming.md` — open
