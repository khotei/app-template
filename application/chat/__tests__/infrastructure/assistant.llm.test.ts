import type { Generated } from '@effect/ai-anthropic'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Clock, ConfigProvider, Effect, Fiber, Layer, Ref } from 'effect'
import { HttpClient, type HttpClientRequest, HttpClientResponse } from 'effect/http'
import { TestClock } from 'effect/testing'

import { AnthropicClientFromConfig } from '@app-template/kernel/llm'
import type { LlmError } from '@app-template/kernel/llm/error'

import { AssistantReply } from '#chat/domain/assistant.model'
import { ChatTitle } from '#chat/domain/chat.model'
import type { Message } from '#chat/domain/message.model'
import { ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { assistantMessageAt, runUsage, userMessageAt } from '#testing/chat/chat.test-fixture'

type RequestBody = typeof Generated.BetaCreateMessageParams.Encoded

const readBody = (request: HttpClientRequest.HttpClientRequest): RequestBody =>
  request.body._tag === 'Uint8Array'
    ? JSON.parse(new TextDecoder().decode(request.body.body))
    : assert.fail(`a request body of ${request.body._tag}`)

/** Both assistants over Anthropic's client and an `HttpClient` that keeps each request body and its time, and responds to it by `respond`. */
function recordAnthropic(respond: () => Response) {
  const requests = Ref.makeUnsafe<
    ReadonlyArray<{ readonly body: RequestBody; readonly at: number }>
  >([])
  const httpClient = HttpClient.make((request) =>
    Clock.currentTimeMillis.pipe(
      Effect.flatMap((at) => Ref.update(requests, Arr.append({ body: readBody(request), at }))),
      Effect.as(HttpClientResponse.fromWeb(request, respond())),
    ),
  )
  const layer = Layer.mergeAll(MessageAssistant.layer, ChatAssistant.layer).pipe(
    Layer.provide(AnthropicClientFromConfig),
    Layer.provide([
      Layer.succeed(HttpClient.HttpClient, httpClient),
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          ANTHROPIC_API_KEY: 'sk-test-key',
          LLM_REPLY_MODEL: 'claude-sonnet-5-5',
          LLM_TITLE_MODEL: 'claude-haiku-5-5',
        }),
      ),
    ]),
  )
  return {
    bodies: Ref.get(requests).pipe(Effect.map(Arr.map(({ body }) => body))),
    sentAt: Ref.get(requests).pipe(Effect.map(Arr.map(({ at }) => at))),
    layer,
  }
}

/** A Messages API response whose one text block is `text`. */
const message = (text: string, stopReason: Generated.BetaStopReason = 'end_turn') =>
  Response.json({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 100,
      input_tokens: 10,
      output_tokens: 5,
      service_tier: null,
    },
  })

/** A Messages API error response. */
const apiError = (
  status: number,
  { text, headers = {} }: { readonly text: string; readonly headers?: Record<string, string> },
) =>
  Response.json(
    { type: 'error', error: { type: 'error', message: text }, request_id: null },
    { status, headers },
  )

const reply = Effect.fnUntraced(function* (history: ReadonlyArray<Message>) {
  const assistant = yield* MessageAssistant
  return yield* assistant.reply(history)
})

const proposeTitle = Effect.fnUntraced(function* (text: string) {
  const assistant = yield* ChatAssistant
  return yield* assistant.proposeTitle(text)
})

const hi = [userMessageAt(1, 'Hi')]

const lisbon = 'Plan a weekend in Lisbon'

