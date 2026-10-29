# LLM providers — plan

> Ticket: `2026-10-29-1435_llm-providers` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | the reply is written once, whole; no snapshots | done |
| S2 | Anthropic or the stub, chosen by `LLM_PROVIDER`; a model per purpose | todo |
| S3 | the reply as a structured response with a fixed system prompt; per-purpose request settings | todo |
| S4 | the port's two final errors, settled by the use cases | todo |
| S5 | reply failures told apart, retried in place, a refusal kept apart | todo |
| S6 | the title as a structured response with its own retries | todo |
| S7 | provenance stored with each assistant message, never on the wire | todo |
| S8 | `docs/knowledge/ai.md`: every `effect/ai` module mapped | todo |

## How to run this plan

- Branch `feat/llm-providers`; one commit per step, after the user's OK (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines;
  `bun.lock` and a migration's generated `snapshot.json` excluded).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.
- The steps run in order: each later one edits `assistant.llm.ts`, its suite or the port that the
  one before it changed, so none runs in parallel.
- A step that changes what a `chat-core` requirement asks amends it in
  `docs/tickets/2026-10-17-1748_chat-core/feature.md` in the same commit, in that file's form
  with the ticket named, since `chat-core` has steps of its own: *Amended in `llm-providers`
  S<n>: <what changed>.* R16 in S1, R17 in S3, R18 in S5, R25 in S6.
- Every request to Anthropic in a test goes through a fake `HttpClient` (`HttpClient.makeWith` +
  `HttpClientResponse.fromWeb`); the canned bodies copy
  `repos/effect/packages/ai/anthropic/test/AnthropicLanguageModel.test.ts`. No test reads `.env`
  or reaches the network (R4).
- Every step writes its code by `.claude/rules/effect-style.md › Composition`.
- The e2e suites need Docker running; the user starts it by hand. `make dev` with a real key is the
  user's manual check (R1); the steps verify by `make check` and the stub.

## Steps

#### S1 — The reply arrives whole

- **Delivers:** the worker asks the assistant once and writes the reply `completed` with its text
  in one write; the `generating` stage no longer carries a growing text, and the 300 ms snapshots
  are gone. The adapter still reads the stub's stream underneath, collected into one text.
