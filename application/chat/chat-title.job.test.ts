import { assert, describe, it, layer } from '@effect/vitest'
import {
  Array as Arr,
  DateTime,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Record as Rec,
  Schedule,
} from 'effect'
import { AiError, Prompt, type Response } from 'effect/ai'
import { KeyValueStore } from 'effect/persistence'
import { TestClock } from 'effect/testing'

import { buildResourceName, provision, resources } from '@app-template/aws'
import {
  buildChat,
  buildUserMessage,
  Chat,
  ChatRepository,
  ChatTitle,
  MessageRepository,
  maxTitleLength,
} from '@app-template/domain/chat'
import {
  ChatRepositoryKv,
  GenerateChatTitle,
  MessageRepositoryKv,
} from '@app-template/infrastructure/chat'
import { QueueClient, QueueTransport } from '@app-template/queue'
import { AwsClientsMiniStack, buildStage, recordLogs } from '@app-template/testing'

import { ChatTitleJob } from '#application/chat/chat-title.job'
import { chatId, epoch, messageId } from '#application/testing/chat.fixture'
import { recordLanguageModel } from '#application/testing/language-model.fake'
import { owner } from '#application/testing/user.fixture'

type Answer = Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>

/** The job's services over memory adapters, recording its chat writes, its prompts and its logs. */
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
  const layer = Layer.mergeAll(chats, MessageRepositoryKv, model, logger).pipe(
    Layer.provide(KeyValueStore.layerMemory),
  )
  return { writes, prompts, logs, layer }
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

const queuedJob = new GenerateChatTitle({ chatId, messageId })

const startTitle = Effect.forkChild(Effect.exit(ChatTitleJob.handle(queuedJob)))

/** Runs the handler to its end, the `TestClock` moving its sleeps along. */
const runTitle = Effect.gen(function* () {
  const running = yield* startTitle
  yield* TestClock.adjust('1 minute')
  return yield* Fiber.join(running)
})

// The model answers after 500 ms, so a change made once it is asked lands between the take and
// the write.
const slowAnswer = Effect.delay(answering('Lisbon weekend'), '500 millis')

