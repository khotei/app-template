import type { Generated } from '@effect/ai-anthropic'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Clock, ConfigProvider, Effect, Fiber, Layer, Ref } from 'effect'
import { HttpClient, type HttpClientRequest, HttpClientResponse } from 'effect/http'
import { TestClock } from 'effect/testing'

import { epoch, png } from '@app-template/packages/testing'

import type { AssistantError } from '#chat/domain/assistant.error'
import { AssistantReply } from '#chat/domain/assistant.model'
import { Assistant, type HistoryMessage } from '#chat/domain/assistant.port'
import { AttachmentId } from '#chat/domain/attachment.id'
import { buildAttachment, FileName, FileSize, MediaType } from '#chat/domain/attachment.model'
import { ChatTitle } from '#chat/domain/chat.model'
import { AssistantLlmFromConfig } from '#chat/infrastructure/assistant.llm'
import { assistantMessageAt, owner, userMessageAt } from '#testing/chat/chat.test-fixture'

type RequestBody = typeof Generated.BetaCreateMessageParams.Encoded

const readBody = (request: HttpClientRequest.HttpClientRequest): RequestBody =>
  request.body._tag === 'Uint8Array'
    ? JSON.parse(new TextDecoder().decode(request.body.body))
    : assert.fail(`a request body of ${request.body._tag}`)

/** `AssistantLlmFromConfig` over an `HttpClient` that keeps each request body and its time, and answers it by `respond`. */
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
  const layer = AssistantLlmFromConfig.pipe(
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
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      input_tokens: 10,
      output_tokens: 5,
      service_tier: null,
    },
  })

/** A Messages API error response. */
const apiError = (
  status: number,
  { text, headers }: { readonly text: string; readonly headers?: Record<string, string> },
) =>
  Response.json(
    { type: 'error', error: { type: 'error', message: text }, request_id: null },
    { status, headers },
  )

const reply = (history: ReadonlyArray<HistoryMessage>) =>
  Assistant.use((assistant) => assistant.reply(history))

const suggestTitle = (text: string) => Assistant.use((assistant) => assistant.suggestTitle(text))

const hi: ReadonlyArray<HistoryMessage> = [{ message: userMessageAt(1, 'Hi'), attachments: [] }]

const lisbon = 'Plan a weekend in Lisbon'

const photo = buildAttachment({
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000040'),
  userId: owner,
  fileName: FileName.make('photo.png'),
  mediaType: MediaType.make('image/png'),
  size: FileSize.make(png.length),
  createdAt: epoch,
})

/** The package writes `cache_control: null` on every user block. */
const imageBlock = {
  type: 'image',
  source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgoA/w==' },
  cache_control: null,
} as const

describe('AssistantLlmFromConfig', () => {
  it.effect(
    "reply asks the reply model with the system prompt, user turns as their text and images, a blank text left out, and assistant turns as their text, and answers the model's text",
    () => {
      const { bodies, layer } = recordAnthropic(() => message('Hello'))
      return Effect.gen(function* () {
        const answer = yield* reply([
          {
            message: userMessageAt(1, 'What is this?'),
            attachments: [{ attachment: photo, bytes: png }],
          },
          { message: assistantMessageAt(2, 'A photo.'), attachments: [] },
          { message: userMessageAt(3, ' \n'), attachments: [{ attachment: photo, bytes: png }] },
        ])

        const [body] = yield* bodies
        assert.strictEqual(body?.model, 'claude-sonnet-5-5')
        assert.include(body?.system, 'You are the assistant of a chat app')
        assert.deepStrictEqual(body?.messages, [
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is this?', cache_control: null }, imageBlock],
          },
          { role: 'assistant', content: [{ type: 'text', text: 'A photo.' }] },
          { role: 'user', content: [imageBlock] },
        ])
        assertEquals(answer, new AssistantReply({ text: 'Hello' }))
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect(
    'suggestTitle asks the title model with the title instruction and the opening message, and answers the title trimmed',
    () => {
      const { bodies, layer } = recordAnthropic(() => message('{"title":"  Lisbon weekend \\n"}'))
      return Effect.gen(function* () {
        const title = yield* suggestTitle(lisbon)

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
    ask: Effect.Effect<unknown, AssistantError, Assistant>
    answer: () => Response
    sentAt: ReadonlyArray<number>
    error: AssistantError['_tag']
    cause: string
  }>([
    {
      name: 'reply on a refusal',
      ask: reply(hi),
      answer: () => message('I cannot help with that.', 'refusal'),
      sentAt: [0],
      error: 'AssistantRefusedError',
      cause: 'content-filter',
    },
    {
      name: 'reply on an answer cut at max_tokens',
      ask: reply(hi),
      answer: () => message('Hel', 'max_tokens'),
      sentAt: [0],
      error: 'AssistantFailedError',
      cause: 'length',
    },
    {
      name: 'reply on an answer stopped for a reason the package does not map',
      ask: reply(hi),
      answer: () => message('Hel', 'model_context_window_exceeded'),
      sentAt: [0],
      error: 'AssistantFailedError',
      cause: 'unknown',
    },
    {
      name: 'reply on a blank text',
      ask: reply(hi),
      answer: () => message(' \n'),
      sentAt: [0],
      error: 'AssistantFailedError',
      cause: 'non-whitespace',
    },
    {
      name: 'reply on a 529',
      ask: reply(hi),
      answer: () => apiError(529, { text: 'Overloaded' }),
      sentAt: [0, 1_000, 3_000],
      error: 'AssistantFailedError',
      cause: 'Overloaded',
    },
    {
      name: 'reply on a 429 with retry-after 5',
      ask: reply(hi),
      answer: () => apiError(429, { text: 'Rate limited', headers: { 'retry-after': '5' } }),
      sentAt: [0, 5_000, 10_000],
      error: 'AssistantFailedError',
      cause: 'Rate limit',
    },
    {
      name: 'reply on a 429 with retry-after 60',
      ask: reply(hi),
      answer: () => apiError(429, { text: 'Rate limited', headers: { 'retry-after': '60' } }),
      sentAt: [0],
      error: 'AssistantFailedError',
      cause: 'Rate limit',
    },
    {
      name: 'reply on a 401',
      ask: reply(hi),
      answer: () => apiError(401, { text: 'invalid x-api-key' }),
      sentAt: [0],
      error: 'AssistantFailedError',
      cause: 'invalid x-api-key',
    },
    {
      name: 'suggestTitle on a title of 121 characters',
      ask: suggestTitle(lisbon),
      answer: () => message(JSON.stringify({ title: 'a'.repeat(121) })),
      sentAt: [0, 1_000, 3_000, 7_000, 15_000],
      error: 'AssistantFailedError',
      cause: '120',
    },
    {
      name: 'suggestTitle on a refusal',
      ask: suggestTitle(lisbon),
      answer: () => message('{"title":"Lisbon weekend"}', 'refusal'),
      sentAt: [0],
      error: 'AssistantRefusedError',
      cause: 'content-filter',
    },
  ])('$name fails with $error, its requests sent at $sentAt ms', ({ ask, answer, ...expected }) => {
    const { sentAt, layer } = recordAnthropic(answer)
    return Effect.gen(function* () {
      const failing = yield* ask.pipe(Effect.flip, Effect.forkChild)

      yield* TestClock.adjust('1 minute')

      const failure = yield* Fiber.join(failing)
      assertEquals(yield* sentAt, expected.sentAt)
      assert.strictEqual(failure._tag, expected.error)
      assert.include(failure.cause, expected.cause)
    }).pipe(Effect.provide(layer))
  })
})