- **Goal:** the port answers a whole reply, the use case writes it once (R5, R6's bound; D7).
- **Blocked by:** none.
- **Files:**
  - `domain/chat/assistant.model.ts` (new: `AssistantReply`, a `text` non-empty after trimming),
    `domain/chat/assistant.port.ts` (`streamText` → `reply(history): Effect<AssistantReply>`, no
    error channel yet), `domain/chat/index.ts`;
  - `domain/chat/message.model.ts` (− `snapshotMessage`), `domain/chat/message.service.ts`
    (− `snapshot`);
  - `domain/testing/assistant.test-fake.ts` (`recordAssistant` scripts `reply`; the call is
    `{ method: 'reply', history }`);
  - `application/chat/generate-assistant-message.use-case.ts` (− `snapshotInterval`,
    `writeSnapshot`, `streamReply`; `generate` completes with the reply's text);
  - `infrastructure/chat/assistant.llm.ts` (`reply` runs `model.streamText`, joins the deltas and
    builds an `AssistantReply`; a blank answer is a defect until S5);
  - suites: `domain/tests/chat/assistant.model.test.ts` (new), `message.model.test.ts`,
    `message.service.test.ts`, `application/tests/chat/generate-assistant-message.use-case.test.ts`,
    `apps/worker/tests/chat/assistant-message.handler.test.ts` (the "last snapshot's text" case
    goes; a crash on the last attempt fails the reply with no text),
    `infrastructure/tests/chat/assistant.llm.test.ts` (`streamText` → `reply`);
  - `README.md` (line 16's snapshots, the sequence diagram's snapshot step, the polling
    comment "its text grows");
    `docs/tickets/2026-10-17-1748_chat-core/feature.md` (R16 amended).
- **Test first:** Seam 4 (`GenerateAssistantMessageUseCase` over the memory layers and
  `recordAssistant`) — the stages written are `preparing`, `generating` with an empty text, then
  one `completed` carrying the text, with no write in between. Seam 7 — a blank `AssistantReply`
  text fails, one with text passes.
- **Verify:** `git grep -n "snapshot\|streamText" -- domain application apps/worker
  infrastructure/chat` is empty; `make check`.
- **Model:** fable high
- **Status:** done
- **Findings:**
  - Ran on `opus high`, not `fable high`: the user's choice.
  - The *Verify* grep cannot be empty: the step's own Files list keeps `model.streamText` in
    `assistant.llm.ts`, the stub's only way to answer until S2. It answers that one line alone;
    the port's `streamText` is gone everywhere.
  - Seam 7's bound sits in a new `domain/tests/chat/assistant.model.test.ts`, beside the model,
    as the Files list says; `architecture.md › Seams` now names both suites.
  - The worker's "crash on the last attempt fails the reply with no text" case joined the
    existing last-attempt test (`failed.text === ''`); the dead-letter test no longer starts from
    a `generating` text, since none can exist.
  - S1 changed what more of `chat-core` asks than R16: R14 (no partial text while
    `generating`), R19 (no snapshots to overwrite), its Context note on the worker job and the
    R11–R14 and R16–R19 acceptance rows carry the amendment too (round S1.2).

#### S2 — Choose the provider by configuration

- **Delivers:** the worker reads `LLM_PROVIDER` at startup and fails, naming the setting, when it
  is missing, unknown, or `anthropic` without its key or a model. `stub` runs as today with no
  key; `anthropic` answers replies and titles with two Anthropic models. The stub is a generic
  model that answers its whole text after 1 s.
- **Goal:** two models per purpose behind `AssistantModels`, chosen by `LlmConfig` (R1, R2, R3,
  R4, R21; D5).
- **Blocked by:** S1.
- **Files:**
  - `package.json` and `bun.lock` through `bun add --catalog=effect @effect/ai-anthropic@4.0.6`;
    `infrastructure/package.json` (+ `@effect/ai-anthropic` `catalog:effect`,
    `@app-template/llm` `workspace:*`), `infrastructure/tsconfig.json` (+ the
    `../packages/llm` reference); `apps/worker/package.json` and `apps/worker/tsconfig.json`
    (− `@app-template/llm` and its reference: `layer.ts` was its only importer);
  - `packages/config/config.ts` (+ `LlmConfig`, its `layer` over `Config.Literals`,
    `Config.Redacted('ANTHROPIC_API_KEY')`, `Config.String('LLM_REPLY_MODEL')`,
    `Config.String('LLM_TITLE_MODEL')`), `packages/config/tests/config.test.ts`;
  - `packages/llm/client.ts` (`LanguageModelStub` → `createLanguageModelStub({ text, delay })`,
    a `LanguageModel.LanguageModel` answering `text` whole after `delay`, by `generateText` and as
    one delta by `streamText`; `create`, not the architecture's `make`, by `naming.md › Symbols`);
  - `infrastructure/chat/assistant-models.client.ts` (new: `AssistantModels` with
    `layerAnthropic(options)`, `layerStub`, `layerFromConfig`; its `reply` and `title` are
    `LanguageModel.LanguageModel` values, which the architecture's contract calls
    `LanguageModel.Service`, a name 4.0.6 lacks; the Anthropic layer is two
    `AnthropicLanguageModel.make({ model })` over one `AnthropicClient.layer({ apiKey })`, with no
    request settings yet, S3 adds them), `infrastructure/chat/index.ts`;
  - `infrastructure/chat/assistant.llm.ts` (over `AssistantModels`: `reply` on `models.reply`,
    `suggestTitle` on `models.title`);
  - `apps/worker/layer.ts` (`AssistantModels.layerFromConfig` and `FetchHttpClient.layer`
    replace `LanguageModelStub`); `e2e/testing/stand.test-layer.ts` (`LLM_PROVIDER: 'stub'`);
  - `.env.example` (`LLM_PROVIDER="stub"`; `# ANTHROPIC_API_KEY=""`,
    `# LLM_REPLY_MODEL="claude-sonnet-5-5"`, `# LLM_TITLE_MODEL="claude-haiku-5-5"`; − the
    `LLM_API_KEY` line and its "Stubbed services" heading);
  - `infrastructure/tests/chat/assistant.llm.test.ts` (the fake model is now an `AssistantModels`);
  - `docs/knowledge/architecture.md` (the adapter row names `AssistantModels`),
    `infrastructure/CLAUDE.md` (− "`AssistantLlm` runs on `packages/llm`'s stub until…"),
    `README.md` (lines 19–20, "the language model is a stub that a real provider replaces
    later", and the `infrastructure/chat/` file line).
- **Test first:** Seam 6 (`LlmConfig.layer` over `ConfigProvider.fromUnknown`) — `stub` alone
  passes; no provider, `openai`, and `anthropic` without the key, then without
  `LLM_REPLY_MODEL`, each fail with an error naming the variable. Seam 3 (`AssistantLlm` over
  `AssistantModels.layerStub`, under `TestClock`) — the stub's reply and title come back after
  1 s.
- **Verify:** `make check`; `env -u ANTHROPIC_API_KEY make test` passes; `make dev-worker` with
  `LLM_PROVIDER` unset exits naming `LLM_PROVIDER`, with `LLM_PROVIDER=anthropic` and no key exits
  naming `ANTHROPIC_API_KEY`; with `LLM_PROVIDER=stub`, `make dev` and a sent message reaches
  `completed` with the stub's text.
- **Model:** fable high
- **Status:** todo

#### S3 — A structured reply with a fixed system prompt

- **Delivers:** each reply is one `generateObject` request: a fixed system prompt, then the
  chat's completed turns, answered as a JSON object whose `text` the user reads. The reply
  request caps output at 16 000 tokens and asks for the prefix to be cached; the title request
  caps at 1 000 tokens, lowest effort, thinking off. The stub answers the reply as canned JSON.
- **Goal:** R1 (a model per purpose, seen in the request), R6, R8, R9, R10, R11, R2 (the stub's
  reply passes the schema); D5, D7.
- **Blocked by:** S2.
- **Files:**
  - `infrastructure/chat/assistant.llm.ts` (the system prompt, `ReplyAnswer` with the field's
    `description`, `reply` by `LanguageModel.generateObject` on `models.reply`, decoded into
    `AssistantReply`);
  - `infrastructure/chat/assistant-models.client.ts` (the request settings per purpose, as
    `architecture.md › Contracts › AssistantModels` tabulates them, passed as
    `AnthropicLanguageModel.make({ model, config })`: `max_tokens` and `cache_control` at the top,
    effort as `output_config.effort`, `thinking: { type: 'disabled' }`; `layerStub`'s reply text
    is `{"text": …}`);
  - `infrastructure/tests/chat/assistant.llm.test.ts` (rewritten over
    `AssistantModels.layerAnthropic` and a fake `HttpClient`: the recorded request bodies);
  - `docs/tickets/2026-10-17-1748_chat-core/feature.md` (R17 amended).
- **Test first:** Seam 1 — the reply request names the reply model and the title request the
  title model; the reply's `system` holds the system prompt, equal for two chats; then user turns
  with text and image blocks and assistant turns as their text; the JSON Schema's `text` carries
  a `description`; top-level `cache_control` `{ type: 'ephemeral' }` with no `ttl`;
  `max_tokens` 16 000 on the reply, 1 000 with the lowest effort and thinking disabled on the
  title. Seam 3 — the stub's reply decodes into an `AssistantReply`.
- **Verify:** `make check`. V2: the canned response keeps only the fields `makeResponse` needs;
  the minimum goes in the findings. V1: whether Bun's `fetch` cuts a request that sends nothing
  for minutes, and with which error; if it does, `FetchHttpClient` gets an explicit timeout above
  the reply's worst case, recorded in the findings.
- **Model:** fable high
- **Status:** todo

#### S4 — The port's final errors, settled by the use cases

- **Delivers:** the assistant can now answer "refused" or "failed" instead of dying. The reply
  use case writes the message `failed` with `ReplyRefused` or `ReplyFailed`, each with its own
  user-facing sentence, and ends the job; the title use case logs and leaves the chat untitled.
  The adapter does not raise them yet (S5, S6), so the worker behaves as before.
- **Goal:** the port's error channel and its settling (R13, R16, R17, R18 at the use case; D2,
  D3).
- **Blocked by:** S3.
- **Files:**
  - `domain/chat/assistant.error.ts` (new: `AssistantRefusedError`, `AssistantFailedError`,
    each `{ cause: Schema.String }`), `domain/chat/assistant.port.ts` (both methods declare
    them), `domain/chat/index.ts`;
  - `domain/chat/message.model.ts` (`MessageFailure.reason` + `'ReplyRefused'`, its sentence in
    `failureMessages`);
  - `domain/testing/assistant.test-fake.ts` (a script may fail with either error);
  - `application/chat/generate-assistant-message.use-case.ts` (`AssistantRefusedError` →
    `ReplyRefused`, `AssistantFailedError` → `ReplyFailed`, `cause` from the error, through
    `settle`), `application/chat/generate-chat-title.use-case.ts` (a port error logs and ends);
  - `infrastructure/chat/assistant.llm.ts` (the type only: it still dies on a provider failure);
  - suites: `domain/tests/chat/message.model.test.ts`,
    `application/tests/chat/generate-assistant-message.use-case.test.ts`,
    `generate-chat-title.use-case.test.ts`, `apps/api/tests/chat/chat.handler.test.ts`;
  - `.claude/rules/effect-schema.md` (the "a port declares no error channel" line names the
    `Assistant` exception) and `.claude/rules/layering.md › Ports and domain services` (its
    first line restates the defect rule: it links to `effect-schema.md` instead).
- **Test first:** Seam 4 — the port fails with `AssistantRefusedError`: the message is `failed`
  with `ReplyRefused`, its text empty, after one call; with `AssistantFailedError`: `failed` with
  `ReplyFailed`; the job ends without an error either way. Seam 5 — the port fails: the chat
  stays untitled and a log line names the failure. Seam 7 — `ReplyRefused`'s sentence. Seam 9 —
  a `ReplyRefused` message on the wire carries its sentence and no `cause`.
- **Verify:** `make check`.
- **Model:** fable high
- **Status:** todo

#### S5 — Reply failures told apart and retried in place

- **Delivers:** a reply that fails for a reason a retry can fix is asked again within the job,
  three requests in all, 1 s then 2 s apart, honouring a rate limit's wait up to 30 s. A wrong
  key, an invalid request, a quota or a longer wait fail the message at once. A refusal fails it
  as `ReplyRefused` without a retry. The queue now retries only crashes.
- **Goal:** the failure mapping and the reply's schedule (R13, R14, R15, R16, R17, R18; D1, D4).
- **Blocked by:** S4.
- **Files:**
  - `infrastructure/chat/assistant.llm.ts` (the finish part kept per request through
    `Telemetry.CurrentSpanTransformer`, provided per request; the mapping of `architecture.md ›
    Contracts › Failure mapping`, read from the `AiError`'s `reason._tag`, `isRetryable` and
    `retryAfter`, so the reasons the table does not name (`QuotaExhaustedError`,
    `NetworkError`, `InvalidOutputError`, `ContentPolicyError`) fall to its last two rows; the
    reply schedule, each wait the larger of its delay and `retryAfter`; `cause` from the
    `AiError` or the finish reason);
  - `infrastructure/tests/chat/assistant.llm.test.ts` (one case per mapping row);
  - `docs/tickets/2026-10-17-1748_chat-core/feature.md` (R18 amended).
- **Test first:** Seam 1 under `TestClock` — a `stop_reason: "refusal"` answer, whole JSON or
  not: `AssistantRefusedError` after one request; `stop_reason: "max_tokens"`, a blank `text`, a
  529 and a 500: three requests, 1 s then 2 s apart, then `AssistantFailedError`; a 429 with
  `retry-after: 5`: the next request no sooner than 5 s; with `retry-after: 60`, a 401, a 403 and
  a 400: `AssistantFailedError` after one request.
- **Verify:** `make check`.
- **Model:** fable high
- **Status:** todo

#### S6 — A structured title with its own retries

- **Delivers:** the title is a JSON object whose title is non-empty and at most 120 characters
  once trimmed, asked of the title model; an answer that fails is asked again, five requests in
  all, 1, 2, 4 and 8 s apart. A wrong key, a long rate limit or a refusal stop at once, and the
  chat stays untitled with a log. The stub answers the title as canned JSON.
- **Goal:** R19, R2 (the stub's title passes the schema); D5, D7.
- **Blocked by:** S5.
- **Files:**
  - `infrastructure/chat/assistant.llm.ts` (`TitleAnswer` over a trimmed `ChatTitle` with the
    field's `description`; `suggestTitle` by `generateObject` on `models.title`, with S5's
    mapping and the title schedule; − the free-text instruction and the cut);
  - `infrastructure/chat/assistant-models.client.ts` (`layerStub`'s title text is
    `{"title": …}`);
  - `infrastructure/tests/chat/assistant.llm.test.ts`;
  - `docs/tickets/2026-10-17-1748_chat-core/feature.md` (R25 amended).
- **Test first:** Seam 1 under `TestClock` — a 121-character title and a blank one are asked
  again, 1, 2, 4 and 8 s apart, and the fifth failure is `AssistantFailedError`; a valid title
  with spaces around it decodes trimmed; a 401 and a refusal stop after one request. Seam 3 — the
  stub's title decodes into a `ChatTitle`.
- **Verify:** `make check`; with `LLM_PROVIDER=stub`, `make dev` and a first message titles the
  chat with the stub's title.
- **Model:** fable high
- **Status:** todo

#### S7 — Provenance stored with each assistant message

- **Delivers:** each assistant message stores who answered it once a model was asked: the
  provider, the model and a SHA-256 of the system prompt and the reply schema. It is written with
  the `generating` move, kept by `completed` and `failed`, and never leaves the api.
- **Goal:** R12; D6, D8.
- **Blocked by:** S6 (shares `assistant.llm.ts` and its suite; hashes S3's system prompt and
  reply schema).
- **Files:**
  - `domain/chat/message.model.ts` (+ `MessageProvenance`; `Message` + `provenance:
    Schema.Option(MessageProvenance)`; the builders set none; `generateMessage(message, {
    provenance, at })`), `domain/chat/message.service.ts` (`generate` takes the provenance);
  - `domain/chat/assistant.port.ts` (+ `replyProvenance`);
    `domain/testing/assistant.test-fake.ts` (a fixed `replyProvenance`),
    `domain/testing/chat.test-fixture.ts` (+ `provenance`);
  - `application/chat/generate-assistant-message.use-case.ts` (`generate` writes the port's
    `replyProvenance`);
  - `infrastructure/chat/assistant.llm.ts` (+ `generateInstructionsHash(systemPrompt, schema)`:
    `Crypto.digest('SHA-256', …)` over the prompt, a newline and `JSON.stringify` of
    `Schema.toJsonSchemaDocument(schema)`, the bytes as hex, a `PlatformError` a defect;
    `generate`, not the architecture's `hashInstructions`, by `naming.md › Symbols`;
    `replyProvenance` from `AssistantModels.provider` and `.replyModel`);
  - `infrastructure/chat/message.entity.ts` (+ `provenance` `jsonb`, decoded by
    `Schema.OptionFromNullOr(MessageProvenance)`); `infrastructure/db/migrations/<stamp>_message_provenance/`
    (`make migration NAME=message_provenance`);
  - `http-api/chat/chat.http.ts` (`Message` omits `provenance`);
  - suites: `domain/tests/chat/message.model.test.ts`, `message.service.test.ts`,
    `application/tests/chat/generate-assistant-message.use-case.test.ts`,
    `infrastructure/tests/chat/assistant.llm.test.ts`,
    `infrastructure/e2e/chat/message.repository.e2e.ts`, `apps/api/tests/chat/chat.handler.test.ts`;
  - `docs/knowledge/glossary.md` (+ **Provenance**: who answered an assistant message, with
    which instructions; operators only; with its `_Avoid_` line, as every entry has).
- **Test first:** Seam 2 — `generateInstructionsHash` changes with the system prompt and with the
  schema. Seam 4 — the `generating` write carries the port's provenance; `completed` and a
  `failed` after the call keep it; a message failed before `generating` has none. Seam 7 —
  `prepareMessage` keeps the provenance. Seam 8 — `provenance` survives a write and a read,
  `null` as none. Seam 9 — the api's message has no `provenance`.
- **Verify:** `make check` (its `migration-check` passes with the new folder); `make migrate` on
  the local stand applies it.
- **Model:** fable high
- **Status:** todo

#### S8 — Map the `effect/ai` toolkit

- **Delivers:** `docs/knowledge/ai.md` lists every `effect/ai` module at 4.0.6 and every
  `@effect/ai-anthropic` module, each with where the codebase uses it or why it does not; and
  says how to change the system prompt or the reply schema and what each change does to the
  prompt cache.
- **Goal:** R20.
- **Blocked by:** S7.
- **Files:** `docs/knowledge/ai.md` (new: the modules in `repos/effect/packages/effect/src/ai/`
  and `repos/effect/packages/ai/anthropic/src/`; the request flow from `AssistantLlm` through
  `AssistantModels`; the failure mapping and the retries; the finish-reason hook and its upgrade
  risk; prompt caching and the 512-token floor; how to change the prompt or the schema; that
  Sonnet 5.5 rejects `thinking: { type: 'disabled' }`, so `LLM_TITLE_MODEL` must name a model
  that accepts it);
  `CLAUDE.md`'s map or `docs/knowledge/architecture.md` (a link to `ai.md`); any rule or
  `CLAUDE.md` line that `ai.md` now restates, trimmed to a link. The module table stays despite
  `.claude/rules/claude-md.md › Hard limits` ("never list what `ls` reproduces"): R20 asks for it,
  and each row carries a decision `ls` cannot give, where the module is used or why not.
- **Test first:** `config only`.
- **Verify:** `make doc-names`; every file of `repos/effect/packages/effect/src/ai/*.ts` but
  `index.ts` has a row (`ls` against the table); `make check`.
- **Model:** opus medium
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S2, S3 |
| R2 | S2, S3, S6 |
| R3 | S2 |
| R4 | S2 |
| R5 | S1 |
| R6 | S1, S3 |
| R7 | — (dropped) |
| R8 | S3 |
| R9 | S3 |
| R10 | S3 |
| R11 | S3 |
| R12 | S7 |
| R13 | S4, S5 |
| R14 | S5 |
| R15 | S5 |
| R16 | S4, S5 |
| R17 | S4, S5 |
| R18 | S4, S5 |
| R19 | S4, S6 |
| R20 | S8 |
| R21 | S2 |
