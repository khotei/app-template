import type { Generated } from '@effect/ai-anthropic'
import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import {
  Array as Arr,
  Clock,
  ConfigProvider,
  Effect,
  Fiber,
  Layer,
  Option,
  Redacted,
  Ref,
  Schema,
} from 'effect'
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
import {
  AssistantLlm,
  CurrentReplyProvenance,
  generateInstructionsHash,
} from '#infrastructure/chat/assistant.llm'

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
  { type, text, headers }: { type: string; text: string; headers?: Record<string, string> },
) =>
  Response.json(
    { type: 'error', error: { type, message: text }, request_id: null },
    { status, headers },
  )

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
      const { bodies, layer } = recordAnthropic(() => message('{"title":"Lisbon weekend"}'))
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
  }>([
    {
      name: 'a refusal whose text is whole JSON',
      answer: () => message('{"text":"Hello"}', 'refusal'),
      sentAt: [0],
      error: 'AssistantRefusedError',
    },
    {
      name: 'a refusal whose text is not JSON',
      answer: () => message('I cannot help with that.', 'refusal'),
      sentAt: [0],
      error: 'AssistantRefusedError',
    },
    {
      name: 'an answer cut by max_tokens',
      answer: () => message('{"text":"Hello"}', 'max_tokens'),
      sentAt: [0, 1_000, 3_000],
      error: 'AssistantFailedError',
    },
    {
      name: 'a blank text',
      answer: () => message('{"text":" \\n"}'),
      sentAt: [0, 1_000, 3_000],
      error: 'AssistantFailedError',
    },
    {
      name: 'a 529',
      answer: () => apiError(529, { type: 'overloaded_error', text: 'Overloaded' }),
      sentAt: [0, 1_000, 3_000],
      error: 'AssistantFailedError',
    },
    {
      name: 'a 500',
      answer: () => apiError(500, { type: 'api_error', text: 'Internal server error' }),
      sentAt: [0, 1_000, 3_000],
      error: 'AssistantFailedError',
    },
    {
      name: 'a 429 with retry-after 5',
      answer: () =>
        apiError(429, {
          type: 'rate_limit_error',
          text: 'Rate limited',
          headers: { 'retry-after': '5' },
        }),
      sentAt: [0, 5_000, 10_000],
      error: 'AssistantFailedError',
    },
    {
      name: 'a 429 with retry-after 60',
      answer: () =>
        apiError(429, {
          type: 'rate_limit_error',
          text: 'Rate limited',
          headers: { 'retry-after': '60' },
        }),
      sentAt: [0],
      error: 'AssistantFailedError',
    },
    {
      name: 'a 401',
      answer: () => apiError(401, { type: 'authentication_error', text: 'invalid x-api-key' }),
      sentAt: [0],
      error: 'AssistantFailedError',
    },
    {
      name: 'a 403',
      answer: () =>
        apiError(403, {
          type: 'permission_error',
          text: 'The model is not available for this account',
        }),
      sentAt: [0],
      error: 'AssistantFailedError',
    },
    {
      name: 'a 400',
      answer: () => apiError(400, { type: 'invalid_request_error', text: 'prompt is too long' }),
      sentAt: [0],
      error: 'AssistantFailedError',
    },
  ])(
    'reply on $name fails with $error, its requests sent at $sentAt ms',
    ({ answer, sentAt, error }) => {
      const recorded = recordAnthropic(answer)
      return Effect.gen(function* () {
        const failing = yield* reply(hi).pipe(Effect.flip, Effect.forkChild)

        yield* TestClock.adjust('2 minutes')

        const failure = yield* Fiber.join(failing)
        assertEquals(yield* recorded.sentAt, sentAt)
        assert.strictEqual(failure._tag, error)
      }).pipe(Effect.provide(recorded.layer))
    },
  )

  it.effect("reply keeps the provider's text in the failure's cause", () => {
    const { layer } = recordAnthropic(() =>
      apiError(401, { type: 'authentication_error', text: 'invalid x-api-key' }),
    )
    return Effect.gen(function* () {
      const failure = yield* reply(hi).pipe(Effect.flip)

      assert.include(failure.cause, 'invalid x-api-key')
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    'suggestTitle asks for a title of the opening message, its JSON Schema telling the model what the field means',
    () => {
      const { bodies, layer } = recordAnthropic(() => message('{"title":"Lisbon weekend"}'))
      return Effect.gen(function* () {
        yield* suggestTitle('Plan a weekend in Lisbon')

        const [body] = yield* bodies
        assert.isNotEmpty(body?.system)
        assert.deepStrictEqual(body?.messages, [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Plan a weekend in Lisbon', cache_control: null }],
          },
        ])
        assert.deepStrictEqual(body?.output_config?.format?.schema.properties, {
          title: {
            type: 'string',
            description:
              'The title of the chat, in the language of its opening message, at most 120 characters.',
          },
        })
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect("suggestTitle answers the model's title trimmed", () => {
    const { layer } = recordAnthropic(() => message('{"title":"  Lisbon weekend \\n"}'))
    return Effect.gen(function* () {
      const title = yield* suggestTitle('Plan a weekend in Lisbon')

      assertEquals(title, Option.some(ChatTitle.make('Lisbon weekend')))
    }).pipe(Effect.provide(layer))
  })

  it.effect.each<{
    name: string
    answer: () => Response
    sentAt: ReadonlyArray<number>
    error: AssistantError['_tag']
  }>([
    {
      name: 'a title of 121 characters',
      answer: () => message(JSON.stringify({ title: 'a'.repeat(121) })),
      sentAt: [0, 1_000, 3_000, 7_000, 15_000],
      error: 'AssistantFailedError',
    },
    {
      name: 'a blank title',
      answer: () => message('{"title":" \\n"}'),
      sentAt: [0, 1_000, 3_000, 7_000, 15_000],
      error: 'AssistantFailedError',
    },
    {
      name: 'a 401',
      answer: () => apiError(401, { type: 'authentication_error', text: 'invalid x-api-key' }),
      sentAt: [0],
      error: 'AssistantFailedError',
    },
    {
      name: 'a refusal',
      answer: () => message('{"title":"Lisbon weekend"}', 'refusal'),
      sentAt: [0],
      error: 'AssistantRefusedError',
    },
  ])(
    'suggestTitle on $name fails with $error, its requests sent at $sentAt ms',
    ({ answer, sentAt, error }) => {
      const recorded = recordAnthropic(answer)
      return Effect.gen(function* () {
        const failing = yield* suggestTitle('Plan a weekend in Lisbon').pipe(
          Effect.flip,
          Effect.forkChild,
        )

        yield* TestClock.adjust('2 minutes')

        const failure = yield* Fiber.join(failing)
        assertEquals(yield* recorded.sentAt, sentAt)
        assert.strictEqual(failure._tag, error)
      }).pipe(Effect.provide(recorded.layer))
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

describe('generateInstructionsHash', () => {
  const prompt = 'Answer the last user message.'

  const Answer = Schema.Struct({
    text: Schema.String.annotateKey({ description: 'The reply, as plain text.' }),
  })

  it.effect('changes with the system prompt and with the schema, and with nothing else', () =>
    Effect.gen(function* () {
      const [first, again, otherPrompt, otherSchema] = yield* Effect.all([
        generateInstructionsHash(prompt, Answer),
        generateInstructionsHash(prompt, Answer),
        generateInstructionsHash('Answer the last user message briefly.', Answer),
        generateInstructionsHash(
          prompt,
          Schema.Struct({
            text: Schema.String.annotateKey({ description: 'The reply, as Markdown.' }),
          }),
        ),
      ])

      assert.strictEqual(first, again)
      assert.notStrictEqual(otherPrompt, first)
      assert.notStrictEqual(otherSchema, first)
    }).pipe(Effect.provide(BunCrypto.layer)),
  )
})

describe('CurrentReplyProvenance', () => {
  it.effect(
    'names the configured provider and reply model with the instructions hash, and needs no key',
    () =>
      Effect.gen(function* () {
        const { provider, model, instructionsHash } = yield* CurrentReplyProvenance

        assert.deepStrictEqual({ provider, model }, { provider: 'anthropic', model: replyModel })
        assert.match(instructionsHash, /^[0-9a-f]{64}$/)
      }).pipe(
        Effect.provide(CurrentReplyProvenance.layerFromConfig),
        Effect.provide([
          BunCrypto.layer,
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ LLM_PROVIDER: 'anthropic', LLM_REPLY_MODEL: replyModel }),
          ),
        ]),
      ),
  )
})
