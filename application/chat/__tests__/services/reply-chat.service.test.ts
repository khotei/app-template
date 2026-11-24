import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import {
  Array as Arr,
  DateTime,
  Effect,
  Exit,
  Fiber,
  Option,
  Predicate,
  pipe,
  Schema,
  type Types,
  UndefinedOr,
} from 'effect'
import { TestClock } from 'effect/testing'

import type {
  MessageColumns,
  RunColumns,
  RunEntitySelectWhere,
  RunEntitySet,
  RunEntityWhere,
} from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, recordLogs } from '@app-template/packages/testing'

import { AssistantReply } from '#chat/domain/assistant.model'
import { Message, MessageFields } from '#chat/domain/message.model'
import { RunNotFoundError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { ReplyChatService } from '#chat/services/reply-chat.service'
import {
  assistantMessageAt,
  chatId,
  firstMessage,
  queuedRun,
  userMessageAt,
} from '#testing/chat/chat.test-fixture'
import { type ChatRepositoryMocks, layerChatTest } from '#testing/chat/chat.test-layer'
import { holdCall } from '#testing/chat/chat.test-util'
import { recordMessageAssistant } from '#testing/chat/message-assistant.test-fake'

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

/** `queuedRun` as another delivery failed it, finding it started. */
const failedElsewhere = new Run({
  ...queuedRun,
  status: 'failed',
  failure: Option.some({ cause: 'RunStartedError' }),
})

/** The Run a retry queues for `queuedRun`'s message once `queuedRun` failed. */
const retried = new Run({ ...queuedRun, id: RunId.make('0192d4e0-7b3a-7c00-8000-000000000032') })

/** Whether `run` holds where `where` holds, as the store filters. */
const holdsWhere = (
  where: Types.Simplify<Partial<RunEntityWhere & Pick<RunColumns, 'userMessageId'>>>,
): Predicate.Predicate<Pick<RunColumns, 'id' | 'userMessageId' | 'status'>> =>
  Predicate.and(
    Predicate.and(
      (run) =>
        UndefinedOr.match(where.id, { onUndefined: () => true, onDefined: (id) => id === run.id }),
      (run) =>
        UndefinedOr.match(where.userMessageId, {
          onUndefined: () => true,
          onDefined: (id) => id === run.userMessageId,
        }),
    ),
    (run) =>
      UndefinedOr.match(where.status, {
        onUndefined: () => true,
        onDefined: (statuses) => Arr.contains(statuses, run.status),
      }),
  )

/** The writes a reply makes, each as it was handed to its repository. */
interface Writes {
  readonly runs: Array<readonly [RunEntitySet, RunEntityWhere]>
  readonly messages: Array<MessageColumns>
}

const noWrites = (): Writes => ({ runs: [], messages: [] })

/**
 * The store's Runs, `runs` at first: a read finds the first its `where` holds for, and an update
 * dies unless its `where` holds for a Run, as the guard in the write does; `settle` replaces them,
 * as another writer does.
 */
function storeRuns(writes: Writes, ...runs: ReadonlyArray<Run>) {
  let stored = runs
  const find = (where: Parameters<typeof holdsWhere>[0]) => Arr.findFirst(stored, holdsWhere(where))
  return {
    settle: (...settled: ReadonlyArray<Run>) =>
      Effect.sync(() => {
        stored = settled
      }),
    selectOne: (where: RunEntitySelectWhere) =>
      find(where).pipe(Option.map(encodeWith(Run)), Effect.transposeOption),
    update: (set: RunEntitySet, where: RunEntityWhere) =>
      find(where).pipe(
        Option.match({
          onNone: () => Effect.die('no run was updated'),
          onSome: (moved) =>
            Effect.sync(() => {
              writes.runs.push([set, where])
              stored = Arr.map(stored, (run) =>
                run.id === moved.id ? new Run({ ...run, status: set.status }) : run,
              )
            }),
        }),
      ),
  }
}

/** The reads of a chat holding `history`, over `runs`, every message write kept in `writes`. */
const replyingTo = (
  writes: Writes,
  {
    runs,
    history = [firstMessage],
  }: {
    readonly runs: Pick<ReturnType<typeof storeRuns>, 'selectOne' | 'update'>
    readonly history?: ReadonlyArray<Message>
  },
): ChatRepositoryMocks => ({
  runs: { selectOne: runs.selectOne, update: runs.update },
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

const reply = ReplyChatService.use((replies) => replies.reply(queuedRun.userMessageId))

describe('ReplyChatService', () => {
  it.effect(
    "reply moves the Run to generating, then writes the assistant's message and done",
    () => {
      const held = holdCall()
      const slowReply = held.hold.pipe(Effect.andThen(Effect.sleep('1 second')), Effect.as(sure))
      const assistant = recordMessageAssistant(slowReply)
      const { logs, layer: logger } = recordLogs()
      const writes = noWrites()
      return Effect.gen(function* () {
        const running = yield* Effect.forkChild(reply)
        yield* held.reached
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
          yield* encodeWith(Run.update)(done),
          { id: queuedRun.id, status: ['generating'] },
        ])
        assert.deepStrictEqual(logs, [])
      }).pipe(
        Effect.provide([
          layerChatTest(replyingTo(writes, { runs: storeRuns(writes, queuedRun) }), {
            messageAssistant: assistant.layer,
          }),
          logger,
        ]),
      )
    },
  )

  it.effect('reply dies with the assistant and fails the Run it started', () => {
    const assistant = recordMessageAssistant(Effect.die('provider exploded'))
    const writes = noWrites()
    return Effect.gen(function* () {
      const exit = yield* reply.pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assert.deepStrictEqual(moves(writes), ['queued → generating', 'generating → failed'])
      assert.include(lastWrite(writes).cause, 'provider exploded')
    }).pipe(
      Effect.provide(
        layerChatTest(replyingTo(writes, { runs: storeRuns(writes, queuedRun) }), {
          messageAssistant: assistant.layer,
        }),
      ),
    )
  })

  it.effect('reply interrupted while the assistant answers fails the Run it started', () => {
    const held = holdCall()
    const assistant = recordMessageAssistant(held.hold.pipe(Effect.as(sure)))
    const writes = noWrites()
    return Effect.gen(function* () {
      const running = yield* Effect.forkChild(reply)
      yield* held.reached
      yield* Fiber.interrupt(running)

      assert.strictEqual(lastWrite(writes).move, 'generating → failed')
    }).pipe(
      Effect.provide(
        layerChatTest(replyingTo(writes, { runs: storeRuns(writes, queuedRun) }), {
          messageAssistant: assistant.layer,
        }),
      ),
    )
  })

  it.effect('reply interrupted while it reads its Run still starts it, then fails it', () => {
    const held = holdCall()
    const writes = noWrites()
    const runs = storeRuns(writes, queuedRun)
    const heldRead = (where: RunEntitySelectWhere) =>
      held.hold.pipe(Effect.andThen(runs.selectOne(where)))
    return Effect.gen(function* () {
      const running = yield* Effect.forkChild(reply)
      yield* held.reached
      const interrupting = yield* Fiber.interrupt(running).pipe(
        Effect.forkChild({ startImmediately: true }),
      )
      yield* held.release
      yield* Fiber.join(interrupting)

      assert.deepStrictEqual(moves(writes), ['queued → generating', 'generating → failed'])
    }).pipe(
      Effect.provide(
        layerChatTest(replyingTo(writes, { runs: { ...runs, selectOne: heldRead } }), {
          messageAssistant: recordMessageAssistant(Effect.succeed(sure)).layer,
        }),
      ),
    )
  })

  it.effect(
    'reply of a generating Run fails RunStartedError, failing the Run as its worker stopped, unasked',
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
          layerChatTest(replyingTo(writes, { runs: storeRuns(writes, generating) }), {
            messageAssistant: assistant.layer,
          }),
        ),
      )
    },
  )

  it.effect("reply prompts with the chat's messages in order", () => {
    const assistant = recordMessageAssistant(Effect.succeed(sure))
    const writes = noWrites()
    return Effect.gen(function* () {
      yield* ReplyChatService.use((replies) => replies.reply(lastRun.userMessageId))

      assertEquals(yield* assistant.histories, [[whatIsThis, aPhoto, andAgain, andNow]])
    }).pipe(
      Effect.provide(
        layerChatTest(
          replyingTo(writes, {
            runs: storeRuns(writes, lastRun),
            history: [whatIsThis, aPhoto, andAgain, andNow],
          }),
          { messageAssistant: assistant.layer },
        ),
      ),
    )
  })

  it.effect(
    'reply dies on a done write to a Run settled meanwhile, failing no Run and taking its message back',
    () => {
      const held = holdCall()
      const assistant = recordMessageAssistant(held.hold.pipe(Effect.as(sure)))
      const { logs, layer: logger } = recordLogs()
      const writes = noWrites()
      const runs = storeRuns(writes, queuedRun)
      return Effect.gen(function* () {
        const running = yield* reply.pipe(Effect.exit, Effect.forkChild)
        yield* held.reached
        yield* runs.settle(doneElsewhere)
        yield* held.release
        const exit = yield* Fiber.join(running)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(moves(writes), ['queued → generating'])
        assert.deepStrictEqual(logs, [])
      }).pipe(
        Effect.provide([
          layerChatTest(replyingTo(writes, { runs }), { messageAssistant: assistant.layer }),
          logger,
        ]),
      )
    },
  )

  it.effect(
    "reply losing its generating write to a rival delivery dies, leaving the rival's Run to it",
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const writes = noWrites()
      const runs = storeRuns(writes, queuedRun)
      // The rival starts the Run right after this reply reads it queued.
      const rivalStarts = (where: RunEntitySelectWhere) =>
        runs.selectOne(where).pipe(Effect.tap(() => runs.settle(generating)))
      return Effect.gen(function* () {
        const exit = yield* reply.pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(moves(writes), [])
        assertEquals(yield* assistant.histories, [])
      }).pipe(
        Effect.provide(
          layerChatTest(replyingTo(writes, { runs: { ...runs, selectOne: rivalStarts } }), {
            messageAssistant: assistant.layer,
          }),
        ),
      )
    },
  )

  it.effect(
    "a failed Run's job delivered again after its retry starts the retry's Run, whose own job then fails it as started",
    () => {
      const held = holdCall()
      const assistant = recordMessageAssistant(held.hold.pipe(Effect.as(sure)))
      const writes = noWrites()
      return Effect.gen(function* () {
        const replies = yield* ReplyChatService

        const again = yield* replies
          .reply(queuedRun.userMessageId)
          .pipe(Effect.exit, Effect.forkChild)
        yield* held.reached
        const own = yield* replies.reply(retried.userMessageId).pipe(Effect.flip)
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
          layerChatTest(replyingTo(writes, { runs: storeRuns(writes, retried) }), {
            messageAssistant: assistant.layer,
          }),
        ),
      )
    },
  )

  it.effect(
    "a reply that dies once its Run was failed elsewhere and retried fails no Run, the retry's included",
    () => {
      const held = holdCall()
      const assistant = recordMessageAssistant(
        held.hold.pipe(Effect.andThen(Effect.die('provider exploded'))),
      )
      const writes = noWrites()
      const runs = storeRuns(writes, queuedRun)
      return Effect.gen(function* () {
        const running = yield* reply.pipe(Effect.exit, Effect.forkChild)
        yield* held.reached
        yield* runs.settle(failedElsewhere, retried)
        yield* held.release
        const exit = yield* Fiber.join(running)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(
          Arr.map(writes.runs, ([set, where]) => [where.id, `${where.status} → ${set.status}`]),
          [[queuedRun.id, 'queued → generating']],
        )
      }).pipe(
        Effect.provide(
          layerChatTest(replyingTo(writes, { runs }), { messageAssistant: assistant.layer }),
        ),
      )
    },
  )

  it.effect.each([
    { name: 'settled before it', selectOne: storeRuns(noWrites(), doneElsewhere).selectOne },
    { name: 'the store finds none of', selectOne: () => Effect.succeedNone },
  ])(
    'reply of a Run $name fails RunNotFoundError, failing no Run and asking no assistant',
    ({ selectOne }) => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      return Effect.gen(function* () {
        const error = yield* reply.pipe(Effect.flip)

        assertSchemaEquals(
          RunNotFoundError,
          error,
          new RunNotFoundError({ where: { userMessageId: queuedRun.userMessageId } }),
        )
        assertEquals(yield* assistant.histories, [])
      }).pipe(
        // No `update`: a write would die on it.
        Effect.provide(
          layerChatTest({ runs: { selectOne } }, { messageAssistant: assistant.layer }),
        ),
      )
    },
  )
})
