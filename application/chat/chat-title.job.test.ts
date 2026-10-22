import { assert, layer } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Layer, Option, Record as Rec } from 'effect'
import { AiError, Prompt, type Response } from 'effect/ai'
import { KeyValueStore } from 'effect/persistence'

import {
  buildChat,
  buildUserMessage,
  Chat,
  ChatRepository,
  ChatTitle,
  type Message,
  MessageRepository,
  maxTitleLength,
} from '@app-template/domain/chat'
import {
  ChatRepositoryKv,
  chatTitleQueue,
  MessageRepositoryKv,
} from '@app-template/infrastructure/chat'
import { AwsClientsMiniStack, recordLogs } from '@app-template/testing'

import { ChatTitleJob } from '#application/chat/chat-title.job'
import { chatId, epoch, messageId } from '#application/testing/chat.fixture'
import { recordLanguageModel } from '#application/testing/language-model.fake'
import {
  abandonAttempts,
  pollUntil,
  provisionQueues,
  runUntilDrained,
} from '#application/testing/queue.harness'
import { owner } from '#application/testing/user.fixture'

type Answer = Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>

const makeChatTitleHarness = (answer: Answer) => {
  const writes: Array<Chat> = []
  const chats = Layer.effect(
    ChatRepository,
    Effect.map(ChatRepository, (inner) =>
      ChatRepository.of({
        ...inner,
        update: (chat) =>
          Effect.andThen(
            Effect.sync(() => writes.push(chat)),
            inner.update(chat),
          ),
      }),
    ),
  ).pipe(Layer.provide(ChatRepositoryKv))
  const { prompts, layer: model } = recordLanguageModel({ generateText: answer })
  const { logs, layer: logger } = recordLogs()
  const queues = provisionQueues()
  const layer = Layer.mergeAll(ChatTitleJob.layer, chats, MessageRepositoryKv, model, logger).pipe(
    Layer.provideMerge(queues.layer),
    Layer.provide(KeyValueStore.layerMemory),
  )
  return { writes, prompts, logs, queue: queues.queueName(chatTitleQueue.name), layer }
}

const answering = (text: string): Answer => Effect.succeed([{ type: 'text', text }])

const arrangeChat = (text = 'Plan a weekend in Lisbon') =>
  Effect.gen(function* () {
    const first = buildUserMessage({
      id: messageId,
      chatId,
      text,
      attachmentIds: [],
      createdAt: epoch,
    })
    yield* (yield* ChatRepository).insert(
      buildChat({ id: chatId, userId: owner, createdAt: epoch }),
    )
    yield* (yield* MessageRepository).insert(first)
    return first
  })

const selectChat = Effect.flatMap(ChatRepository, (chats) => chats.selectById(chatId)).pipe(
  Effect.map(Option.getOrThrow),
)

const startWorker = (queue: string) =>
  Layer.build(ChatTitleJob.worker).pipe(Effect.andThen(runUntilDrained(queue)), Effect.scoped)

const enqueue = (first: Message) => Effect.flatMap(ChatTitleJob, (job) => job.enqueue(first))

const runWorker = (first: Message, queue: string) =>
  Effect.andThen(enqueue(first), startWorker(queue))

// The model answers after 500 ms, so a change made once it is asked lands between the take and
// the write.
const slowAnswer = Effect.delay(answering('Lisbon weekend'), '500 millis')

interface Harnessed {
  readonly queue: string
  readonly prompts: ReadonlyArray<Prompt.Prompt>
}

const moments = {
  'before the take': {
    modelCalls: 0,
    run: <R>(change: Effect.Effect<void, never, R>, { queue }: Harnessed) =>
      Effect.andThen(change, startWorker(queue)),
  },
  'while the model answers': {
    modelCalls: 1,
    run: <R>(change: Effect.Effect<void, never, R>, { queue, prompts }: Harnessed) =>
      Layer.build(ChatTitleJob.worker).pipe(
        Effect.andThen(pollUntil(() => prompts.length === 1)),
        Effect.andThen(change),
        Effect.andThen(runUntilDrained(queue)),
        Effect.scoped,
      ),
  },
} as const

const filler = (length: number) => 'A'.repeat(length)

// Each emoji is one grapheme: 😀 is two code units, the joined family eight, and the limit counts
// code units.
const graphemeCuts = {
  'an emoji that fits': {
    answer: `${filler(maxTitleLength - 2)}😀`,
    title: `${filler(maxTitleLength - 2)}😀`,
  },
  'an emoji across the limit': {
    answer: `${filler(maxTitleLength - 1)}😀`,
    title: filler(maxTitleLength - 1),
  },
  'a joined emoji across the limit': {
    answer: `${filler(maxTitleLength - 5)}👨‍👩‍👧`,
    title: filler(maxTitleLength - 5),
  },
} as const

const providerError = AiError.make({
  module: 'FakeProvider',
  method: 'generateText',
  reason: new AiError.UnknownError({ description: 'provider exploded' }),
})

const untitledOpenings = {
  'a first message without text': { text: '', answer: answering('Lisbon weekend'), modelCalls: 0 },
  'a whitespace-only first message': {
    text: ' \n ',
    answer: answering('Lisbon weekend'),
    modelCalls: 0,
  },
  'a blank answer': { text: 'Plan a weekend in Lisbon', answer: answering(' \n '), modelCalls: 1 },
} as const

