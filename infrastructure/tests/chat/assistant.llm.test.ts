import type { Generated } from '@effect/ai-anthropic'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Effect, Exit, Fiber, Layer, Option, Redacted, Ref } from 'effect'
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

/** `AssistantLlm` over Anthropic's models and an `HttpClient` that keeps each request body and answers it by `respond`. */
const recordAnthropic = (respond: (body: RequestBody) => Response) => {
  const bodies = Ref.makeUnsafe<ReadonlyArray<RequestBody>>([])
  const httpClient = HttpClient.make((request) => {
    const body = readBody(request)
    return Ref.update(bodies, Arr.append(body)).pipe(
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
  return { bodies: Ref.get(bodies), layer }
}

/** A Messages API response whose one text block is `text`. */
const message = (text: string) =>
  Response.json({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: replyModel,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
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

  it.effect('reply dies on a blank answer', () => {
    const { layer } = recordAnthropic(() => message('{"text":" \\n"}'))
    return Effect.gen(function* () {
      const exit = yield* reply(hi).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(layer))
  })

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
