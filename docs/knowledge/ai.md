# AI

How the assistant asks a language model for a reply or a title, which parts of `effect/ai` and
`@effect/ai-anthropic` it uses, and what to know before changing its prompt or the title's schema.
The code: the chat module's two services in its `infrastructure/`, one per answer asked of the
language model, `MessageAssistant` (the reply: the system prompt and the reply's language model
of `LLM_REPLY_MODEL`) and `ChatAssistant` (the title: its instruction, its schema and the title's
language model of `LLM_TITLE_MODEL`), each an `AnthropicLanguageModel` with its settings; in
`@app-template/kernel/llm` the one function both pipe, `askModel` (the retries, the finish-reason
check and the failure mapping), and `AnthropicClientFromConfig` (Anthropic's client with the key of
`ANTHROPIC_API_KEY`); in `@app-template/kernel/llm/error` its one error, `LlmError`; and those
settings in `@app-template/kernel/config`.
The assistants' suite runs over a fake `HttpClient` that returns canned Anthropic bodies, so no
test needs a key or the network.

Every module named here is unstable at the pinned version: check an API against the vendored
sources (`repos/effect/packages/effect/src/ai/`, `repos/effect/packages/ai/anthropic/src/`)
before using it, and read this page again after an upgrade.

## The request

```mermaid
graph LR
  M["MessageAssistant.reply<br/>generateText"] --> R["askModel<br/>retries · finish reason · errors"]
  T["ChatAssistant.proposeTitle<br/>generateObject"] --> R
  R --> A["AnthropicLanguageModel<br/>model, prompt as system, settings"]
  A --> K["AnthropicClientFromConfig<br/>AnthropicClient · HttpClient"]
```

1. Each language model sends its fixed prompt as the request's `system`, set in its `config`: the
   system prompt for a reply, the title instruction for a title. A prompt that asks the language
   model to show its reasoning invites a refusal.
