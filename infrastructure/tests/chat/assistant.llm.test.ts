import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Effect, Exit, Fiber, Layer, Option, Ref, Stream } from 'effect'
import { AiError, LanguageModel, Prompt, type Response } from 'effect/ai'
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
  type AssistantTurn,
  buildAssistantMessage,
  buildUserMessage,
  ChatTitle,
  Message,
  MessageId,
} from '@app-template/domain/chat'
import { chatId, epoch, owner } from '@app-template/domain/testing'
import { png } from '@app-template/testing'

import { AssistantLlm } from '#infrastructure/chat/assistant.llm'
import { AssistantModels } from '#infrastructure/chat/assistant-models.client'

interface LanguageModelScript {
  readonly generateText?: Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>
  readonly streamText?: Stream.Stream<Response.StreamPartEncoded, AiError.AiError>
}

/** `AssistantLlm` over one model for both purposes, answering from `script`, keeping each prompt; an unscripted call dies. */
const recordLanguageModel = (script: LanguageModelScript) => {
  const prompts = Ref.makeUnsafe<ReadonlyArray<Prompt.Prompt>>([])
  const record = (prompt: Prompt.Prompt) => Ref.update(prompts, Arr.append(prompt))
  const models = Layer.effect(
    AssistantModels,
    LanguageModel.make({
      generateText: ({ prompt }) =>
        record(prompt).pipe(
          Effect.andThen(script.generateText ?? Effect.die('generateText is not scripted')),
        ),
      streamText: ({ prompt }) =>
        Stream.fromEffect(record(prompt)).pipe(
          Stream.flatMap(() => script.streamText ?? Stream.die('streamText is not scripted')),
        ),
    }).pipe(
      Effect.map((model) => ({ provider: 'fake', replyModel: 'fake', reply: model, title: model })),
    ),
  )
  return { prompts: Ref.get(prompts), layer: AssistantLlm.pipe(Layer.provide(models)) }
}

const contentsOf = (prompts: ReadonlyArray<Prompt.Prompt>) =>
  Arr.map(prompts, (prompt) => prompt.content)

const answer = (text: string) =>
  Effect.succeed<Array<Response.PartEncoded>>([{ type: 'text', text }])

const delta = (text: string): Response.StreamPartEncoded => ({
  type: 'text-delta',
  id: 'reply',
  delta: text,
})

const providerError = AiError.make({
  module: 'FakeProvider',
  method: 'generateText',
  reason: new AiError.UnknownError({ description: 'provider exploded' }),
})

const titleInstruction =
  'Write a title of at most 120 characters for a chat that opens with the next message. Answer with the title alone.'

const suggestTitle = (text: string) => Assistant.use((assistant) => assistant.suggestTitle(text))

const reply = (history: ReadonlyArray<AssistantTurn>) =>
  Assistant.use((assistant) => assistant.reply(history))

const textStream = (...deltas: ReadonlyArray<string>) =>
  Stream.make<Array<Response.StreamPartEncoded>>(
    { type: 'text-start', id: 'reply' },
    ...Arr.map(deltas, delta),
    { type: 'text-end', id: 'reply' },
  )

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

const photo = image('0192d4e0-7b3a-7c00-8000-000000000040', 'photo.png')

const sketch = image('0192d4e0-7b3a-7c00-8000-000000000041', 'sketch.png')

const user = (n: number, text: string) =>
  buildUserMessage({
    id: MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`),
    chatId,
    text,
    createdAt: epoch,
  })

const completed = new Message({
  ...buildAssistantMessage({
    id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000052'),
    chatId,
    createdAt: epoch,
  }),
  stage: 'completed',
  text: 'A photo.',
})

const file = (fileName: string) =>
  ({ type: 'file', mediaType: 'image/png', fileName, data: png }) as const

describe('AssistantLlm', () => {
  it.effect(
    'suggestTitle asks the model for a title and cuts its answer to the title length',
    () => {
      const { prompts, layer } = recordLanguageModel({ generateText: answer('a'.repeat(130)) })
      return Effect.gen(function* () {
        const title = yield* suggestTitle('Plan a weekend in Lisbon')

        assertEquals(title, Option.some(ChatTitle.make('a'.repeat(120))))
        assert.deepStrictEqual(contentsOf(yield* prompts), [
          Prompt.make([
            { role: 'system', content: titleInstruction },
            { role: 'user', content: [{ type: 'text', text: 'Plan a weekend in Lisbon' }] },
          ]).content,
        ])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('suggestTitle answers none for blank text without asking the model', () => {
    const { prompts, layer } = recordLanguageModel({ generateText: answer('Lisbon weekend') })
    return Effect.gen(function* () {
      const title = yield* suggestTitle(' \n ')

      assertEquals(title, Option.none())
      assertEquals(yield* prompts, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect('suggestTitle dies on a provider failure', () => {
    const { layer } = recordLanguageModel({ generateText: Effect.fail(providerError) })
    return Effect.gen(function* () {
      const exit = yield* suggestTitle('Plan a weekend in Lisbon').pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    'reply prompts with the history and a file part per attachment, answering the deltas joined',
    () => {
      const { prompts, layer } = recordLanguageModel({ streamText: textStream('Hel', 'lo') })
      return Effect.gen(function* () {
        const answer = yield* reply([
          { message: user(1, 'What is this?'), files: [{ attachment: photo, bytes: png }] },
          { message: completed, files: [] },
          { message: user(3, ''), files: [{ attachment: sketch, bytes: png }] },
        ])

        assertEquals(answer, new AssistantReply({ text: 'Hello' }))
        assert.deepStrictEqual(contentsOf(yield* prompts), [
          Prompt.make([
            { role: 'user', content: [{ type: 'text', text: 'What is this?' }, file('photo.png')] },
            { role: 'assistant', content: [{ type: 'text', text: 'A photo.' }] },
            { role: 'user', content: [file('sketch.png')] },
          ]).content,
        ])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('reply dies on a blank answer', () => {
    const { layer } = recordLanguageModel({ streamText: textStream(' ', '\n') })
    return Effect.gen(function* () {
      const exit = yield* reply([{ message: user(1, 'Hi'), files: [] }]).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(layer))
  })

  it.effect('the stub answers a reply and a title after 1 s', () => {
    const layer = AssistantLlm.pipe(Layer.provide(AssistantModels.layerStub))
    return Effect.gen(function* () {
      const answers = yield* Effect.all(
        {
          reply: reply([{ message: user(1, 'Hi'), files: [] }]),
          title: suggestTitle('Plan a weekend in Lisbon'),
        },
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
