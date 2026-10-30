# LLM providers

> Ticket: `2026-10-29-1435_llm-providers` · Source: [roadmap › 6](../../knowledge/roadmap.md#6-llm-providers),
> the user's note "take care of effect core ai modules", grilling on 2026-10-29
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

The assistant is a development stub: every chat gets the same canned sentence, word by word, and
the same canned title. A project started from the template cannot show a real conversation, and
the code around the model treats every provider failure alike: a wrong key is retried three
times like a dropped connection, and a refusal is indistinguishable from a crash.

## Goal

The assistant answers with a real Anthropic model, chosen by configuration, while the stub keeps
the template running without a key. Each reply is one request and one structured response: a
JSON object shaped by an Effect `Schema` that holds the text the user reads. Failures are told apart by what a retry can fix, a refusal has its own reason,
and the whole `effect/ai` toolkit is mapped: used where it serves this flow, documented where it
does not.

## Context

- **Starting point.** `main` at `e5838e1`. The worker's reply job streams text from the
  `Assistant` port and writes the growing text as snapshots every 300 ms; the title job asks for
  free text and cuts it to 120 characters. `AssistantLlm` adapts the port over `LanguageModel`,
  using only `LanguageModel`, `Prompt` and `Response`, and turns every provider error into a
  defect; `LanguageModelStub` (`packages/llm`) answers with canned text. The queue retries every
  failed reply attempt (three reply attempts, 1 s then 2 s apart, `chat-core` R18 as amended).
- **Where this ticket departs from its roadmap entry.** OpenAI, assistant-produced files and
  placeholders, prompt-template provenance beyond a hash, history trimming, token and cost
  accounting, budgets, the SSE tail and a recorded provider round trip are out (see Out of scope,
  with where each goes). Structured replies are new. Provenance lives in the reply's job in the
  outbox, not with the message as the roadmap entry says.
- **Requirements of `chat-core` this ticket amends.** R16 (snapshots while generating), R17
  (assistant turns in the prompt), R18 (which failures retry), R25 (how the title is asked). The
  amendments are R5, R8, R13–R17 and R19 below; `/ticket-implement` records them in
  `chat-core/feature.md` in the commit that changes the behaviour.
- **Requirements of `postgres-drizzle` this ticket amends.** R7 (a sent outbox entry is deleted):
  the relay keeps it, so the reply job's provenance stays readable.
- **Facts verified on 2026-10-29** by the `researcher` agent against the vendored
  `repos/effect` at 4.0.6 (equal to the installed `effect`), the npm registry and
  platform.claude.com:

  | Fact | Value |
  |---|---|
  | provider packages | `@effect/ai-anthropic@4.0.6` peers `effect ^4.0.6`; latest is 4.1.0. `@effect/ai-google` and `@effect/ai-amazon-bedrock` are still Effect v3 only |
  | Anthropic layers | `AnthropicClient.layerConfig({ apiKey, … })` needs an `HttpClient` and reads no environment variable by itself; `AnthropicLanguageModel.model(name, config)` gives a `Model` layer; `Config` spreads into the request, so top-level `cache_control`, `max_tokens`, `thinking` and effort pass through |
  | structured output | `LanguageModel.generateObject({ prompt, schema })` uses Anthropic's native `output_config.format` json_schema for the Claude 5 models (GA, no beta header). Length bounds are not sent; the codec enforces them on decode. A decode failure is `AiError` `StructuredOutputError`, retryable. Field `description` annotations reach the model. `generateObject` ignores the finish reason, so a refusal or a `max_tokens` cut surfaces as a decode failure unless the caller reads the finish reason |
  | streaming | no `streamObject`; `streamText` takes no schema; no partial-JSON parser in Effect |
  | `AiError` | 19 reasons; `isRetryable` per reason; `retryAfter` only on `RateLimitError`, parsed from `retry-after`. Anthropic maps 400/404/422 → `InvalidRequestError`, 401/403 → `AuthenticationError`, 429 → `RateLimitError`, 529 and 5xx → `InternalProviderError`; a prompt over the context window is a 400 `InvalidRequestError` |
  | refusal | Anthropic answers 200 with `stop_reason: "refusal"`, mapped to finish reason `content-filter`; `ContentPolicyError` exists but no provider raises it |
  | `max_tokens` | required by the API; the package falls back to the model's maximum (128 000 for the Claude 5 models). Anthropic: treat `stop_reason: "max_tokens"` as failed even when the JSON looks whole |
  | prompt caching | top-level `cache_control` moves the breakpoint with the growing history, 5 min lifetime by default; reads cost 5% of input on Sonnet 5.5, writes 125%. Changing `system` or the schema's structure invalidates the cache; changing a field `description` does not. Below 512 tokens a prefix is not cached, silently |
  | system prompt | the first system message becomes Anthropic's top-level `system`; Anthropic injects its own format instructions with structured output, so restating the schema duplicates them; asking for reasoning invites a `reasoning_extraction` refusal; `temperature` must be omitted on these models |
  | `Tokenizer` | no provider implements it |
  | user attachments | Anthropic takes images (base64), PDF and plain text natively; `.docx`, `.xlsx` and audio are not accepted by any block or model |

- **Terms** come from [docs/knowledge/glossary.md](../../knowledge/glossary.md): Chat, Message,
  Message stage, Title, Attachment, Assistant. Changed by this grilling: the `generating` stage
  no longer has a growing text.

## Scope

- The Anthropic provider and the stub, chosen by configuration; two models, one for replies and
  one for titles.
- The reply as one structured response (its text) defined by an Effect `Schema`, with a fixed
  system prompt.
- Failures told apart by `AiError`: no retry for what a retry cannot fix, a rate limit's wait
  honoured, a refusal stored as its own reason.
- The title as a structured response.
- Prompt caching on the reply; explicit output limits and thinking settings per purpose.
- Provenance (provider, model, instructions hash) stored with the reply's job in the outbox.
- `docs/knowledge/ai.md`: every `effect/ai` module, where it is used or why not, and how to
  change the prompt or the schema.

## Out of scope

- **OpenAI**: a new roadmap entry, `openai-provider`. **Claude on Amazon Bedrock**: a new
  roadmap entry, `bedrock-provider`, after `aws-deployment` (9), since only a deployed stack has
  the IAM role to test it and MiniStack emulates neither the endpoint nor structured output.
- **Files beyond today's**, the way the Claude apps do it: Word, Excel, PowerPoint, CSV and
  Markdown read by the assistant; Word, Excel, PowerPoint, PDF, CSV and PNG produced by it;
  placeholders; audio. A new roadmap entry, `assistant-files`, which keeps this grilling's facts
  (code execution, Files API, Skills, the gaps in `@effect/ai-anthropic`).
- **Trimming the history to the context window.** A chat whose history outgrows the model's
  window fails every later reply (R17). A new roadmap entry, `context-window`.
- **Token and cost accounting:** the provider's dashboard shows usage per key. A ledger per chat
  can come later as its own ticket.
- **Budgets** (per-user quotas, reply deadlines) and a **recorded provider round trip** in tests.
- **Streaming the reply**, and the SSE tail: the reply arrives whole (R5); the SSE tail goes to
  `web-app` (7).
- **Follow-ups** (questions the assistant suggests next, beside its text): dropped at
  architecture; a later ticket can add a field to the reply schema.
- Upgrading `effect` to 4.1.0.

## Requirements

### Provider

- **R1** — WHERE the provider setting is `anthropic`, THE SYSTEM SHALL answer assistant messages
  with the model named by the reply-model setting and titles with the model named by the
  title-model setting, authenticating with the API key read from the environment as a secret.
- **R2** — WHERE the provider setting is `stub`, THE SYSTEM SHALL answer replies and titles with
  a built-in stub that needs no key and no network and whose answers pass the same schemas as a
  provider's.
- **R3** — IF the provider setting is missing or names no known provider, or `anthropic` is set
  without its key or either model setting, THEN the worker SHALL fail at startup with an error
  that names the missing or invalid setting.
- **R4** — WHEN the unit and e2e tests run, THE SYSTEM SHALL reach no provider over the network
  and need no key.

### Reply

- **R5** — WHILE the worker handles an assistant-message job, THE SYSTEM SHALL set the message to
  `preparing` on taking the job and to `generating` when the request is sent, ask the reply model
  once for a reply, and WHEN the reply passes the reply schema, set the message `done` with
  its text in one write; no text is written before that. *Amends `chat-core` R16.* *Amended by
  the repository refactor on this branch: `completed` is the message status `done` (`chat-core`
  R15).*
- **R6** — THE reply schema SHALL hold one field, a text that is non-empty after trimming; its
  meaning SHALL reach the model as the field's description in the schema.
- **R7** — *Dropped at architecture (2026-10-29):* the reply carries no follow-ups, so the api
  returns nothing new.
- **R8** — WHEN the worker builds the reply prompt, THE SYSTEM SHALL send the system prompt, then
  every `done` message of the chat in creation order: a user message as its text and its
  attachments as files, as today, and an assistant message as its text. *Amends `chat-core`
  R17.*
- **R9** — THE system prompt SHALL be fixed text that states the assistant's role and rules; it
  SHALL NOT restate the reply schema, ask for the assistant's reasoning, or vary per request (no
  date, no user data).
