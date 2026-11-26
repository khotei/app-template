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
| L3 | A chat's context, what its reply sends the model, is cut once its last prompt and reply pass 0.8 of the tokens limit, down to 0.3, from a user message; its start is stored and a fixed note tells the model that earlier messages are not shown · visible: a chat past the upper share sends a context that starts later, and its list still shows every message | minimal | build | in progress |
| L4 | A cut keeps a summary of what it left out, stored and sent in place of the note · visible: after a cut, the next request opens with the summary | minimal | build | todo |
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

### Shape

The owner's, 2026-11-26, in their words, each answering a draft shown in the session:

- "I think this should one more service which will be injected"; "we should set it after response
  (in workder-reply service)".
- "maybe better call it ChatAssistantContext or something like that? At the end we get context for
  ai, and then set context. Maybe we need domain class which will calc it and then
  getContext({...}) setContext(ChatContext.calc)".
- "findStart -> findContext and return ChatContext"; "size -> tokensSize"; "window ->
  tokensLimit"; "answered.usage.promptTokens + answered.usage.outputTokens this also should be
  business rule"; "Others seems like ok"; "seems like ok! go ahead".
- "what if we will store usages on Chat? ... like total usages and current usages"; "like set chat
  json usages {total: totalUsages, context: contextUsageees, contextMessageStartId}"; "yes", to
  one column `chats.usage` with `total` and `context { tokensSize, startMessageId }`, written in
  the reply's transaction.

What they settled, as the last draft stood:

- Words: the history is every finished message of a chat; the context is what a reply sends the
  model, the messages from a stored start.
- `ChatContext` (`chat-context.model.ts`): `startMessageId`, none for the chat's first message,
  and `messages`.
- `ChatContextState` (`chat-context-state.ts`): `tokensSize(usage)`, a prompt's tokens and its
  reply's together; `findContext(context, tokensSize, tokensLimit)`, the context the next reply
  sends, none while `tokensSize` fits 0.8 of `tokensLimit`, else from the oldest user message
  whose tail holds at most 0.3 of it, the tokens taken as spread over the messages like their
  characters.
- `ContextChatService`: `getOne(where)`, the chat's messages from its stored start, and
  `update(where, context)`, which stores where the context starts.
- `ReplyChatService` orders them in the reply's transaction: it reads the context, replies, finds
  the next context and stores it with the chat's usage.
- A chat holds `usage` (`chats.usage`, jsonb, none until its first reply): `total`, the counts of
  its replies added up, and `context`, the tokens of the last prompt and reply (`tokensSize`) and
  the context's start (`startMessageId`). A Run keeps its own usage.
- The limit is the setting
  `LLM_REPLY_CONTEXT_TOKENS_LIMIT`; once a chat has a start, the request opens with a fixed note
  that earlier messages are not shown.

### Notes

- [DO] "seems like ok! go ahead".
- [N:ai] A chat had one updatable column, and an update wrote every field of the update variant,
  a missing one as its default: with `usage` beside `title`, a rename would have reset the usage.
  `ChatService.update` now hands the repository the named columns alone (L3.3).
- [Q:ai] The owner asked what happens when a user asks about messages no longer in the context:
  the model does not see them. Settled as the note in this step and a summary as L4.
- [D:ai] `ContextChatService.update(where, { context, usage })` takes the reply's usage beside
  the next context, and `ChatUsageState.add` is the rule it applies; the Shape named
  `update(where, context)` before the chat's usage was settled. Without it the flow would read
  the chat's usage itself to add to it.
- [D:ai] The limit is a field of `MessageAssistant`, `contextTokensLimit`, read from the setting
  beside its model, so every double of the assistant gives one. Without it `ReplyChatService`
  reads a setting of the kernel and each of its tests provides a config.
- [N:ai] Review of L3 (Intent, Hunt, Rules). Fixed: a chat with no tail within 0.3 of the limit
  was never cut and broke for good once past the model's window, shown by the review's probe
  (L3.8, the cut now starts at the newest user's message); a chat not found is handled once, in
  the tail of the reply's answer, and a case sends two replies over a store that holds to the id
  bound, the second prompting from the start the first stored, seen red with the bound removed
  (L3.9). Rejected: other names for `findContext` and `tokensSize`, the owner's words, and for
  `add`, which says its act; a variant in place of `ChatUpdate`, as no variant requires one of
  two fields; a commit apart for the fix of `ChatService.update`, which no test shows red before
  the column exists.

### Output

Proposed: a reply reads its chat's context, the messages from the start the chat's usage holds,
and in its transaction stores the chat's usage (`chats.usage`: the total of its replies, and the
context's `tokensSize` and `startMessageId`). Once a reply's prompt and text pass 0.8 of
`LLM_REPLY_CONTEXT_TOKENS_LIMIT`, the context is cut to the oldest user message whose tail holds
at most 0.3 of it, or to the newest user message; a cut context opens with a fixed note. The
chat's list still shows every message. See it: `make test-unit`, "reply after a cut prompts with
the chat's messages from the start the cut stored"; `make test-e2e`, the journey reads
`chats.usage` after a reply and the repository reads a chat's messages from an id; under
`make dev` with a low limit, `select usage from chats`.

## Knowledge

- [D] (the owner's "ok", 2026-11-26) A Run's usage is one jsonb column shaped as `failure`, tied
  to `done` by a check; it is read and written whole.
- [D] The usage stays off the wire until a client reads it.
- [D] A response with a count or the model's name missing fails the reply as an `LlmError`.

## Later

- Whether `usage` reaches the wire, for a cost shown in the chat — L1 — open
- A reply whose cache counts the provider sends as `null` has no case of its own: the package
  turns them into 0 today — `application/chat/__tests__/infrastructure/assistant.llm.test.ts:68` — open
- With Anthropic's `fallbacks` on, a response holds two `response-metadata` parts and
  `Arr.findFirst` keeps the model asked, not the one that answered; the app sends none —
  `application/chat/infrastructure/message-assistant.llm.ts:47` — open
- A chat whose newest user message and its reply hold more than 0.3 of the limit is cut to that
  message alone, and stays past 0.3 — `application/chat/domain/chat-context-state.ts:40` — open
- A chat's total counts its stored replies alone: an attempt the call's policy asked again, or a
  blank reply the decode refused, is billed and counted nowhere —
  `application/chat/infrastructure/message-assistant.llm.ts:55` — open
- A chat's `updatedAt`, which the wire holds, now moves on every reply, as the reply writes the
  chat's usage — `application/chat/services/context-chat.service.ts:52` — open
