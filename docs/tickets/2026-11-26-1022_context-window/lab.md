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
| L4 | A cut keeps a summary of what it left out, stored and sent in place of the note · visible: after a cut, the next request opens with the summary | minimal | build | in progress |
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
(`chats.context`: `startMessageId`, null until a cut). Once a reply's prompt and text pass 0.8 of
`LLM_REPLY_CONTEXT_TOKENS_LIMIT` (`ChatContextState.isOversized`), the context is cut
(`ChatContextState.cut`) to the oldest user message whose tail holds at most 0.3 of it, or to the
newest user message, and its start stored in the reply's transaction; a cut context opens with a
fixed note. The chat's list still shows every message. See it: `make test-unit`, "reply after a
cut prompts with the chat's messages from the start the cut stored"; `make test-e2e`, the
repository reads a chat's messages from an id and writes a chat's context; under `make dev` with
a low limit, `select context from chats`.

After the close, on the owner's word ("ok apply", 2026-11-26): the rule's check and its cut are
two statics, `isOversized` and `cut`, where one `findContext` held both; the chat's total and
`tokensSize`, which nothing read, are gone, a Run's usage holding the counts.

## L4 — A cut keeps a summary of what it left out

### Shape

The owner's, 2026-11-26: "ok apply" and "and continue", to a draft that showed the flow (the cut
found, `MessageAssistant.summarise` over the summary before and the messages left out, the text
stored beside the start, the next request opening with it) and three forks, each with a
proposal: the call in the reply's transaction, the reply's model, the summary beside
`startMessageId` in the chat's `context`. The forks stand as proposed, the owner having named
none.

### Notes

- [DO] "and continue".
- [D:ai] A summary that fails does not hold the cut back, where the draft said "no summary, no
  cut": the context is cut and keeps the summary it had, with a warning. A chat whose summary
  kept failing would never be cut, and would break for good once past its model's window, the
  defect L3's review found in another form.
- [D:ai] The call follows the reply's commit, where the draft had it in the reply's transaction
  (the review's finding, below).
- [D:ai] The note of L3 stays, for a cut context that holds no summary; the draft dropped it.
- [D:ai] `summarise` is a method of `MessageAssistant`, not an assistant of its own: it shares
  the reply's model and writes the message the reply's prompt reads back.
- [N:ai] Review of L3.11 and L4.1 (Intent, Hunt, Rules). Fixed in L4.2: the summary's call ran
  in the reply's transaction, the draft's first fork, so a handling past the worker's 600 s lost
  a finished reply (claimed; a unit test cannot show a rollback, as its transaction takes nothing
  back). The cut now follows the reply's commit: with the chat's total gone its context has one
  writer, a cut, and each write is a whole pair. Also: a summary longer than its `max_tokens`
  failed whole, so the prompt states a length and the bound is 8 000; the message a summary
  opens with says it may leave messages out, true of one a failed second summary kept; the
  warning is logged on a failure alone; a case starts from a chat that holds a summary;
  `cut` takes its two sizes as one object; `ChatContextStart` is `ChatContextCut`, as it holds
  the summary too. Rejected: a `Pick` for `cut`, which returns its context whole; a verb for
  `leftOut`, named as `tokensSize` is; the two commits' bodies, already pushed.

### Output

Proposed: a cut, found once the reply is committed, asks the reply's language model for a summary
of the messages it leaves out, the summary of an earlier cut among them, and stores it beside the
context's start (`chats.context.summary`); the next request opens with it, in place of the note.
A summary that fails leaves the cut in place with the summary it had. See it: `make test-unit`,
"reply whose prompt and text pass 0.8 of the assistant's tokens limit stores a later start of the
chat's context, with a summary of the messages before it", "reply opens the request of a cut
context with the summary it holds", "summarise asks the reply's language model …"; under
`make dev` with a low limit, `select context from chats`.

## Knowledge

- [D] (the owner's "ok", 2026-11-26) A Run's usage is one jsonb column shaped as `failure`, tied
  to `done` by a check; it is read and written whole.
- [D] The usage stays off the wire until a client reads it.
- [D] A response with a count or the model's name missing fails the reply as an `LlmError`.
- [D] (the owner's, 2026-11-26) The history is every finished message of a chat; the context is
  what a reply sends the model, the messages from a stored start.
- [D] (the owner's) A chat holds where its context starts as one jsonb column, `context`
  (`startMessageId`), written by a cut in the reply's transaction; a value nothing reads (a
  total of the replies' counts, the context's size) is not stored, a Run's usage holding them.
- [D] (the owner's) The cut is a rule of the domain (`ChatContextState`), read and stored through
  `ContextChatService`, and found after the reply, so a context's start holds between two cuts.
- [D] The limit is `MessageAssistant.contextTokensLimit`, so a reply's flow reads no setting.
- [D] A chat with no tail within the lower share is cut to its newest user message: a chat never
  cut breaks for good once past the model's window.

## Later

- Whether `usage` reaches the wire, for a cost shown in the chat — L1 — open
- A reply whose cache counts the provider sends as `null` has no case of its own: the package
  turns them into 0 today — `application/chat/__tests__/infrastructure/assistant.llm.test.ts:68` — open
- With Anthropic's `fallbacks` on, a response holds two `response-metadata` parts and
  `Arr.findFirst` keeps the model asked, not the one that answered; the app sends none —
  `application/chat/infrastructure/message-assistant.llm.ts:47` — open
- A chat whose newest user message and its reply hold more than 0.3 of the limit is cut to that
  message alone, and stays past 0.3 — `application/chat/domain/chat-context-state.ts:40` — open
- The tokens of a summary's call are stored nowhere: a Run's usage holds its reply's alone —
  `application/chat/infrastructure/message-assistant.llm.ts:111` — open
- A worker stopped during a summary's call logs "reply failed", though its Run is done; the cut
  is found again after the chat's next reply —
  `application/chat/services/reply-chat.service.ts:112` — open
- A summary that outlasts the worker's 600 s is never stored, so its chat is not cut; reachable
  only with a limit near the model's window — `kernel/aws/resources/resources.ts:3` — open
- A second cut whose summary fails keeps the first cut's summary, which says nothing of the
  messages that cut left out, as its opening line allows —
  `application/chat/services/reply-chat.service.ts:89` — open
