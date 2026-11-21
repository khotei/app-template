import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import {
  Array as Arr,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Predicate,
  pipe,
  Schema,
  UndefinedOr,
} from 'effect'
import { TestClock } from 'effect/testing'

import type {
  ChatEntitySet,
  ChatEntityWhere,
  MessageColumns,
  RunColumns,
  RunEntitySet,
  RunEntityWhere,
} from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch, recordLogs } from '@app-template/packages/testing'

import { AssistantReply } from '#chat/domain/assistant.model'
import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { Message, MessageFields } from '#chat/domain/message.model'
import { RunNotFoundError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { RunFields } from '#chat/domain/run-fields.model'
import { ReplyChatService } from '#chat/services/reply-chat.service'
import {
  assistantMessageAt,
  chat,
  chatId,
  firstMessage,
  messageId,
  queuedRun,
  userMessageAt,
} from '#testing/chat/chat.test-fixture'
import { type ChatRepositoryMocks, layerChatTest } from '#testing/chat/chat.test-layer'
import { recordChatAssistant } from '#testing/chat/chat-assistant.test-fake'
import {
  holdAssistantCall,
  recordMessageAssistant,
} from '#testing/chat/message-assistant.test-fake'

const at = (millis: number) => DateTime.makeUnsafe(millis)

const sure = new AssistantReply({ text: 'Sure.' })

const whatIsThis = userMessageAt(1, 'What is this?')
const aPhoto = assistantMessageAt(2, 'A photo.')
const andAgain = userMessageAt(3, 'And again?')
const andNow = userMessageAt(4, 'And now?')

/** The queued Run of `andNow`, the history's last message. */
const lastRun = new Run({
  id: queuedRun.id,
  chatId,
  userMessage: andNow,
  userMessageId: andNow.id,
  createdAt: andNow.createdAt,
  updatedAt: andNow.createdAt,
})

const elsewhereReply = assistantMessageAt(5, 'Done elsewhere.')

const doneElsewhere = new Run({
  ...queuedRun,
  status: 'done',
  assistantMessageId: Option.some(elsewhereReply.id),
  assistantMessage: Option.some(elsewhereReply),
})

const generating = new Run({ ...queuedRun, status: 'generating' })

/** The Run a retry queues for `queuedRun`'s message once `queuedRun` failed. */
const retried = new Run({ ...queuedRun, id: RunId.make('0192d4e0-7b3a-7c00-8000-000000000032') })
const retriedGenerating = new Run({ ...retried, status: 'generating' })
const retriedFailed = new Run({
  ...retried,
  status: 'failed',
  failure: Option.some({ cause: 'RunStartedError' }),
})

/** Whether `row` holds where `where` holds, as the store filters. */
const holdsWhere = (where: RunEntityWhere): Predicate.Predicate<RunColumns> =>
  Predicate.and(
    Predicate.and(
      (row) =>
        UndefinedOr.match(where.id, { onUndefined: () => true, onDefined: (id) => id === row.id }),
      (row) =>
        UndefinedOr.match(where.userMessageId, {
          onUndefined: () => true,
          onDefined: (id) => id === row.userMessageId,
        }),
    ),
    (row) =>
      UndefinedOr.match(where.status, {
        onUndefined: () => true,
        onDefined: (statuses) => Arr.contains(statuses, row.status),
      }),
  )

/**
 * A Run read that returns `reads` in turn, the last one from then on, and none of one outside
 * the `where`, as the store filters them.
 */
const readsInTurn = (...reads: Arr.NonEmptyReadonlyArray<Run>) => {
  let turn = 0
  return (where: RunEntityWhere) =>
    Effect.sync(() =>
      Arr.get(reads, turn++).pipe(Option.getOrElse(() => Arr.lastNonEmpty(reads))),
    ).pipe(
      Effect.flatMap((run) => encodeWith(Run)(run)),
      Effect.map(Option.liftPredicate(holdsWhere(where))),
    )
}

/** The writes a reply makes, each as it was handed to its repository. */
interface Writes {
  readonly runs: Array<readonly [RunEntitySet, RunEntityWhere]>
  readonly messages: Array<MessageColumns>
}

const noWrites = (): Writes => ({ runs: [], messages: [] })

/** The reads of `run`'s chat holding `history`, every write kept in `writes`. */
const replyingTo = (
  writes: Writes,
  {
    runs,
    history = [firstMessage],
  }: { readonly runs: ReturnType<typeof readsInTurn>; readonly history?: ReadonlyArray<Message> },
): ChatRepositoryMocks => ({
  runs: {
    selectOne: runs,
    update: (...update) =>
      Effect.sync(() => {
        writes.runs.push(update)
      }),
  },
  messages: {
    selectMany: () => Effect.forEach(history, (message) => encodeWith(Message)(message)),
    insert: (row) =>
      Effect.sync(() => {
        writes.messages.push(row)
      }),
  },
})

/** Each Run write as the status its guard read, then the status it writes. */
const moves = (writes: Writes) =>
  Arr.map(writes.runs, ([set, where]) => `${where.status} → ${set.status}`)

/** The last Run write: its move, and its failure when it fails the Run. */
const lastWrite = (writes: Writes) =>
  pipe(
    writes.runs,
    Arr.last,
    Option.map(([set, where]) => ({
      move: `${where.status} → ${set.status}`,
      cause: set.failure?.cause,
    })),
    Option.getOrThrow,
  )

const reply = ReplyChatService.use((replyChat) => replyChat.replyMessage(queuedRun.userMessageId))

describe('ReplyChatService', () => {
  it.effect(
    "replyMessage moves the Run to generating, then writes the assistant's message and done",
    () => {
      const held = holdAssistantCall()
      const slowReply = held.hold.pipe(Effect.andThen(Effect.sleep('1 second')), Effect.as(sure))
      const assistant = recordMessageAssistant(slowReply)
      const { logs, layer: logger } = recordLogs()
      const writes = noWrites()
      return Effect.gen(function* () {
        const running = yield* Effect.forkChild(reply)
        yield* held.asked
        const asked = moves(writes)
        yield* held.release
        yield* TestClock.adjust('500 millis')
        const halfway = moves(writes)
        yield* TestClock.adjust('500 millis')
        yield* Fiber.join(running)

        const generatingMoves = ['queued → generating']
        assert.deepStrictEqual(asked, generatingMoves)
        assert.deepStrictEqual(halfway, generatingMoves)
        const stored = yield* decodeWith(Schema.Array(MessageFields))(writes.messages).pipe(
          Effect.head,
        )
        const message = new Message({
          author: 'assistant',
          id: stored.id,
          chatId,
          text: 'Sure.',
          createdAt: at(1000),
        })
        assert.deepStrictEqual(writes.messages, [yield* encodeWith(MessageFields)(message)])
        const done = new Run({
          ...queuedRun,
          status: 'done',
          updatedAt: at(1000),
          assistantMessageId: Option.some(message.id),
          assistantMessage: Option.some(message),
        })
        assert.deepStrictEqual(writes.runs.at(-1), [
          yield* encodeWith(RunFields)(done),
          { id: queuedRun.id, status: ['generating'] },
        ])
        assert.deepStrictEqual(logs, [])
      }).pipe(
        Effect.provide([
          layerChatTest(replyingTo(writes, { runs: readsInTurn(queuedRun) })).pipe(
            Layer.provideMerge(assistant.layer),
          ),
          logger,
        ]),
      )
    },
  )

  it.effect('replyMessage dies with the assistant and fails the Run it reads again first', () => {
    const assistant = recordMessageAssistant(Effect.die('provider exploded'))
    const writes = noWrites()
    return Effect.gen(function* () {
      const exit = yield* reply.pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assert.strictEqual(lastWrite(writes).move, 'generating → failed')
      assert.include(lastWrite(writes).cause, 'provider exploded')
    }).pipe(
      Effect.provide(
        layerChatTest(replyingTo(writes, { runs: readsInTurn(queuedRun, generating) })).pipe(
          Layer.provideMerge(assistant.layer),
        ),
      ),
    )
  })

  it.effect(
    'replyMessage interrupted while the assistant answers fails the Run it reads again',
    () => {
      const held = holdAssistantCall()
      const assistant = recordMessageAssistant(held.hold.pipe(Effect.as(sure)))
      const writes = noWrites()
      return Effect.gen(function* () {
        const running = yield* Effect.forkChild(reply)
        yield* held.asked
        yield* Fiber.interrupt(running)

        assert.strictEqual(lastWrite(writes).move, 'generating → failed')
      }).pipe(
        Effect.provide(
          layerChatTest(replyingTo(writes, { runs: readsInTurn(queuedRun, generating) })).pipe(
            Layer.provideMerge(assistant.layer),
          ),
        ),
      )
    },
  )

  it.effect('replyMessage interrupted while it reads its Run fails the Run it reads again', () => {
    const reading = Deferred.makeUnsafe<void>()
    const readAgain = readsInTurn(queuedRun)
    let reads = 0
    const firstNeverAnswers = (where: RunEntityWhere) =>
      reads++ === 0
        ? Deferred.succeed(reading, undefined).pipe(Effect.andThen(Effect.never))
        : readAgain(where)
    const writes = noWrites()
    return Effect.gen(function* () {
      const running = yield* Effect.forkChild(reply)
      yield* Deferred.await(reading)
      yield* Fiber.interrupt(running)

      assert.deepStrictEqual(moves(writes), ['queued → failed'])
    }).pipe(
      Effect.provide(
        layerChatTest(replyingTo(writes, { runs: firstNeverAnswers })).pipe(
          Layer.provideMerge(recordMessageAssistant(Effect.succeed(sure)).layer),
        ),
      ),
    )
  })

  it.effect(
    'replyMessage of a generating Run fails RunStartedError, failing the Run as its worker stopped, unasked',
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const writes = noWrites()
      return Effect.gen(function* () {
        const error = yield* reply.pipe(Effect.flip)

        assert.strictEqual(error._tag, 'RunStartedError')
        assert.deepStrictEqual(moves(writes), ['generating → failed'])
        assert.include(
          lastWrite(writes).cause,
          'the worker that started the Run stopped before it ended',
        )
        assertEquals(yield* assistant.histories, [])
      }).pipe(
        Effect.provide(
          layerChatTest(replyingTo(writes, { runs: readsInTurn(generating) })).pipe(
            Layer.provideMerge(assistant.layer),
          ),
        ),
      )
    },
  )

  it.effect("replyMessage prompts with the chat's messages in order", () => {
    const assistant = recordMessageAssistant(Effect.succeed(sure))
    return Effect.gen(function* () {
      yield* ReplyChatService.use((replyChat) => replyChat.replyMessage(lastRun.userMessageId))

      assertEquals(yield* assistant.histories, [[whatIsThis, aPhoto, andAgain, andNow]])
    }).pipe(
      Effect.provide(
        layerChatTest(
          replyingTo(noWrites(), {
            runs: readsInTurn(lastRun),
            history: [whatIsThis, aPhoto, andAgain, andNow],
          }),
        ).pipe(Layer.provideMerge(assistant.layer)),
      ),
    )
  })

  it.effect(
    'replyMessage dies on a done write the store refuses, leaving the Run it then reads settled unfailed',
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const { logs, layer: logger } = recordLogs()
      const writes = noWrites()
      const mocks = replyingTo(writes, { runs: readsInTurn(queuedRun, doneElsewhere) })
      return Effect.gen(function* () {
        const exit = yield* reply.pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(moves(writes), ['queued → generating'])
        assert.deepStrictEqual(logs, [])
      }).pipe(
        Effect.provide([
          layerChatTest({
            ...mocks,
            runs: {
              ...mocks.runs,
              update: (set, where) =>
                set.status === 'done'
                  ? Effect.die('no run was updated')
                  : Effect.sync(() => {
                      writes.runs.push([set, where])
                    }),
            },
          }).pipe(Layer.provideMerge(assistant.layer)),
          logger,
        ]),
      )
    },
  )

  it.effect(
    'replyMessage losing its generating write to a rival delivery dies, failing the Run the rival took',
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const writes = noWrites()
      const mocks = replyingTo(writes, { runs: readsInTurn(queuedRun, generating) })
      return Effect.gen(function* () {
        const exit = yield* reply.pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(moves(writes), ['generating → failed'])
        assertEquals(yield* assistant.histories, [])
      }).pipe(
        Effect.provide(
          layerChatTest({
            ...mocks,
            runs: {
              ...mocks.runs,
              update: (set, where) =>
                set.status === 'generating'
                  ? Effect.die('no run was updated')
                  : Effect.sync(() => {
                      writes.runs.push([set, where])
                    }),
            },
          }).pipe(Layer.provideMerge(assistant.layer)),
        ),
      )
    },
  )

  it.effect(
    "a failed Run's job delivered again after its retry starts the retry's Run, whose own job then fails it as started",
    () => {
      const held = holdAssistantCall()
      const assistant = recordMessageAssistant(held.hold.pipe(Effect.as(sure)))
      const writes = noWrites()
      const mocks = replyingTo(writes, {
        runs: readsInTurn(retried, retriedGenerating, retriedGenerating, retriedFailed),
      })
      return Effect.gen(function* () {
        const replyChat = yield* ReplyChatService

        const again = yield* replyChat
          .replyMessage(queuedRun.userMessageId)
          .pipe(Effect.exit, Effect.forkChild)
        yield* held.asked
        const own = yield* replyChat.replyMessage(retried.userMessageId).pipe(Effect.flip)
        yield* held.release
        const againExit = yield* Fiber.join(again)

        assert.strictEqual(own._tag, 'RunStartedError')
        assert.isTrue(Exit.hasDies(againExit))
        assert.deepStrictEqual(
          Arr.map(writes.runs, ([set, where]) => [where.id, `${where.status} → ${set.status}`]),
          [
            [retried.id, 'queued → generating'],
            [retried.id, 'generating → failed'],
          ],
        )
      }).pipe(
        Effect.provide(
          layerChatTest({
            ...mocks,
            runs: {
              ...mocks.runs,
              update: (set, where) =>
                set.status === 'done'
                  ? Effect.die('no run was updated')
                  : Effect.sync(() => {
                      writes.runs.push([set, where])
                    }),
            },
          }).pipe(Layer.provideMerge(assistant.layer)),
        ),
      )
    },
  )

  it.effect.each([
    { name: 'settled before it', selectOne: readsInTurn(doneElsewhere) },
    { name: 'the store finds none of', selectOne: () => Effect.succeedNone },
  ])('replyMessage of a Run $name fails RunNotFoundError, asking no assistant', ({ selectOne }) => {
    const assistant = recordMessageAssistant(Effect.succeed(sure))
    return Effect.gen(function* () {
      const error = yield* reply.pipe(Effect.flip)

      assertSchemaEquals(
        RunNotFoundError,
        error,
        new RunNotFoundError({ userMessageId: queuedRun.userMessageId }),
      )
      assertEquals(yield* assistant.histories, [])
    }).pipe(
      Effect.provide(
        layerChatTest({ runs: { selectOne } }).pipe(Layer.provideMerge(assistant.layer)),
      ),
    )
  })

  it.effect('replyTitle titles the chat of its first message while the chat is untitled', () => {
    const lisbonWeekend = ChatTitle.make('Lisbon weekend')
    const assistant = recordChatAssistant(Effect.succeed(lisbonWeekend))
    const { logs, layer: logger } = recordLogs()
    const updates: Array<readonly [ChatEntitySet, ChatEntityWhere]> = []
    return Effect.gen(function* () {
      yield* ReplyChatService.use((replyChat) => replyChat.replyTitle(messageId))

      assert.deepStrictEqual(updates, [
        [
          { title: lisbonWeekend, updatedAt: DateTime.toDateUtc(epoch) },
          { id: chatId, title: null },
        ],
      ])
      assertEquals(yield* assistant.texts, ['Plan a weekend in Lisbon'])
      assert.deepStrictEqual(logs, [])
    }).pipe(
      Effect.provide([
        layerChatTest({
          messages: {
            selectOne: () => encodeWith(Message)(firstMessage).pipe(Effect.map(Option.some)),
          },
          chats: {
            selectOne: () => encodeWith(Chat)(chat).pipe(Effect.map(Option.some)),
            update: (...update) =>
              Effect.sync(() => {
                updates.push(update)
              }),
          },
        }).pipe(Layer.provideMerge(assistant.layer)),
        logger,
      ]),
    )
  })
})
