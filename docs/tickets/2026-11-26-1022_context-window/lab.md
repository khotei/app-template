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
- `ReplyChatService` orders them: it reads the context, replies, and after the reply's commit
  finds the next context and stores it; a failure there is logged and the Run stays done.
- The start is `chats.context_start_message_id`; the limit is the setting
  `LLM_REPLY_CONTEXT_TOKENS_LIMIT`; once a chat has a start, the request opens with a fixed note
  that earlier messages are not shown.

### Notes

- [DO] "seems like ok! go ahead".
- [Q:ai] The owner asked what happens when a user asks about messages no longer in the context:
  the model does not see them. Settled as the note in this step and a summary as L4.

### Output

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
- A chat whose newest user message alone is longer than 0.3 of the limit is not cut:
  `findContext` finds none — `application/chat/domain/chat-context-state.ts:26` — open
- A chat's total usage as a column the reply's transaction moves, asked by the owner ("what if we
  will store usages on Chat? ... like total usages and current usages"): the current one stays
  derived from the chat's newest Run; the total waits for a reader, the wire line above — L3 — open