- **R10** — WHEN the reply request is sent to Anthropic, THE SYSTEM SHALL ask for the request's
  prefix to be cached with the default five-minute lifetime.
- **R11** — THE SYSTEM SHALL cap a reply at 16 000 output tokens with the model's default effort
  and thinking, and a title at 1 000 output tokens with the lowest effort and thinking off.
- **R12** — WHEN the api queues a reply's job, THE SYSTEM SHALL store with that job in the outbox
  the configured provider, the configured reply model and a hash of the instructions (the system
  prompt and the reply schema together), read without the provider's key; the worker that
  answers may run another model while a deploy rolls out, and no api response SHALL carry them.

### Failures

- **R13** — IF the provider rejects the request with an error a retry cannot fix (an invalid or
  unauthorised key, an invalid request, an exhausted quota), THEN THE SYSTEM SHALL set the message
  `failed` with reason `ReplyFailed` at once, spending no further attempt. *Amends `chat-core`
  R18.*
- **R14** — IF the provider reports a rate limit with a wait of at most 30 seconds, THEN THE
  SYSTEM SHALL start the next attempt no sooner than that wait; IF the wait exceeds 30 seconds,
  THEN THE SYSTEM SHALL set the message `failed` with reason `ReplyFailed` at once. *Amends
  `chat-core` R18.*
