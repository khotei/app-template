import { assert, describe, it } from '@effect/vitest'
import {
  Array as Arr,
  DateTime,
  Effect,
  Layer,
  Logger,
  Option,
  Record as Rec,
  Stream,
} from 'effect'
import { AiError, LanguageModel, Prompt, type Response } from 'effect/ai'
import { KeyValueStore } from 'effect/persistence'
import { TestClock } from 'effect/testing'

import {
  buildChat,
  buildUserMessage,
  Chat,
  ChatId,
  ChatRepository,
  type Message,
  MessageId,
  MessageRepository,
  maxTitleLength,
} from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { ChatRepositoryKv, MessageRepositoryKv } from '@app-template/infrastructure/chat'
import { QueueClient } from '@app-template/queue'

import { ChatTitleJob } from '#application/chat/chat-title.job'

const owner = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000020')
const firstId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')
const epoch = DateTime.makeUnsafe(0)

type Answer = Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>

const makeHarness = (answer: Answer) => {
  const writes: Array<Chat> = []
  const prompts: Array<Prompt.Prompt> = []
  const logs: Array<readonly [level: string, message: unknown]> = []
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
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (options) => {
        prompts.push(options.prompt)
        return answer
      },
      streamText: () => Stream.die('streamText is not used by the title'),
    }),
  )
  const logger = Logger.layer([
    Logger.make<unknown, void>(({ logLevel, message }) => {
      logs.push([logLevel, Array.isArray(message) ? message[0] : message])
    }),
  ])
  const layer = Layer.mergeAll(ChatTitleJob.layer, chats, MessageRepositoryKv, model, logger).pipe(
    Layer.provideMerge(QueueClient.layerMemory),
    Layer.provide(KeyValueStore.layerMemory),
  )
  return { writes, prompts, logs, layer }
}

const answering = (text: string): Answer => Effect.succeed([{ type: 'text', text }])

const arrangeChat = (text = 'Plan a weekend in Lisbon') =>
  Effect.gen(function* () {
    const first = buildUserMessage({
      id: firstId,
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

// One second at a time, so a retry is due whether its delay started before or after an advance.
const startWorker = Layer.build(ChatTitleJob.worker).pipe(
  Effect.andThen(Effect.repeat(TestClock.adjust('1 second'), { times: 59 })),
  Effect.scoped,
)

const enqueue = (first: Message) => Effect.flatMap(ChatTitleJob, (job) => job.enqueue(first))

const runWorker = (first: Message) => Effect.andThen(enqueue(first), startWorker)

// The model answers after 500 ms, so a change made 200 ms in lands between the take and the write.
const slowAnswer = Effect.delay(answering('Lisbon weekend'), '500 millis')

const moments = {
  'before the take': {
    modelCalls: 0,
    run: <R>(change: Effect.Effect<void, never, R>) => Effect.andThen(change, startWorker),
  },
  'while the model answers': {
    modelCalls: 1,
    run: <R>(change: Effect.Effect<void, never, R>) =>
      Layer.build(ChatTitleJob.worker).pipe(
        Effect.andThen(TestClock.adjust('200 millis')),
        Effect.andThen(change),
        Effect.andThen(TestClock.adjust('1 second')),
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
  yield* chats.update(new Chat({ ...(yield* selectChat), title: Option.some('Trip') }))
})

const deleteMessages = Effect.flatMap(MessageRepository, (messages) =>
  messages.deleteByChat(chatId),
)

const deleteChat = Effect.andThen(
  deleteMessages,
  Effect.flatMap(ChatRepository, (chats) => chats.delete(chatId)),
)

describe('ChatTitleJob.worker', () => {
  it.effect('titles the chat with the model text, trimmed and cut to the title limit', () => {
    const { prompts, layer } = makeHarness(answering(`  ${filler(maxTitleLength - 1)} and more\n`))
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat())

      assert.deepStrictEqual((yield* selectChat).title, Option.some(filler(maxTitleLength - 1)))
      const [prompt] = prompts
      const expected = Prompt.make([
        { role: 'user', content: [{ type: 'text', text: 'Plan a weekend in Lisbon' }] },
      ])
      assert.deepStrictEqual(prompt?.content.at(-1), expected.content[0])
    }).pipe(Effect.provide(layer))
  })

  it.effect('keeps the chat updatedAt when it writes the title', () => {
    const { writes, layer } = makeHarness(slowAnswer)
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat())

      assert.deepStrictEqual(
        Arr.map(writes, (chat) => [chat.title, DateTime.toEpochMillis(chat.updatedAt)]),
        [[Option.some('Lisbon weekend'), 0]],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(moments))('keeps a title the user set %s', (moment) => {
    const { prompts, logs, layer } = makeHarness(slowAnswer)
    return Effect.gen(function* () {
      yield* enqueue(yield* arrangeChat())

      yield* moments[moment].run(renameChat)

      assert.deepStrictEqual((yield* selectChat).title, Option.some('Trip'))
      assert.strictEqual(prompts.length, moments[moment].modelCalls)
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: already titled']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(moments))(
    'ends without a write when the chat is deleted %s',
    (moment) => {
      const { writes, prompts, logs, layer } = makeHarness(slowAnswer)
      return Effect.gen(function* () {
        yield* enqueue(yield* arrangeChat())

        yield* moments[moment].run(deleteChat)

        assert.deepStrictEqual(writes, [])
        assert.strictEqual(prompts.length, moments[moment].modelCalls)
        assert.deepStrictEqual(logs, [['Info', 'chat title skipped: chat deleted']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('ends without a write when the chat is left without its first message', () => {
    const { writes, prompts, logs, layer } = makeHarness(answering('Lisbon weekend'))
    return Effect.gen(function* () {
      yield* enqueue(yield* arrangeChat())
      yield* deleteMessages

      yield* startWorker

      assert.deepStrictEqual(writes, [])
      assert.deepStrictEqual(prompts, [])
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: first message missing']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(graphemeCuts))('cuts the title at a whole grapheme with %s', (cut) => {
    const { answer, title } = graphemeCuts[cut]
    const { layer } = makeHarness(answering(answer))
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat())

      assert.deepStrictEqual((yield* selectChat).title, Option.some(title))
    }).pipe(Effect.provide(layer))
  })

  it.effect('asks the model for a title within the title limit', () => {
    const { prompts, layer } = makeHarness(answering('Lisbon weekend'))
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat())

      const [system] = prompts[0]?.content ?? []
      assert.strictEqual(system?.role, 'system')
      assert.include(system?.content, `at most ${maxTitleLength} characters`)
    }).pipe(Effect.provide(layer))
  })

  it.effect('leaves the chat untitled and dead-letters the job when the model always fails', () => {
    const { writes, logs, layer } = makeHarness(Effect.fail(providerError))
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat())

      assert.deepStrictEqual((yield* selectChat).title, Option.none())
      assert.deepStrictEqual(writes, [])
      assert.deepStrictEqual(logs, [
        ['Warn', 'queue message attempt failed'],
        ['Warn', 'queue message attempt failed'],
        ['Warn', 'queue message attempt failed'],
        ['Warn', 'queue message attempt failed'],
        ['Error', 'queue message dead-lettered'],
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(untitledOpenings))('leaves the chat untitled after %s', (opening) => {
    const { text, answer, modelCalls } = untitledOpenings[opening]
    const { writes, prompts, logs, layer } = makeHarness(answer)
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat(text))

      assert.deepStrictEqual(writes, [])
      assert.strictEqual(prompts.length, modelCalls)
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: nothing to title']])
    }).pipe(Effect.provide(layer))
  })
})
