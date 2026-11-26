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
| L1 | A Run that is done holds its reply's usage and the model that answered · visible: `make test-unit`; after a reply under `make dev`, `select usage from runs` shows the counts | minimal | build | in progress |
| L2 | The prompt of a chat's next reply starts with the prompt of its last one · visible: a test that fails when the system prompt or an earlier message's encoding changes between two replies | minimal | build | todo |
| L3 | The history sent is cut when the last prompt and its reply pass a share of the window, down to a lower share, from a user message; the start is stored · visible: a chat past the upper share sends a history that starts later, and its list still shows every message | minimal | build | todo |
| L4 | A reply that fails for its length names the limit that ended it in the Run's failure text · visible: a test over `max_tokens` and `model_context_window_exceeded` | minimal | build | todo |
| L5 | Later: the items of the open list the owner picks | hard | build | todo |

## L1 — A done Run holds its usage and model

### Shape

<The owner's. Until it is written, the draft below in Notes stands for it.>

### Notes

- [DO] "start execute": draft the Shape and build L1.
- [N:ai] The entry's facts this step rests on, re-read at `effect` and `@effect/ai-anthropic`
  4.1.5: `Response.Usage` holds `inputTokens.{uncached,total,cacheRead,cacheWrite}` and
  `outputTokens.total`, each `Schema.optional(Schema.Int)`
  (`repos/effect/packages/effect/src/ai/Response.ts:2461`); the Anthropic package fills all of
  them, a null cache count as 0 (`repos/effect/packages/ai/anthropic/src/AnthropicLanguageModel.ts:2017`),
  and the response's `modelId` from `rawResponse.model` (`:1688`).
- [D:ai] One `jsonb` column `runs.usage`, null until the Run is done, shaped as its neighbour
  `failure` is: `{ model, promptTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`,
  `promptTokens` being `inputTokens.total` (uncached, cache-read and cache-write together), which
  is the size L3 reads. A check ties it to `done`, as `runs_failure_check` ties `failure` to
  `failed`. Without it: five nullable columns and five checks for one value read whole. Loses: a
  plain `sum(prompt_tokens)`; an operator writes `sum((usage->>'promptTokens')::int)`.
- [D:ai] The schema is `RunUsage` in `run.model.ts`, beside `RunFailure`, and a field of
  `AssistantReply`; `Run.usage` is `Option<RunUsage>`, and `RunMove.complete(run, replyId, usage)`
  sets it. (In `assistant.model.ts` it closed a cycle, message → run → assistant → message, which
  `make lint` refused.)
  `MessageAssistant.reply` decodes it from the response, so a response with a count or the model
  missing fails the reply as an `LlmError`, which the Anthropic package never produces.
- [D:ai] `usage` stays off the wire (`Model.Sensitive`, as `failure`): no client reads it yet, and
  a wire field is a contract. "A cost its owner can see" is an operator's SQL in this pass.

- [N:ai] Review of L1 (Intent, Hunt, Rules), no defect found. Fixed as L1.3: the doc of
  `RunMove.complete` said "cost" for the glossary's "usage"; a model test of what `Schema.Struct`
  guarantees is dropped. Rejected: a case at the adapter for a response with a count or the name
  missing, as the Anthropic package fills each (`AnthropicLanguageModel.ts:1688`, `:2019`) and no
  response reaches that path; the unsourced fact in L1.1's `Decision:`, whose source is the note
  above.

### Output

Proposed: a done Run holds `usage` (`runs.usage`, jsonb): the model that answered, the prompt's
tokens with the cached ones counted in, the output's, and the cache-read and cache-write counts,
read by `MessageAssistant.reply` from the provider's response. The wire is unchanged. See it:
`make test-e2e` (a reply through the api ends `done` only with a usage, by `runs_usage_check`);
under `make dev`, after a reply, `select usage from runs`.

## Knowledge

## Later

- Whether `usage` reaches the wire, for a cost shown in the chat — L1 — open
- A reply whose cache counts the provider sends as `null` has no case of its own: the package
  turns them into 0 today — `application/chat/__tests__/infrastructure/assistant.llm.test.ts:68` — open
- With Anthropic's `fallbacks` on, a response holds two `response-metadata` parts and
  `Arr.findFirst` keeps the model asked, not the one that answered; the app sends none —
  `application/chat/infrastructure/message-assistant.llm.ts:47` — open
