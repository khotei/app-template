import type { Generated } from '@effect/ai-anthropic'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Clock, Effect, Exit, Fiber, Layer, Option, Redacted, Ref } from 'effect'
import { HttpClient, type HttpClientRequest, HttpClientResponse } from 'effect/http'
import { TestClock } from 'effect/testing'

import {
  Attachment,
  AttachmentId,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import {
  Assistant,
  type AssistantError,
  AssistantReply,
  ChatTitle,
  type HistoryMessage,
  MessageId,
} from '@app-template/domain/chat'
import {
  asCompleted,
  assistantMessageAt,
  epoch,
  owner,
  userMessageAt,
} from '@app-template/domain/testing'
import { png } from '@app-template/testing'

import { AssistantModels } from '#infrastructure/chat/assistant.client'
import { AssistantLlm } from '#infrastructure/chat/assistant.llm'

type RequestBody = typeof Generated.BetaCreateMessageParams.Encoded

const replyModel = 'claude-sonnet-5-5'

const titleModel = 'claude-haiku-5-5'

const readBody = (request: HttpClientRequest.HttpClientRequest): RequestBody =>
  request.body._tag === 'Uint8Array'
    ? JSON.parse(new TextDecoder().decode(request.body.body))
    : assert.fail(`a request body of ${request.body._tag}`)

/** `AssistantLlm` over Anthropic's models and an `HttpClient` that keeps each request body and the time it was sent, and answers it by `respond`. */
const recordAnthropic = (respond: (body: RequestBody) => Response) => {
  const requests = Ref.makeUnsafe<
    ReadonlyArray<{ readonly body: RequestBody; readonly at: number }>
  >([])
  const httpClient = HttpClient.make((request) => {
    const body = readBody(request)
    return Clock.currentTimeMillis.pipe(
      Effect.flatMap((at) => Ref.update(requests, Arr.append({ body, at }))),
      Effect.as(HttpClientResponse.fromWeb(request, respond(body))),
    )
  })
  const layer = AssistantLlm.pipe(
    Layer.provide(
      AssistantModels.layerAnthropic({
        provider: 'anthropic',
        apiKey: Redacted.make('sk-test-key'),
        replyModel,
        titleModel,
      }),
    ),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, httpClient)),
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
    model: replyModel,
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
  { type, message, headers }: { type: string; message: string; headers?: Record<string, string> },
) =>
  Response.json({ type: 'error', error: { type, message }, request_id: null }, { status, headers })

const titleInstruction =
  'Write a title of at most 120 characters for a chat that opens with the next message. Answer with the title alone.'

const suggestTitle = (text: string) => Assistant.use((assistant) => assistant.suggestTitle(text))

const reply = (history: ReadonlyArray<HistoryMessage>) =>
  Assistant.use((assistant) => assistant.reply(history))

const hi: ReadonlyArray<HistoryMessage> = [{ message: userMessageAt(1, 'Hi'), attachments: [] }]