const renameChat = Effect.gen(function* () {
  const chats = yield* ChatRepository
  yield* chats.update(
    new Chat({ ...(yield* selectChat), title: Option.some(ChatTitle.make('Trip')) }),
  )
})

const deleteMessages = Effect.flatMap(MessageRepository, (messages) =>
  messages.deleteByChat(chatId),
)

const deleteChat = Effect.andThen(
  deleteMessages,
  Effect.flatMap(ChatRepository, (chats) => chats.delete(chatId)),
)

layer(AwsClientsMiniStack, { timeout: '60 seconds' })('ChatTitleJob.worker', (it) => {
  it.effect('titles the chat with the model text, trimmed and cut to the title limit', () => {
    const { prompts, queue, layer } = makeChatTitleHarness(
      answering(`  ${filler(maxTitleLength - 1)} and more\n`),
    )
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat(), queue)

      assert.deepStrictEqual((yield* selectChat).title, Option.some(filler(maxTitleLength - 1)))
      const [prompt] = prompts
      const expected = Prompt.make([
        { role: 'user', content: [{ type: 'text', text: 'Plan a weekend in Lisbon' }] },
      ])
      assert.deepStrictEqual(prompt?.content.at(-1), expected.content[0])
    }).pipe(Effect.provide(layer))
  })

  it.effect('keeps the chat updatedAt when it writes the title', () => {
    const { writes, queue, layer } = makeChatTitleHarness(slowAnswer)
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat(), queue)

      assert.deepStrictEqual(
        Arr.map(writes, (chat) => [chat.title, DateTime.toEpochMillis(chat.updatedAt)]),
        [[Option.some('Lisbon weekend'), 0]],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(moments))('keeps a title the user set %s', (moment) => {
    const { prompts, logs, queue, layer } = makeChatTitleHarness(slowAnswer)
    return Effect.gen(function* () {
      yield* enqueue(yield* arrangeChat())

      yield* moments[moment].run(renameChat, { queue, prompts })

      assert.deepStrictEqual((yield* selectChat).title, Option.some(ChatTitle.make('Trip')))
      assert.strictEqual(prompts.length, moments[moment].modelCalls)
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: already titled']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(moments))(
    'ends without a write when the chat is deleted %s',
    (moment) => {
      const { writes, prompts, logs, queue, layer } = makeChatTitleHarness(slowAnswer)
      return Effect.gen(function* () {
        yield* enqueue(yield* arrangeChat())

        yield* moments[moment].run(deleteChat, { queue, prompts })

        assert.deepStrictEqual(writes, [])
        assert.strictEqual(prompts.length, moments[moment].modelCalls)
        assert.deepStrictEqual(logs, [['Info', 'chat title skipped: chat deleted']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('ends without a write when the chat is left without its first message', () => {
    const { writes, prompts, logs, queue, layer } = makeChatTitleHarness(
      answering('Lisbon weekend'),
    )
    return Effect.gen(function* () {
      yield* enqueue(yield* arrangeChat())
      yield* deleteMessages

      yield* startWorker(queue)

      assert.deepStrictEqual(writes, [])
      assert.deepStrictEqual(prompts, [])
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: first message missing']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(graphemeCuts))('cuts the title at a whole grapheme with %s', (cut) => {
    const { answer, title } = graphemeCuts[cut]
    const { queue, layer } = makeChatTitleHarness(answering(answer))
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat(), queue)

      assert.deepStrictEqual((yield* selectChat).title, Option.some(title))
    }).pipe(Effect.provide(layer))
  })

  it.effect('asks the model for a title within the title limit', () => {
    const { prompts, queue, layer } = makeChatTitleHarness(answering('Lisbon weekend'))
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat(), queue)

      const [system] = prompts[0]?.content ?? []
      assert.strictEqual(system?.role, 'system')
      assert.include(system?.content, `at most ${maxTitleLength} characters`)
    }).pipe(Effect.provide(layer))
  })

  // The earlier attempts are abandoned rather than failed: their retry delays, 1 + 2 + 4 + 8 s of
  // real time on SQS, would buy nothing the queue's own suite does not check.
  it.effect('leaves the chat untitled and dead-letters the job when its last attempt fails', () => {
    const { writes, logs, queue, layer } = makeChatTitleHarness(Effect.fail(providerError))
    return Effect.gen(function* () {
      yield* enqueue(yield* arrangeChat())
      yield* abandonAttempts(queue, chatTitleQueue.maxAttempts - 1)

      yield* startWorker(queue)

      assert.deepStrictEqual((yield* selectChat).title, Option.none())
      assert.deepStrictEqual(writes, [])
      assert.deepStrictEqual(logs, [['Error', 'queue message dead-lettered']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(untitledOpenings))('leaves the chat untitled after %s', (opening) => {
    const { text, answer, modelCalls } = untitledOpenings[opening]
    const { writes, prompts, logs, queue, layer } = makeChatTitleHarness(answer)
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat(text), queue)

      assert.deepStrictEqual(writes, [])
      assert.strictEqual(prompts.length, modelCalls)
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: nothing to title']])
    }).pipe(Effect.provide(layer))
  })
})
