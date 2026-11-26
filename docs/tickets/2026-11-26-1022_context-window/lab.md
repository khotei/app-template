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
| L2 | The prompt of a chat's next reply starts with the prompt of its last one · visible: a test that fails when the system prompt or an earlier message's encoding changes between two replies | minimal | build | in progress |
| L3 | The history sent is cut when the last prompt and its reply pass a share of the window, down to a lower share, from a user message; the start is stored · visible: a chat past the upper share sends a history that starts later, and its list still shows every message | minimal | build | todo |
| L4 | A reply that fails for its length names the limit that ended it in the Run's failure text · visible: a test over `max_tokens` and `model_context_window_exceeded` | minimal | build | todo |
| L5 | Later: the items of the open list the owner picks | hard | build | todo |

## L1 — A done Run holds its usage and model

### Output

A done Run holds `usage` (`runs.usage`, jsonb): the model that answered, the prompt's tokens with
the cached ones counted in, the output's, and the cache-read and cache-write counts, read by
`MessageAssistant.reply` from the provider's response. The wire is unchanged. See it:
`make test-e2e` (a reply through the api ends `done` only with a usage, by `runs_usage_check`);
under `make dev`, after a reply, `select usage from runs`.

## L2 — The next prompt starts with the last one

### Shape

<The owner's. Until it is written, the draft below in Notes stands for it.>

### Notes

- [DO] The owner's "ok" to "Начинаю L2 (тест на неизменность кэшируемого префикса между двумя
  ответами одного чата)?".
- [D:ai] The check is one case of `assistant.llm.test.ts`, through `MessageAssistant.reply` over
  the recorded HTTP client: two replies of one chat, the second's history the first's with a reply
  and a new user message; the second request, its messages cut to the first's count, equals the
  first whole (model, system prompt, limits, cache setting, messages). No code changes: the reply
  already sends a stable prefix. Without it: nothing fails when a change marks the newest message
  or puts a per-request value in the prompt, and every reply then pays a cache write.
- [N:ai] Seen red on a probe: the newest message's text given a suffix made the case fail on
  `"What is this? (newest)"` against `"What is this?"`; the probe is reverted.
- [N:ai] Not caught: a system prompt that differs between two processes (a value read when the
  layer is built), as both requests of the case come from one layer.

### Output

Proposed: `make test-unit` holds a case, "reply sends a chat's next request with the last one's
model, system prompt and messages at its start", that fails when a chat's next request no longer
starts with its last one.

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