const image = (id: string, fileName: string) =>
  new Attachment({
    ...buildAttachment({
      id: AttachmentId.make(id),
      userId: owner,
      fileName: FileName.make(fileName),
      mediaType: MediaType.make('image/png'),
      size: FileSize.make(png.length),
      createdAt: epoch,
    }),
    messageId: Option.some(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000051')),
  })

// The package writes `cache_control: null` on every system and user block.
const imageBlock = {
  type: 'image',
  source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgoA/w==' },
  cache_control: null,
} as const

const photo = image('0192d4e0-7b3a-7c00-8000-000000000040', 'photo.png')

const sketch = image('0192d4e0-7b3a-7c00-8000-000000000041', 'sketch.png')

describe('AssistantLlm', () => {
  it.effect(
    'reply asks the reply model for at most 16 000 tokens, with the prefix cached and the default effort and thinking',
    () => {
      const { bodies, layer } = recordAnthropic(() => message('{"text":"Hello"}'))
      return Effect.gen(function* () {
        yield* reply(hi)

        const [body] = yield* bodies
        assert.deepStrictEqual(
          {
            model: body?.model,
            max_tokens: body?.max_tokens,
            cache_control: body?.cache_control,
            effort: body?.output_config?.effort,
            thinking: body?.thinking,
          },
          {
            model: replyModel,
            max_tokens: 16_000,
            cache_control: { type: 'ephemeral' },
            effort: undefined,
            thinking: undefined,
          },
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect(
    'suggestTitle asks the title model for at most 1 000 tokens, with the lowest effort and thinking off',
    () => {
      const { bodies, layer } = recordAnthropic(() => message('Lisbon weekend'))
      return Effect.gen(function* () {
        yield* suggestTitle('Plan a weekend in Lisbon')

        const [body] = yield* bodies
        assert.deepStrictEqual(
          {
            model: body?.model,
            max_tokens: body?.max_tokens,
            cache_control: body?.cache_control,
            effort: body?.output_config?.effort,
            thinking: body?.thinking,
          },
          {
            model: titleModel,
            max_tokens: 1_000,
            cache_control: undefined,
            effort: 'low',
            thinking: { type: 'disabled' },
          },
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect(
    'reply sends the fixed system prompt, then user turns with text and images and assistant turns as their text',
    () => {
      const { bodies, layer } = recordAnthropic(() => message('{"text":"Hello"}'))
      return Effect.gen(function* () {
        yield* reply([
          {
            message: userMessageAt(1, 'What is this?'),
            attachments: [{ attachment: photo, bytes: png }],
          },
          { message: asCompleted(assistantMessageAt(2), 'A photo.'), attachments: [] },
          { message: userMessageAt(3, ''), attachments: [{ attachment: sketch, bytes: png }] },
        ])
        yield* reply(hi)

        const [photoChat, hiChat] = yield* bodies
        assert.deepStrictEqual(photoChat?.messages, [
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is this?', cache_control: null }, imageBlock],
          },
          { role: 'assistant', content: [{ type: 'text', text: 'A photo.' }] },
          { role: 'user', content: [imageBlock] },
        ])
        assert.isNotEmpty(photoChat?.system)
        assert.deepStrictEqual(photoChat?.system, hiChat?.system)
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect("reply's JSON Schema tells the model what its text field means", () => {
    const { bodies, layer } = recordAnthropic(() => message('{"text":"Hello"}'))
    return Effect.gen(function* () {
      yield* reply(hi)

      const [body] = yield* bodies
      assert.deepStrictEqual(body?.output_config?.format?.schema.properties, {
        text: { type: 'string', description: 'The reply the user reads, as plain text.' },
      })
    }).pipe(Effect.provide(layer))
  })

  it.effect("reply answers the text of the model's JSON", () => {
    const { layer } = recordAnthropic(() => message('{"text":"Hello"}'))
    return Effect.gen(function* () {
      const answer = yield* reply(hi)

      assertEquals(answer, new AssistantReply({ text: 'Hello' }))
    }).pipe(Effect.provide(layer))
  })

  it.effect.each<{
    name: string
    answer: () => Response
    sentAt: ReadonlyArray<number>
    error: AssistantError['_tag']
    detail: string
  }>([
    {
      name: 'a refusal whose text is whole JSON',
      answer: () => message('{"text":"Hello"}', 'refusal'),
      sentAt: [0],
      error: 'AssistantRefusedError',
      detail: 'content-filter',
    },
    {
      name: 'a refusal whose text is not JSON',
      answer: () => message('I cannot help with that.', 'refusal'),
      sentAt: [0],
      error: 'AssistantRefusedError',
      detail: 'content-filter',
    },
    {
      name: 'an answer cut by max_tokens',
      answer: () => message('{"text":"Hello"}', 'max_tokens'),
      sentAt: [0, 1_000, 3_000],
      error: 'AssistantFailedError',
      detail: 'length',
    },
    {
      name: 'a blank text',
      answer: () => message('{"text":" \\n"}'),
      sentAt: [0, 1_000, 3_000],
      error: 'AssistantFailedError',
      detail: 'a string with a non-whitespace character',
    },
    {
      name: 'a 529',
      answer: () => apiError(529, { type: 'overloaded_error', message: 'Overloaded' }),
      sentAt: [0, 1_000, 3_000],
      error: 'AssistantFailedError',
      detail: 'Overloaded',
    },
    {
      name: 'a 500',
      answer: () => apiError(500, { type: 'api_error', message: 'Internal server error' }),
      sentAt: [0, 1_000, 3_000],
      error: 'AssistantFailedError',
      detail: 'Internal server error',
    },
    {
      name: 'a 429 with retry-after 5',
      answer: () =>
        apiError(429, {
          type: 'rate_limit_error',
          message: 'Rate limited',
          headers: { 'retry-after': '5' },
        }),
      sentAt: [0, 5_000, 10_000],
      error: 'AssistantFailedError',
      detail: 'Rate limit',
    },
    {
      name: 'a 429 with retry-after 60',
      answer: () =>
        apiError(429, {
          type: 'rate_limit_error',
          message: 'Rate limited',
          headers: { 'retry-after': '60' },
        }),
      sentAt: [0],
      error: 'AssistantFailedError',
      detail: 'Rate limit',
    },
    {
      name: 'a 401',
      answer: () => apiError(401, { type: 'authentication_error', message: 'invalid x-api-key' }),
      sentAt: [0],
      error: 'AssistantFailedError',
      detail: 'invalid x-api-key',
    },
    {
      name: 'a 403',
      answer: () =>
        apiError(403, {
          type: 'permission_error',
          message: 'The model is not available for this account',
        }),
      sentAt: [0],
      error: 'AssistantFailedError',
      detail: 'not available for this account',
    },
    {
      name: 'a 400',
      answer: () => apiError(400, { type: 'invalid_request_error', message: 'prompt is too long' }),
      sentAt: [0],
      error: 'AssistantFailedError',
      detail: 'prompt is too long',
    },
  ])(
    'reply on $name fails with $error, its requests sent at $sentAt ms',
    ({ answer, sentAt, error, detail }) => {
      const recorded = recordAnthropic(answer)
      return Effect.gen(function* () {
        const failing = yield* reply(hi).pipe(Effect.flip, Effect.forkChild)

        yield* TestClock.adjust('2 minutes')

        const failure = yield* Fiber.join(failing)
        assertEquals(yield* recorded.sentAt, sentAt)
        assert.strictEqual(failure._tag, error)
        assert.include(failure.cause, detail)
      }).pipe(Effect.provide(recorded.layer))
    },
  )

  it.effect(
    'suggestTitle asks for a title of the opening message and cuts the answer to the title length',
    () => {
      const { bodies, layer } = recordAnthropic(() => message('a'.repeat(130)))
      return Effect.gen(function* () {
        const title = yield* suggestTitle('Plan a weekend in Lisbon')

        const [body] = yield* bodies
        assertEquals(title, Option.some(ChatTitle.make('a'.repeat(120))))
        assert.deepStrictEqual(
          { system: body?.system, messages: body?.messages },
          {
            system: [{ type: 'text', text: titleInstruction, cache_control: null }],
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'Plan a weekend in Lisbon', cache_control: null }],
              },
            ],
          },
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('suggestTitle answers none for blank text without asking the model', () => {
    const { bodies, layer } = recordAnthropic(() => message('Lisbon weekend'))
    return Effect.gen(function* () {
      const title = yield* suggestTitle(' \n ')

      assertEquals(title, Option.none())
      assertEquals(yield* bodies, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect('suggestTitle dies on a provider failure', () => {
    const { layer } = recordAnthropic(() => new Response('Overloaded', { status: 529 }))
    return Effect.gen(function* () {
      const exit = yield* suggestTitle('Plan a weekend in Lisbon').pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(layer))
  })

  it.effect('the stub answers a reply and a title that pass their schemas', () => {
    const layer = AssistantLlm.pipe(Layer.provide(AssistantModels.layerStub))
    return Effect.gen(function* () {
      const answers = yield* Effect.all(
        { reply: reply(hi), title: suggestTitle('Plan a weekend in Lisbon') },
        { concurrency: 'unbounded' },
      ).pipe(Effect.forkChild)

      yield* TestClock.adjust('1 second')

      assertEquals(yield* Fiber.join(answers), {
        reply: new AssistantReply({
          text: 'This is the development stub answering the whole reply at once.',
        }),
        title: Option.some(ChatTitle.make('Stub chat title')),
      })
    }).pipe(Effect.provide(layer))
  })
})