- **R15** — IF an attempt fails because the provider is overloaded or erred internally, the
  network failed, the reply did not pass the reply schema, or the reply was cut by the output
  limit, THEN THE SYSTEM SHALL ask again within the same job, three requests in all, 1 s then
  2 s apart as `chat-core` R18 counts them, and WHEN the requests are exhausted, set the message
  `failed` with reason `ReplyFailed`. *Amends `chat-core` R18.*
- **R16** — IF the model declines to answer, THEN THE SYSTEM SHALL set the message `failed` with
  reason `ReplyRefused` and a user-facing sentence of its own, keep no text, and not retry.
- **R17** — IF the chat's history no longer fits the model's context window, THEN THE SYSTEM
  SHALL set the message `failed` with reason `ReplyFailed` without retrying, as R13 states; this
  is a known limitation until `context-window`.
- **R18** — IF a failure carries provider detail, THEN THE SYSTEM SHALL keep it in the failure's
  cause for operators only, as `chat-core` R18 states; the user-facing sentence names no
  provider, model or error code.

### Title

- **R19** — WHILE the worker handles the title job, THE SYSTEM SHALL ask the title model for a
  title in the language of the first message, as a structured response whose title is non-empty
  and at most 120 characters once trimmed; IF the answer fails that schema, THEN THE SYSTEM
  SHALL ask again within the same job, five requests in all, 1, 2, 4 and 8 s apart; R13 and R14
  apply to the title job as to the reply, and a refusal stops it at once as R13 does. The rest
  of `chat-core` R25 stands: a user's title is never overwritten, a blank first message asks no
  model, and exhausted requests leave the chat untitled with a log. *Amends `chat-core` R25.*

### Docs and configuration

- **R20** — `docs/knowledge/ai.md` SHALL list every `effect/ai` module at the installed version,
  each with where this codebase uses it or why it does not, and SHALL say how to change the
  system prompt or the reply schema and what each change does to the prompt cache.
- **R21** — `.env.example` SHALL set the provider to `stub` and list the API key and both model
  settings commented out, so a fresh clone runs without a key.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | With `LLM_PROVIDER=anthropic`, a key and both models in `.env`, `make dev`, send a message: the message reaches `done` with a reply in the language asked, and the chat gets a title. A unit test over a fake `HttpClient` shows the reply request names the reply model and the title request the title model |