describe('MessageAssistant and ChatAssistant', () => {
  it.effect(
    "reply asks the reply's language model with the system prompt and each message as its text, and returns the language model's text, its name and the usage, the prompt's tokens counted with the cached ones",
    () => {
      const { bodies, layer } = recordAnthropic(() => message('Hello'))
      return Effect.gen(function* () {
        const answer = yield* reply([
          userMessageAt(1, 'What is this?'),
          assistantMessageAt(2, 'A photo.'),
        ])

        const [body] = yield* bodies
        assert.strictEqual(body?.model, 'claude-sonnet-5-5')
        assert.include(body?.system, 'You are the assistant of a chat app')
        assert.deepStrictEqual(body?.messages, [
          { role: 'user', content: [{ type: 'text', text: 'What is this?', cache_control: null }] },
          { role: 'assistant', content: [{ type: 'text', text: 'A photo.' }] },
        ])
        assertEquals(
          answer,
          new AssistantReply({
            text: 'Hello',
            usage: runUsage,
          }),
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect(
    "reply sends a chat's next request with the last one's model, system prompt and messages at its start, so the provider's cache serves them",
    () => {
      const { bodies, layer } = recordAnthropic(() => message('A photo.'))
      const asked = [userMessageAt(1, 'What is this?')]
      return Effect.gen(function* () {
        yield* reply(asked)
        yield* reply([...asked, assistantMessageAt(2, 'A photo.'), userMessageAt(3, 'Of what?')])

        const [last, next] = yield* bodies
        assert.deepStrictEqual(Arr.take(next?.messages ?? [], asked.length), last?.messages)
        assert.deepStrictEqual({ ...next, messages: [] }, { ...last, messages: [] })
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect(
    "proposeTitle asks the title's language model with the title instruction and the opening message, and returns the title trimmed",
    () => {
      const { bodies, layer } = recordAnthropic(() => message('{"title":"  Lisbon weekend \\n"}'))
      return Effect.gen(function* () {
        const title = yield* proposeTitle(lisbon)

        const [body] = yield* bodies
        assert.strictEqual(body?.model, 'claude-haiku-5-5')
        assert.include(body?.system, 'Write a title of at most 120 characters')
        assert.deepStrictEqual(body?.messages, [
          { role: 'user', content: [{ type: 'text', text: lisbon, cache_control: null }] },
        ])
        assert.strictEqual(title, ChatTitle.make('Lisbon weekend'))
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect.each<{
    name: string
    ask: Effect.Effect<unknown, LlmError, MessageAssistant | ChatAssistant>
    answer: () => Response
    sentAt: ReadonlyArray<number>
    cause: string
  }>([
    {
      name: 'reply on a refusal',
      ask: reply(hi),
      answer: () => message('I cannot help with that.', 'refusal'),
      sentAt: [0],
      cause: 'content-filter',
    },
    {
      name: 'reply on an answer cut at max_tokens',
      ask: reply(hi),
      answer: () => message('Hel', 'max_tokens'),
      sentAt: [0],
      cause: 'length',
    },
    {
      name: 'reply on an answer stopped for a reason the package does not map',
      ask: reply(hi),
      answer: () => message('Hel', 'compaction'),
      sentAt: [0],
      cause: 'unknown',
    },
    {
      name: 'reply on a blank text',
      ask: reply(hi),
      answer: () => message(' \n'),
      sentAt: [0],
      cause: 'non-whitespace',
    },
    {
      name: 'reply on a 529',
      ask: reply(hi),
      answer: () => apiError(529, { text: 'Overloaded' }),
      sentAt: [0, 1_000, 3_000],
      cause: 'Overloaded',
    },
    {
      name: 'reply on a 429 with retry-after 5',
      ask: reply(hi),
      answer: () => apiError(429, { text: 'Rate limited', headers: { 'retry-after': '5' } }),
      sentAt: [0, 5_000, 10_000],
      cause: 'Rate limit',
    },
    {
      name: 'reply on a 429 with retry-after 60',
      ask: reply(hi),
      answer: () => apiError(429, { text: 'Rate limited', headers: { 'retry-after': '60' } }),
      sentAt: [0],
      cause: 'Rate limit',
    },
    {
      name: 'reply on a 401',
      ask: reply(hi),
      answer: () => apiError(401, { text: 'invalid x-api-key' }),
      sentAt: [0],
      cause: 'invalid x-api-key',
    },
    {
      name: 'proposeTitle on a title of 121 characters',
      ask: proposeTitle(lisbon),
      answer: () => message(JSON.stringify({ title: 'a'.repeat(121) })),
      sentAt: [0, 1_000, 3_000],
      cause: '120',
    },
    {
      name: 'proposeTitle on a refusal',
      ask: proposeTitle(lisbon),
      answer: () => message('{"title":"Lisbon weekend"}', 'refusal'),
      sentAt: [0],
      cause: 'content-filter',
    },
  ])(
    '$name fails with LlmError, its requests sent at $sentAt ms',
    ({ ask, answer, ...expected }) => {
      const { sentAt, layer } = recordAnthropic(answer)
      return Effect.gen(function* () {
        const failing = yield* ask.pipe(Effect.flip, Effect.forkChild)

        yield* TestClock.adjust('1 minute')

        const failure = yield* Fiber.join(failing)
        assertEquals(yield* sentAt, expected.sentAt)
        assert.include(failure.cause, expected.cause)
      }).pipe(Effect.provide(layer))
    },
  )
})