2. `MessageAssistant.reply` calls `generateText` on the reply's language model with the chat's
   context ([below](#the-context-and-its-cut)): each message, the user's and the assistant's, as
   its text. A failed Run leaves no reply, so two
   user messages may follow each other: `@effect/ai-anthropic` folds them into one, and the
   Messages API takes either shape. The text is decoded as the domain's `AssistantReply`, which
   drops U+0000 (a text column refuses it), then fails a blank reply by the message's own check.
   Nothing streams: the answer arrives whole.
3. `ChatAssistant.proposeTitle` calls `generateObject` on the title's language model with the opening
   message and `TitleObject`, which the package sends as `output_config.format` (Anthropic's
   native structured output). The schema's checks are not sent: the instruction states the
   language and the 120-character bound; the decode of the JSON answer trims the title and
   enforces the bound.

## The context and its cut

A chat's context is what its reply sends the language model: the chat's messages from the start the
chat stores (`messages.getMany` with `id: { from }`), opened by the latest summary of those before
it, which `ChatContextTokenizer.withContext` puts first. The assistants take that list ready and
only encode it. The history, every message of the chat, stays in the database and in the chat's
list. After each reply, once it is committed, `ReplyChatService` asks
`ChatContextPolicy.isOverLimit` whether the context is due a cut:

- while the last prompt's tokens and its reply's fit 0.8 of `LLM_REPLY_CONTEXT_TOKENS_LIMIT`, the
  context stays as it is, and the chat is not written;
- past that, `ChatContextTokenizer.compact` keeps the messages from the oldest user message whose
  tail holds at most 0.3 of the limit, the tokens taken as spread over the messages like their
  characters; the rest are summarised, and the summary is stored on the chat with the first
  message kept (`chats.context`: `latestSummary`, `startMessageId`).

The cut is rare and large on purpose: the provider's cache matches a prefix, so each cut rewrites
the cache once, and between two cuts a chat's next request starts with its last one, which a case
of the assistants' suite holds. When no tail fits 0.3 of the limit, the context starts at the
newest user message, the least a reply needs.

A cut keeps a summary of what it leaves out: `MessageAssistant.summarise` asks the reply's
language model, under a system prompt of its own, for a summary of the messages the cut leaves
out, the summary of an earlier cut among them, and the cut context opens with it as a user
message. The call follows the reply's commit, as it is long and one that ends badly must cost no
reply; the summary and the start are one write, so two replies of one chat that cut at
once each store a whole pair. A cut context always holds a summary: one that fails is logged as
a warning and leaves the context as it was, for the chat's next reply to cut.

The e2e journey runs no language model: its stand gives the worker a scripted `MessageAssistant`
and `ChatAssistant` ([tooling.md › Tests](tooling.md#tests)), so only the assistants' suite
covers these steps.

## Request settings per purpose

| Purpose | Settings | Sent |
|---|---|---|
| reply | `LLM_REPLY_MODEL`, `LLM_REPLY_CONTEXT_TOKENS_LIMIT` (kept by the worker, never sent) | `max_tokens` 16 000, top-level `cache_control: { type: 'ephemeral' }`; effort and thinking left to the language model's default |
| summary | `LLM_REPLY_MODEL` | `max_tokens` 8 000, the prompt asking for at most 1000 words; no cache; effort and thinking left to the language model's default |
| title | `LLM_TITLE_MODEL` | `max_tokens` 1 000, `output_config.effort: 'low'`, `thinking: { type: 'disabled' }`; no cache |

- **The title's language model must accept `thinking: { type: 'disabled' }`.** Sonnet 5.5 rejects
  it, so a title's language model set to Sonnet 5.5 fails every title request with a 400, which is
  not retried; `.env.example` names a language model that accepts it.
- No `temperature` is sent: the package sends none by default, and the Claude 5 models want it
  left out.
- Anthropic's requests wait up to 10 minutes for a byte (`transformClient` on
  `AnthropicClient.layer` in `AnthropicClientFromConfig`): Bun's `fetch` cuts a silent request at
  360 s, and a non-streamed answer of 16 000 tokens arrives only at the end.

## Failures and retries

`askModel` asks again in place only what the provider marks retryable, and lets out of either
assistant only a final failure, as one `LlmError`; the use cases turn it into a failed Run,
which keeps the error's full text, or an untitled chat. A
job is never retried ([aws.md › Queues](aws.md#queues)).

| Failure | Asked again |
|---|---|
| an `AiError` whose `isRetryable` holds (5xx, 529, a rate limit, a transport error, a title that fails its schema) and whose `retryAfter` is at most 30 s | twice, 1 s then 2 s apart, never before `retryAfter` |
| a rate limit asking a longer wait, such as a daily token limit | no |
| any other `AiError` (401/403, 400/404/422, an overlong prompt, no credit) | no |
| an answer that finished any other way than `stop` (`content-filter` for Anthropic's `refusal`, `length` at `max_tokens`, `unknown` for a stop reason the package does not map), or a blank reply | no: `LlmError`, its partial text dropped |

The final error's `cause` is the `AiError`'s message, the finish reason or a blank reply's decode
error, for operators: the use cases log it, a failed Run keeps it as its failure's `cause`, and
the api's wire shapes omit it.

### The finish reason

`askModel` reads `finishReason` after its retries, so an answer that did not finish fails at
once, even when its text reads whole. A title cut at `max_tokens` inside its JSON, or refused as
prose, fails `generateObject`'s decode first: `StructuredOutputError` carries no finish reason, so
it is asked again as a malformed answer and ends as `LlmError`, a refusal too. The
title's use case logs either and leaves the chat untitled.

## Prompt caching

- **What is cached.** The reply request's top-level `cache_control` puts the cache breakpoint on
  its last block, so it moves with the growing history: the next reply in the same chat, within
  the 5-minute lifetime, reads the whole earlier prefix (system prompt, then messages). On
  Sonnet 5.5 a read costs 10% of the input price and a write 125%. The title request is not
  cached.
- **The 512-token floor.** Anthropic caches no prefix shorter than 512 tokens on the 5.5 models
  (1 024 on Sonnet 5), and says nothing: the request runs uncached with no error. The system
  prompt alone is far below it, so two chats never share a cached prefix; a chat starts reading
  its cache once its history passes the floor. `usage.cache_creation_input_tokens` and
  `usage.cache_read_input_tokens` both 0 means nothing was cached.
- **What breaks it.** A cache belongs to one language model and one prefix. Changing the reply's
  language model, the system prompt, the thinking setting or the effort invalidates every chat's
  cached prefix once; the next reply of each chat writes it again at the write price.

## Modules left unused

Four Effect modules of `effect/ai` a reader would reach for are left alone on purpose: `Chat`, since
the history lives in the database and every request is rebuilt from it; `Model`, since each
assistant holds its one `LanguageModel` value; `ResponseIdTracker`, since Anthropic's Messages API
keeps no server-side history; and `AnthropicConfig`, since the wait is set once, on
`AnthropicClient.layer`, for every request. What every other Effect module of the two vendored
folders is: its first comment.