| R2 | With `LLM_PROVIDER=stub` and no key, `make dev`, send a message: the message reaches `done` with the stub's text, and the chat gets the stub's title |
| R3 | `LLM_PROVIDER` unset, then `anthropic` without the key: the worker exits at startup, each time with an error naming the setting |
| R4 | `make test` passes with no key in the environment and the network disabled for the provider host |
| R5 | A unit test on a fake model records the stages written: `preparing`, `generating`, then one `done` write carrying the text; no write in between |
| R6 | Unit tests: a reply with a blank text fails the schema, one with text passes. A test reads the JSON Schema sent and finds a description on the field |
| R7 | — (dropped) |
| R8 | A unit test on a fake model reads the prompt: the system message first, user turns with their text and files, assistant turns as their text, failed and active messages absent |
| R9 | Review of the system prompt in the `/ticket-verify` pass: role and rules only; a unit test asserts it is equal across two requests of different chats |
| R10 | A unit test over a fake `HttpClient` shows the reply request carries a top-level `cache_control` of type `ephemeral` without a `ttl` |
| R11 | A unit test over a fake `HttpClient` shows `max_tokens` 16 000 on the reply request, and 1 000, the lowest effort and thinking disabled on the title request |
| R12 | A unit test shows the send queues the reply job with the configured provider, model and hash, and the title job without them; an e2e test reads them in the outbox row's body, and the relay keeps the row once sent; a unit test shows the hash changes when the system prompt or the schema changes, and the provider and model are read with no key set; the message, and so every api response, has no provenance |
| R13 | Unit tests: the fake model fails with an authentication error, then with an invalid request: the message is `failed` with `ReplyFailed` after one attempt |
| R14 | Unit tests under `TestClock`: a rate limit with a 5 s wait is retried no sooner than 5 s; one with a 60 s wait fails the message at once |
| R15 | Unit tests: an overloaded provider, a reply failing the schema, and a reply cut by the output limit each consume an attempt and are retried; after the last one the message is `failed` with `ReplyFailed` |
| R16 | A unit test: the fake model finishes with a refusal: the message is `failed` with `ReplyRefused` after one attempt, its text empty |
| R17 | A unit test: the fake model fails with an invalid request: the message is `failed` with `ReplyFailed` after one attempt (the overlong prompt is that case, per the facts above) |
| R18 | For R13–R17, the api's response for the failed message carries the fixed sentence of its reason and no cause |
| R19 | Unit tests: a 121-character title and a blank title fail the schema and are retried; a valid one is set; an authentication error stops at once with the chat untitled and a log line |
| R20 | `docs/knowledge/ai.md` names each file of `effect/ai` at 4.0.6; `make doc-names` passes |
| R21 | `.env.example` has `LLM_PROVIDER="stub"` and the key and model lines commented out; a fresh clone runs `make dev` without editing them |

## Open questions

For `/ticket-architecture`.

### Q1 — Where does the retry of a provider failure live?

- **Why it matters:** R13–R15 need the failure's kind and the rate limit's wait; today the queue
  retries with a delay that depends only on the attempt number.
- **Options:** A — the port's error carries "retryable" and "wait at least"; the job stops at
  once on a non-retryable error and asks the queue for a later redelivery on a wait. One retry
  mechanism, the queue's. B — a decorator layer around the model retries in place with a
  `Schedule` reading `retryAfter`, and the queue only covers crashes. Two mechanisms stacked:
  attempts multiply.
- **Recommendation:** A, since the queue already owns attempts, dead letters and the last-attempt
  settling (`chat-core` D23).
- **Answer:** B, inside the adapter rather than as a decorator layer; the queue retries only
  crashes, so attempts do not multiply (architecture D1, D3). R15 and R19 now say so.

### Q2 — How is a refusal or an output-limit cut detected?

- **Why it matters:** `generateObject` decodes text without reading the finish reason, so R15
  and R16 cannot tell a refusal from a malformed reply.
- **Options:** A — read the finish part of the response before decoding, then decode with the
  schema; B — call `generateText` with the response format and decode ourselves.
- **Recommendation:** A if `generateObject`'s response exposes the finish reason on a decode
  failure; otherwise B. `researcher` to confirm.
- **Answer:** neither: `generateText` takes no response format, and the decode failure carries
  no finish reason. The finish part is read through `Telemetry.CurrentSpanTransformer` before
  the decode (architecture D4).

### Q3 — Where does provenance live?

- **Why it matters (before S7.2):** the glossary names the model only in `infrastructure`, yet
  R12 stores it with the message.
- **Options:** A — the `Assistant` port answers an opaque provenance (three strings) beside the
  reply, and the domain stores it without reading it; B — only the infrastructure row holds it,
  written by the adapter.
- **Recommendation:** A, since the domain service is the only writer of a message.
- **Answer:** A, as a value of the port fixed at startup, written by the `generating` move
  (architecture D6). *Revised in S7.2:* neither; the api writes it into the reply's job in the
  outbox, and the domain and the message never see it.

### Q4 — What does the stub do now that nothing streams?

- **Why it matters:** the stub's word-by-word delay existed so a dev poll would see the text grow.
- **Options:** A — answer the whole reply after a short fixed delay, so `generating` stays
  visible to a polling client; B — answer at once.
- **Recommendation:** A.
- **Answer:** A, the whole answer after 1 s (architecture D5).
