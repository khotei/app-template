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
  pipe,
  Schema,
  UndefinedOr,
} from 'effect'
import { TestClock } from 'effect/testing'

import type { MessageColumns, RunEntitySet, RunEntityWhere } from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, recordLogs } from '@app-template/packages/testing'

import { AssistantReply } from '#chat/domain/assistant.model'
import { Message, MessageFields } from '#chat/domain/message.model'
import { RunNotFoundError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import { RunFields } from '#chat/domain/run-fields.model'
import { AskRunService } from '#chat/services/ask-run.service'
import {
  assistantMessageAt,
  chatId,
  firstMessage,
  queuedRun,
  userMessageAt,
} from '#testing/chat/chat.test-fixture'
import { type ChatRepositoryMocks, layerChatTest } from '#testing/chat/chat.test-layer'
import {
  holdAssistantCall,
  recordMessageAssistant,
} from '#testing/chat/message-assistant.test-fake'
import { layerRefusingQueueTest } from '#testing/chat/queue-sender.test-fake'

/** The services over `queue` and a store that reads `queuedRun`, whose updates land in `updates`. */
function recordUpdates<Queue>(queue: Layer.Layer<Queue>) {
  const updates: Array<RunEntitySet> = []
  const layer = layerChatTest({
    runs: {
      selectOne: () => encodeWith(Run)(queuedRun).pipe(Effect.map(Option.some)),
      update: (set) =>
        Effect.sync(() => {
          updates.push(set)
        }),
    },
  }).pipe(Layer.provideMerge(queue))
  return { updates, layer }
}

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

/**
 * A Run read that answers `reads` in turn, the last one from then on, and none of one outside
 * the `where`'s statuses, as the store filters them.
 */
const readsInTurn = (...reads: Arr.NonEmptyReadonlyArray<Run>) => {
  let turn = 0
  return (where: RunEntityWhere) =>
    Effect.sync(() =>
      Arr.get(reads, turn++).pipe(Option.getOrElse(() => Arr.lastNonEmpty(reads))),
    ).pipe(
      Effect.flatMap((run) => encodeWith(Run)(run)),
      Effect.map(
        Option.liftPredicate((row) =>
          UndefinedOr.match(where.status, {
            onUndefined: () => true,
            onDefined: (statuses) => Arr.contains(statuses, row.status),
          }),
        ),
      ),
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

const reply = AskRunService.use((askRun) => askRun.reply(queuedRun.id))

describe('AskRunService', () => {
  it.effect("ask fails the Run with the text of SQS's refusal, and answers the failed Run", () => {
    const { updates, layer } = recordUpdates(layerRefusingQueueTest())
    return Effect.gen(function* () {
      const askRun = yield* AskRunService

      const sent = yield* askRun.ask(queuedRun)

      assert.strictEqual(sent.status, 'failed')
      assert.include(Option.getOrThrow(sent.failure).cause, 'SQS is unavailable')
      assert.deepStrictEqual(
        Arr.map(updates, ({ status }) => status),
        ['failed'],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect('ask interrupted while SQS refuses the job still fails the Run', () => {
    const held = holdAssistantCall()
    const { updates, layer } = recordUpdates(layerRefusingQueueTest(held.hold))
    return Effect.gen(function* () {
      const askRun = yield* AskRunService

      const running = yield* askRun.ask(queuedRun).pipe(Effect.forkChild)
      yield* held.asked
      const interrupting = yield* Fiber.interrupt(running).pipe(
        Effect.forkChild({ startImmediately: true }),
      )
      yield* held.release
      yield* Fiber.join(interrupting)

      assert.deepStrictEqual(
        Arr.map(updates, ({ status }) => status),
        ['failed'],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    "reply moves the Run through preparing and generating, then writes the assistant's message and done",
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

        const generatingMoves = ['queued → preparing', 'preparing → generating']
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

  it.effect('reply dies with the assistant and fails the Run it reads again first', () => {
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

  it.effect('reply interrupted while the assistant answers fails the Run it reads again', () => {
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
  })

  it.effect('reply interrupted while it reads its Run fails the Run it reads again', () => {
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

  it.effect.each([{ status: 'preparing' }, { status: 'generating' }] as const)(
    'reply of a $status Run fails RunStartedError, failing the Run as its worker stopped, unasked',
    ({ status }) => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const writes = noWrites()
      return Effect.gen(function* () {
        const error = yield* reply.pipe(Effect.flip)

        assert.strictEqual(error._tag, 'RunStartedError')
        assert.deepStrictEqual(moves(writes), [`${status} → failed`])
        assert.include(
          lastWrite(writes).cause,
          'the worker that started the Run stopped before it ended',
        )
        assertEquals(yield* assistant.histories, [])
      }).pipe(
        Effect.provide(
          layerChatTest(
            replyingTo(writes, { runs: readsInTurn(new Run({ ...queuedRun, status })) }),
          ).pipe(Layer.provideMerge(assistant.layer)),
        ),
      )
    },
  )

  it.effect("reply prompts with the chat's messages in order", () => {
    const assistant = recordMessageAssistant(Effect.succeed(sure))
    return Effect.gen(function* () {
      yield* reply

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
    'reply dies on a done write the store refuses, leaving the Run it then reads settled unfailed',
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const { logs, layer: logger } = recordLogs()
      const writes = noWrites()
      const mocks = replyingTo(writes, { runs: readsInTurn(queuedRun, doneElsewhere) })
      return Effect.gen(function* () {
        const exit = yield* reply.pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(moves(writes), ['queued → preparing', 'preparing → generating'])
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
    'reply losing its preparing write to a rival delivery dies, failing the Run the rival took',
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const writes = noWrites()
      const mocks = replyingTo(writes, {
        runs: readsInTurn(queuedRun, new Run({ ...queuedRun, status: 'preparing' })),
      })
      return Effect.gen(function* () {
        const exit = yield* reply.pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(moves(writes), ['preparing → failed'])
        assertEquals(yield* assistant.histories, [])
      }).pipe(
        Effect.provide(
          layerChatTest({
            ...mocks,
            runs: {
              ...mocks.runs,
              update: (set, where) =>
                set.status === 'preparing'
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
  ])('reply of a Run $name fails RunNotFoundError, asking no assistant', ({ selectOne }) => {
    const assistant = recordMessageAssistant(Effect.succeed(sure))
    return Effect.gen(function* () {
      const error = yield* reply.pipe(Effect.flip)

      assertSchemaEquals(RunNotFoundError, error, new RunNotFoundError({ id: queuedRun.id }))
      assertEquals(yield* assistant.histories, [])
    }).pipe(
      Effect.provide(
        layerChatTest({ runs: { selectOne } }).pipe(Layer.provideMerge(assistant.layer)),
      ),
    )
  })
})