const moments = {
  'before the take': {
    modelCalls: 0,
    run: <R>(change: Effect.Effect<void, never, R>) => Effect.andThen(change, runTitle),
  },
  'while the model answers': {
    modelCalls: 1,
    run: <R>(change: Effect.Effect<void, never, R>) =>
      Effect.gen(function* () {
        const running = yield* startTitle
        yield* TestClock.adjust('100 millis')
        yield* change
        yield* TestClock.adjust('1 minute')
        yield* Fiber.join(running)
      }),
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

describe('ChatTitleJob.handle', () => {
  it.effect('titles the chat with the model text, trimmed and cut to the title limit', () => {
    const { prompts, layer } = makeChatTitleHarness(
      answering(`  ${filler(maxTitleLength - 1)} and more\n`),
    )
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* runTitle

      assert.deepStrictEqual((yield* selectChat).title, Option.some(filler(maxTitleLength - 1)))
      const [prompt] = prompts
      const expected = Prompt.make([
        { role: 'user', content: [{ type: 'text', text: 'Plan a weekend in Lisbon' }] },
      ])
      assert.deepStrictEqual(prompt?.content.at(-1), expected.content[0])
    }).pipe(Effect.provide(layer))
  })

  it.effect('keeps the chat updatedAt when it writes the title', () => {
    const { writes, layer } = makeChatTitleHarness(slowAnswer)
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* runTitle

      assert.deepStrictEqual(
        Arr.map(writes, (chat) => [chat.title, DateTime.toEpochMillis(chat.updatedAt)]),
        [[Option.some('Lisbon weekend'), 0]],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(moments))('keeps a title the user set %s', (moment) => {
    const { prompts, logs, layer } = makeChatTitleHarness(slowAnswer)
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* moments[moment].run(renameChat)

      assert.deepStrictEqual((yield* selectChat).title, Option.some(ChatTitle.make('Trip')))
      assert.strictEqual(prompts.length, moments[moment].modelCalls)
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: already titled']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(moments))(
    'ends without a write when the chat is deleted %s',
    (moment) => {
      const { writes, prompts, logs, layer } = makeChatTitleHarness(slowAnswer)
      return Effect.gen(function* () {
        yield* arrangeChat()

        yield* moments[moment].run(deleteChat)

        assert.deepStrictEqual(writes, [])
        assert.strictEqual(prompts.length, moments[moment].modelCalls)
        assert.deepStrictEqual(logs, [['Info', 'chat title skipped: chat deleted']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('ends without a write when the chat is left without its first message', () => {
    const { writes, prompts, logs, layer } = makeChatTitleHarness(answering('Lisbon weekend'))
    return Effect.gen(function* () {
      yield* arrangeChat()
      yield* deleteMessages

      yield* runTitle

      assert.deepStrictEqual(writes, [])
      assert.deepStrictEqual(prompts, [])
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: first message missing']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(graphemeCuts))('cuts the title at a whole grapheme with %s', (cut) => {
    const { answer, title } = graphemeCuts[cut]
    const { layer } = makeChatTitleHarness(answering(answer))
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* runTitle

      assert.deepStrictEqual((yield* selectChat).title, Option.some(title))
    }).pipe(Effect.provide(layer))
  })

  it.effect('asks the model for a title within the title limit', () => {
    const { prompts, layer } = makeChatTitleHarness(answering('Lisbon weekend'))
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* runTitle

      const [system] = prompts[0]?.content ?? []
      assert.strictEqual(system?.role, 'system')
      assert.include(system?.content, `at most ${maxTitleLength} characters`)
    }).pipe(Effect.provide(layer))
  })

  it.effect('fails and leaves the chat untitled when the model fails', () => {
    const { writes, logs, layer } = makeChatTitleHarness(Effect.fail(providerError))
    return Effect.gen(function* () {
      yield* arrangeChat()

      const exit = yield* runTitle

      assert.isTrue(Exit.isFailure(exit))
      assert.deepStrictEqual((yield* selectChat).title, Option.none())
      assert.deepStrictEqual(writes, [])
      assert.deepStrictEqual(logs, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(untitledOpenings))('leaves the chat untitled after %s', (opening) => {
    const { text, answer, modelCalls } = untitledOpenings[opening]
    const { writes, prompts, logs, layer } = makeChatTitleHarness(answer)
    return Effect.gen(function* () {
      yield* arrangeChat(text)

      yield* runTitle

      assert.deepStrictEqual(writes, [])
      assert.strictEqual(prompts.length, modelCalls)
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: nothing to title']])
    }).pipe(Effect.provide(layer))
  })
})

const stage = buildStage()

const QueueClientMiniStack = QueueClient.layer({
  queueName: (name) => buildResourceName(stage, name),
  lockExpiration: '30 seconds',
  lockRefreshInterval: '10 seconds',
}).pipe(
  Layer.provide(QueueTransport.layerSqs),
  Layer.provide(Layer.effectDiscard(Effect.orDie(provision(resources, stage)))),
)

layer(AwsClientsMiniStack, { timeout: '60 seconds' })('ChatTitleJob on SQS', (it) => {
  it.effect('the worker titles the chat of a job enqueued on the queue', () => {
    const harness = makeChatTitleHarness(answering('Lisbon weekend'))
    return Effect.gen(function* () {
      const first = yield* arrangeChat()

      const titled = yield* Effect.gen(function* () {
        yield* Layer.build(ChatTitleJob.worker)
        yield* (yield* ChatTitleJob).enqueue(first)
        return yield* Effect.repeat(selectChat, {
          until: (chat) => Option.isSome(chat.title),
          schedule: Schedule.spaced('50 millis'),
        })
      }).pipe(Effect.scoped)

      assert.deepStrictEqual(titled.title, Option.some(ChatTitle.make('Lisbon weekend')))
    }).pipe(
      TestClock.withLive,
      Effect.provide(
        Layer.mergeAll(ChatTitleJob.layer, harness.layer).pipe(
          Layer.provideMerge(QueueClientMiniStack),
        ),
      ),
    )
  })
})
