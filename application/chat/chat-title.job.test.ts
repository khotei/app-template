import { assert, describe, it } from '@effect/vitest'
import {
  Array as Arr,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Record as Rec,
} from 'effect'
import { AiError, Prompt, type Response } from 'effect/ai'
import { TestClock } from 'effect/testing'

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
  ChatRepositoryPg,
  GenerateChatTitle,
  MessageRepositoryPg,
} from '@app-template/infrastructure/chat'
import { recordLogs } from '@app-template/testing'

import { ChatTitleJob } from '#application/chat/chat-title.job'
import { chatId, epoch, messageId, sentAt } from '#application/testing/chat.fixture'
import { DbWithUsers } from '#application/testing/chat.harness'
import { recordLanguageModel } from '#application/testing/language-model.fake'
import { owner } from '#application/testing/user.fixture'

type Answer = Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>

/**
 * The job's services on a fresh test database, recording its chat writes, its prompts and its
 * logs.
 */
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
  ).pipe(Layer.provide(ChatRepositoryPg))
  const { prompts, layer: model } = recordLanguageModel({ generateText: answer })
  const { logs, layer: logger } = recordLogs()
  const layer = Layer.mergeAll(chats, MessageRepositoryPg, model, logger).pipe(
    Layer.provide(DbWithUsers),
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

const runTitle = Effect.exit(ChatTitleJob.handle(queuedJob))

/**
 * An answer held back until `release` runs, so a change made once `asked` returns lands between
 * the take and the write.
 */
const holdAnswer = (text: string) => {
  const asked = Deferred.makeUnsafe<void>()
  const released = Deferred.makeUnsafe<void>()
  return {
    answer: Deferred.succeed(asked, undefined).pipe(
      Effect.andThen(Deferred.await(released)),
      Effect.andThen(answering(text)),
    ),
    asked: Deferred.await(asked),
    release: Deferred.succeed(released, undefined),
  }
}

type HeldAnswer = ReturnType<typeof holdAnswer>

const moments = {
  'before the take': {
    modelCalls: 0,
    run: <R>(held: HeldAnswer, change: Effect.Effect<void, never, R>) =>
      change.pipe(Effect.andThen(held.release), Effect.andThen(runTitle)),
  },
  'while the model answers': {
    modelCalls: 1,
    run: <R>(held: HeldAnswer, change: Effect.Effect<void, never, R>) =>
      Effect.gen(function* () {
        const running = yield* Effect.forkChild(runTitle)
        yield* held.asked
        yield* change
        yield* held.release
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
    const { writes, layer } = makeChatTitleHarness(answering('Lisbon weekend'))
    return Effect.gen(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(sentAt))
      yield* arrangeChat()

      yield* runTitle

      assert.deepStrictEqual(
        Arr.map(writes, (chat) => [chat.title, DateTime.toEpochMillis(chat.updatedAt)]),
        [[Option.some('Lisbon weekend'), 0]],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(moments))('keeps a title the user set %s', (moment) => {
    const held = holdAnswer('Lisbon weekend')
    const { prompts, logs, layer } = makeChatTitleHarness(held.answer)
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* moments[moment].run(held, renameChat)

      assert.deepStrictEqual((yield* selectChat).title, Option.some(ChatTitle.make('Trip')))
      assert.strictEqual(prompts.length, moments[moment].modelCalls)
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: already titled']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(moments))(
    'ends without a write when the chat is deleted %s',
    (moment) => {
      const held = holdAnswer('Lisbon weekend')
      const { writes, prompts, logs, layer } = makeChatTitleHarness(held.answer)
      return Effect.gen(function* () {
        yield* arrangeChat()

        yield* moments[moment].run(held, deleteChat)

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
