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
  Struct,
  UndefinedOr,
} from 'effect'
import { Model } from 'effect/schema'
import { TestClock } from 'effect/testing'

import { UserId } from '@app-template/application/user'
import type {
  ChatEntitySet,
  MessageColumns,
  RunColumns,
  RunEntitySelectWhere,
  RunEntitySet,
  RunEntityWhere,
} from '@app-template/kernel/data'
import { SchemaCodec } from '@app-template/packages/schema'
import { assertSchemaEquals, recordLogs } from '@app-template/packages/testing'

import { Chat } from '#chat/domain/chat.model'
import { Message } from '#chat/domain/message.model'
import { Run, RunNotFoundError, RunStatus } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { ReplyChatService } from '#chat/services/reply-chat.service'
import {
  answeredBy,
  assistantMessageAt,
  assistantOverloaded,
  chat,
  chatId,
  firstMessage,
  owner,
  queuedRun,
  runUsage,
  sureReply as sure,
  unknownChatId,
  userMessageAt,
} from '#testing/chat/chat.test-fixture'
import {
  type ChatRepositoryMocks,
  layerChatTest,
  layerTransactionAround,
} from '#testing/chat/chat.test-layer'
import { holdCall } from '#testing/chat/chat.test-util'
import { recordChatAssistant } from '#testing/chat/chat-assistant.test-fake'

const at = (millis: number) => DateTime.makeUnsafe(millis)

const whatIsThis = userMessageAt(1, 'What is this?')
const aPhoto = assistantMessageAt(2, 'A photo.')
const andAgain = userMessageAt(3, 'And again?')
const andNow = userMessageAt(4, 'And now?')

/** The queued Run of `andNow`, the history's last message. */
const lastRun = new Run({
  id: queuedRun.id,
  chatId,
  userId: owner,
  userMessageId: andNow.id,
  createdAt: andNow.createdAt,
  updatedAt: andNow.createdAt,
})

const stranger = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')

const elsewhereReply = assistantMessageAt(5, 'Done elsewhere.')

const doneElsewhere = new Run({
  ...queuedRun,
  status: 'done',
  assistantMessageId: Option.some(elsewhereReply.id),
  usage: Option.some(runUsage),
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

/**
 * The filters the services send, the only ones this store understands: a key, its chat and user,
 * and a status or those of `in`. The repository's `where` takes every filter Drizzle has, so the store decodes
 * the one it is handed and dies on any other.
 */
const RunFilter = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  userMessageId: Schema.optionalKey(Schema.String),
  chatId: Schema.optionalKey(Schema.String),
  userId: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(
    Schema.Union([RunStatus, Schema.Struct({ in: Schema.Array(RunStatus) })]),
  ),
})
type RunFilter = typeof RunFilter.Type

const decodeRunFilter = Schema.decodeUnknownSync(RunFilter, { onExcessProperty: 'error' })

/** Whether `value` is what `condition` names: anything, or the value itself. */
const holds = <A>(condition: A | undefined, value: A) =>
  UndefinedOr.match(condition, { onUndefined: () => true, onDefined: (named) => named === value })

/** Whether `run` holds where `where` holds, as the store filters. */
const holdsWhere =
  (
    where: RunFilter,
  ): Predicate.Predicate<
    Pick<RunColumns, 'id' | 'userMessageId' | 'chatId' | 'userId' | 'status'>
  > =>
  (run) =>
    holds(where.id, run.id) &&
    holds(where.userMessageId, run.userMessageId) &&
    holds(where.chatId, run.chatId) &&
    holds(where.userId, run.userId) &&
    UndefinedOr.match(where.status, {
      onUndefined: () => true,
      onDefined: (status) =>
        Predicate.isString(status) ? status === run.status : Arr.contains(status.in, run.status),
    })

/** The writes a reply makes, each as it was handed to its repository. */
interface Writes {
  readonly runs: Array<readonly [RunEntitySet, RunFilter]>
  readonly messages: Array<MessageColumns>
  readonly chats: Array<ChatEntitySet>
}

const noWrites = (): Writes => ({ runs: [], messages: [], chats: [] })

/**
 * The store's Runs, `runs` at first: a read finds the first its `where` holds for, and an update
 * dies unless its `where` holds for a Run, as the guard in the write does; `settle` replaces them,
 * as another writer does.
 */
function storeRuns(writes: Writes, ...runs: ReadonlyArray<Run>) {
  let stored = runs
  const find = (where: RunFilter) => Arr.findFirst(stored, holdsWhere(where))
  return {
    settle: (...settled: ReadonlyArray<Run>) =>
      Effect.sync(() => {
        stored = settled
      }),
    selectOne: (where: RunEntitySelectWhere) =>
      find(decodeRunFilter(where)).pipe(
        Option.map(SchemaCodec.encode(Run)),
        Effect.transposeOption,
      ),
    update: (set: RunEntitySet, where: RunEntityWhere) =>
      find(decodeRunFilter(where)).pipe(
        Option.match({
          onNone: () => Effect.die('no run was updated'),
          onSome: (moved) =>
            Effect.sync(() => {
              writes.runs.push([set, decodeRunFilter(where)])
              stored = Arr.map(stored, (run) =>
                run.id === moved.id ? new Run({ ...run, status: set.status ?? run.status }) : run,
              )
            }),
        }),
      ),
  }
}

/** The reads of `asked`, `chat` unless a case gives one, holding `history`, over `runs`, every message and chat write kept in `writes`. */
const replyingTo = (
  writes: Writes,
  {
    runs,
    history = [firstMessage],
    asked = chat,
  }: {
    readonly runs: Pick<ReturnType<typeof storeRuns>, 'selectOne' | 'update'>
    readonly history?: ReadonlyArray<Message>
    readonly asked?: Chat
  },
): ChatRepositoryMocks => ({
  runs: { selectOne: runs.selectOne, update: runs.update },
  chats: {
    selectOne: () => SchemaCodec.encode(Chat)(asked).pipe(Effect.map(Option.some)),
    update: (set) =>
      Effect.sync(() => {
        writes.chats.push(set)
      }),
  },
  messages: {
    selectMany: () => Effect.forEach(history, (message) => SchemaCodec.encode(Message)(message)),
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

/** What the event of `run` names: its user message, chat and user. */
const eventOf = (run: Run) => Struct.pick(run, ['userMessageId', 'chatId', 'userId'])

const reply = Effect.gen(function* () {
  const replies = yield* ReplyChatService
  return yield* replies.reply(eventOf(queuedRun))
})

describe('ReplyChatService', () => {
  it.effect(
    "reply moves the Run to generating, then writes the assistant's message and done with the reply's usage",
    () => {
      const held = holdCall()
      const slowReply = held.hold.pipe(Effect.andThen(Effect.sleep('1 second')), Effect.as(sure))
      const assistant = recordChatAssistant({ reply: slowReply })
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
        const stored = yield* SchemaCodec.decode(Schema.Array(Message.insert))(
          writes.messages,
        ).pipe(Effect.head)
        const message = new Message({
          author: 'assistant',
          id: stored.id,
          chatId,
          userId: owner,
          text: 'Sure.',
          createdAt: at(1000),
        })
        assert.deepStrictEqual(writes.messages, [
          // An explicit time enters the insert variant marked as an override of its default.
          yield* SchemaCodec.encode(Message.insert)({
            ...message,
            createdAt: Model.Override(message.createdAt),
          }),
        ])
        const done = new Run({
          ...queuedRun,
          status: 'done',
          updatedAt: at(1000),
          assistantMessageId: Option.some(message.id),
          usage: Option.some(runUsage),
        })
        assert.deepStrictEqual(writes.runs.at(-1), [
          // An explicit time enters the update variant marked as an override of its default.
          yield* SchemaCodec.encode(Run.update)({
            ...done,
            updatedAt: Model.Override(done.updatedAt),
          }),
          { id: queuedRun.id, status: 'generating' },
        ])
        assert.deepStrictEqual(writes.chats, [])
        assert.deepStrictEqual(logs, [])
      }).pipe(
        Effect.provide([
          layerChatTest(replyingTo(writes, { runs: storeRuns(writes, queuedRun) }), {
            assistant: assistant.layer,
          }),
          logger,
        ]),
      )
    },
  )

  it.effect('reply dies with the assistant and fails the Run it started', () => {
    const assistant = recordChatAssistant({ reply: Effect.die('provider exploded') })
    const writes = noWrites()
    return Effect.gen(function* () {
      const exit = yield* reply.pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assert.deepStrictEqual(moves(writes), ['queued → generating', 'generating → failed'])
      assert.include(lastWrite(writes).cause, 'provider exploded')
    }).pipe(
      Effect.provide(
        layerChatTest(replyingTo(writes, { runs: storeRuns(writes, queuedRun) }), {
          assistant: assistant.layer,
        }),
      ),
    )
  })

  it.effect('reply interrupted while the assistant answers fails the Run it started', () => {
    const held = holdCall()
    const assistant = recordChatAssistant({ reply: held.hold.pipe(Effect.as(sure)) })
    const writes = noWrites()
    return Effect.gen(function* () {
      const running = yield* Effect.forkChild(reply)
      yield* held.reached
      yield* Fiber.interrupt(running)

      assert.strictEqual(lastWrite(writes).move, 'generating → failed')
    }).pipe(
      Effect.provide(
        layerChatTest(replyingTo(writes, { runs: storeRuns(writes, queuedRun) }), {
          assistant: assistant.layer,
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
          assistant: recordChatAssistant({ reply: Effect.succeed(sure) }).layer,
        }),
      ),
    )
  })

  it.effect(
    'reply of a generating Run fails RunStartedError, failing the Run as its worker stopped, unasked',
    () => {
      const assistant = recordChatAssistant({ reply: Effect.succeed(sure) })
      const writes = noWrites()
      return Effect.gen(function* () {
        const error = yield* reply.pipe(Effect.flip)

        assert.strictEqual(error._tag, 'RunStartedError')
        assert.deepStrictEqual(moves(writes), ['generating → failed'])
        assert.include(
          lastWrite(writes).cause,
          'the worker that started the Run stopped before it ended',
        )
        assertEquals(yield* assistant.contexts, [])
      }).pipe(
        Effect.provide(
          layerChatTest(replyingTo(writes, { runs: storeRuns(writes, generating) }), {
            assistant: assistant.layer,
          }),
        ),
      )
    },
  )

  it.effect(
    "reply whose prompt and text pass 0.8 of the assistant's tokens limit compacts the context before it stores the reply and ends its Run",
    () => {
      // 135 tokens of a limit of 150: the context is cut to a third of its 500 characters.
      const assistant = recordChatAssistant({ reply: Effect.succeed(sure) })
      const writes = noWrites()
      const long = userMessageAt(1, 'x'.repeat(300))
      const longReply = answeredBy(assistantMessageAt(2, 'x'.repeat(100)))
      const short = userMessageAt(3, 'x'.repeat(100))
      return Effect.gen(function* () {
        const replies = yield* ReplyChatService
        yield* replies.reply(eventOf(queuedRun))

        assert.deepStrictEqual(
          Arr.map(writes.chats, ({ context }) => context),
          [{ compacted: 'A summary.', headMessageId: short.id }],
        )
        assertEquals(yield* assistant.summarised, [[long, longReply]])
        assert.deepStrictEqual(moves(writes), ['queued → generating', 'generating → done'])
        assert.lengthOf(writes.messages, 1)
      }).pipe(
        Effect.provide(
          layerChatTest(
            replyingTo(writes, {
              runs: storeRuns(writes, queuedRun),
              history: [long, longReply, short],
            }),
            { assistant: assistant.layer, chatContextTokensLimit: 150 },
          ),
        ),
      )
    },
  )

  it.effect(
    "reply opens one transaction before its context is cut and closes it with the cut, the reply and its Run's end written",
    () => {
      const assistant = recordChatAssistant({ reply: Effect.succeed(sure) })
      const writes = noWrites()
      const written: Array<ReadonlyArray<number>> = []
      const count = Effect.sync(() => {
        written.push([writes.chats.length, writes.messages.length])
      })
      return Effect.gen(function* () {
        const replies = yield* ReplyChatService
        yield* replies.reply(eventOf(queuedRun))

        assert.deepStrictEqual(written, [
          [0, 0],
          [1, 1],
        ])
        assert.deepStrictEqual(moves(writes), ['queued → generating', 'generating → done'])
      }).pipe(
        Effect.provide(
          layerChatTest(
            replyingTo(writes, {
              runs: storeRuns(writes, queuedRun),
              history: [
                userMessageAt(1, 'x'.repeat(300)),
                answeredBy(assistantMessageAt(2, 'x'.repeat(100))),
                userMessageAt(3, 'x'.repeat(100)),
              ],
            }),
            {
              assistant: assistant.layer,
              chatContextTokensLimit: 150,
              transaction: layerTransactionAround(count),
            },
          ),
        ),
      )
    },
  )

  it.effect(
    'reply whose summary fails, asked with the summary the context had, fails its Run with the failure and stores no reply',
    () => {
      const long = userMessageAt(1, 'x'.repeat(300))
      const longReply = answeredBy(assistantMessageAt(2, 'x'.repeat(100)))
      const assistant = recordChatAssistant({
        reply: Effect.succeed(sure),
        summary: Effect.fail(assistantOverloaded),
      })
      const writes = noWrites()
      return Effect.gen(function* () {
        const replies = yield* ReplyChatService
        const error = yield* replies.reply(eventOf(queuedRun)).pipe(Effect.flip)

        assert.strictEqual(error, assistantOverloaded)
        assert.deepStrictEqual(yield* assistant.summarised, [
          [
            {
              author: 'user',
              text: 'Earlier messages of this conversation are not shown to you. A summary of them:\n\nBefore.',
            },
            long,
            longReply,
          ],
        ])
        assert.deepStrictEqual(writes.chats, [])
        assert.deepStrictEqual(writes.messages, [])
        assert.strictEqual(lastWrite(writes).move, 'generating → failed')
        assert.include(lastWrite(writes).cause, assistantOverloaded.cause)
      }).pipe(
        Effect.provide(
          layerChatTest(
            replyingTo(writes, {
              runs: storeRuns(writes, queuedRun),
              history: [long, longReply, userMessageAt(3, 'x'.repeat(100))],
              asked: new Chat({
                ...chat,
                context: Option.some({ compacted: 'Before.', headMessageId: long.id }),
              }),
            }),
            { assistant: assistant.layer, chatContextTokensLimit: 150 },
          ),
        ),
      )
    },
  )

  it.effect('reply whose summary dies fails its Run and stores no reply', () => {
    const assistant = recordChatAssistant({
      reply: Effect.succeed(sure),
      summary: Effect.die('provider exploded'),
    })
    const writes = noWrites()
    return Effect.gen(function* () {
      const replies = yield* ReplyChatService
      const exit = yield* replies.reply(eventOf(queuedRun)).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assert.deepStrictEqual(moves(writes), ['queued → generating', 'generating → failed'])
      assert.deepStrictEqual(writes.chats, [])
      assert.deepStrictEqual(writes.messages, [])
    }).pipe(
      Effect.provide(
        layerChatTest(
          replyingTo(writes, {
            runs: storeRuns(writes, queuedRun),
            history: [
              userMessageAt(1, 'x'.repeat(300)),
              answeredBy(assistantMessageAt(2, 'x'.repeat(100))),
              userMessageAt(3, 'x'.repeat(100)),
            ],
          }),
          { assistant: assistant.layer, chatContextTokensLimit: 150 },
        ),
      ),
    )
  })

  it.effect(
    "reply after a cut prompts with the summary and the chat's messages from the start it stored",
    () => {
      const assistant = recordChatAssistant({ reply: Effect.succeed(sure) })
      const writes = noWrites()
      const runs = storeRuns(writes, queuedRun)
      const short = answeredBy(userMessageAt(3, 'x'.repeat(100)))
      const history = [
        userMessageAt(1, 'x'.repeat(300)),
        assistantMessageAt(2, 'x'.repeat(100)),
        short,
      ]
      // The store's chat and messages: a chat write is kept, and a read bounded by an id holds to it.
      let written: Partial<ChatEntitySet> = {}
      const store: ChatRepositoryMocks = {
        runs,
        chats: {
          selectOne: () =>
            SchemaCodec.encode(Chat)(chat).pipe(
              Effect.map((row) => Option.some({ ...row, ...written })),
            ),
          update: (set) =>
            Effect.sync(() => {
              written = set
            }),
        },
        messages: {
          selectMany: ({ id }) =>
            pipe(
              history,
              Arr.filter((message) =>
                Predicate.hasProperty(id, 'gte') ? message.id >= String(id.gte) : true,
              ),
              Effect.forEach((message) => SchemaCodec.encode(Message)(message)),
            ),
          insert: () => Effect.void,
        },
      }
      return Effect.gen(function* () {
        const replies = yield* ReplyChatService
        yield* replies.reply(eventOf(queuedRun))
        yield* runs.settle(queuedRun)

        yield* replies.reply(eventOf(queuedRun))

        assert.deepStrictEqual(yield* assistant.contexts, [
          history,
          [
            {
              author: 'user',
              text: 'Earlier messages of this conversation are not shown to you. A summary of them:\n\nA summary.',
            },
            short,
          ],
        ])
      }).pipe(
        Effect.provide(
          layerChatTest(store, { assistant: assistant.layer, chatContextTokensLimit: 150 }),
        ),
      )
    },
  )

  it.effect("reply prompts with the chat's messages in order", () => {
    const assistant = recordChatAssistant({ reply: Effect.succeed(sure) })
    const writes = noWrites()
    return Effect.gen(function* () {
      const replies = yield* ReplyChatService
      yield* replies.reply(eventOf(lastRun))

      assertEquals(yield* assistant.contexts, [[whatIsThis, aPhoto, andAgain, andNow]])
    }).pipe(
      Effect.provide(
        layerChatTest(
          replyingTo(writes, {
            runs: storeRuns(writes, lastRun),
            history: [whatIsThis, aPhoto, andAgain, andNow],
          }),
          { assistant: assistant.layer },
        ),
      ),
    )
  })

  it.effect(
    'reply dies on a done write to a Run settled meanwhile, failing no Run and taking its message back',
    () => {
      const held = holdCall()
      const assistant = recordChatAssistant({ reply: held.hold.pipe(Effect.as(sure)) })
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
          layerChatTest(replyingTo(writes, { runs }), { assistant: assistant.layer }),
          logger,
        ]),
      )
    },
  )

  it.effect(
    "reply losing its generating write to a rival delivery dies, leaving the rival's Run to it",
    () => {
      const assistant = recordChatAssistant({ reply: Effect.succeed(sure) })
      const writes = noWrites()
      const runs = storeRuns(writes, queuedRun)
      // The rival starts the Run right after this reply reads it queued.
      const rivalStarts = (where: RunEntitySelectWhere) =>
        runs.selectOne(where).pipe(Effect.tap(() => runs.settle(generating)))
      return Effect.gen(function* () {
        const exit = yield* reply.pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(moves(writes), [])
        assertEquals(yield* assistant.contexts, [])
      }).pipe(
        Effect.provide(
          layerChatTest(replyingTo(writes, { runs: { ...runs, selectOne: rivalStarts } }), {
            assistant: assistant.layer,
          }),
        ),
      )
    },
  )

  it.effect(
    "a failed Run's event delivered again after its retry starts the retry's Run, whose own event then fails it as started",
    () => {
      const held = holdCall()
      const assistant = recordChatAssistant({ reply: held.hold.pipe(Effect.as(sure)) })
      const writes = noWrites()
      return Effect.gen(function* () {
        const replies = yield* ReplyChatService

        const again = yield* replies.reply(eventOf(queuedRun)).pipe(Effect.exit, Effect.forkChild)
        yield* held.reached
        const own = yield* replies.reply(eventOf(retried)).pipe(Effect.flip)
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
            assistant: assistant.layer,
          }),
        ),
      )
    },
  )

  it.effect(
    "a reply that dies once its Run was failed elsewhere and retried fails no Run, the retry's included",
    () => {
      const held = holdCall()
      const assistant = recordChatAssistant({
        reply: held.hold.pipe(Effect.andThen(Effect.die('provider exploded'))),
      })
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
        Effect.provide(layerChatTest(replyingTo(writes, { runs }), { assistant: assistant.layer })),
      )
    },
  )

  it.effect.each([
    { name: 'settled before it', selectOne: storeRuns(noWrites(), doneElsewhere).selectOne },
    { name: 'the store finds none of', selectOne: () => Effect.succeedNone },
  ])(
    'reply of a Run $name fails RunNotFoundError, failing no Run and asking no assistant',
    ({ selectOne }) => {
      const assistant = recordChatAssistant({ reply: Effect.succeed(sure) })
      return Effect.gen(function* () {
        const error = yield* reply.pipe(Effect.flip)

        assertSchemaEquals(
          RunNotFoundError,
          error,
          new RunNotFoundError({ where: { userMessageId: queuedRun.userMessageId } }),
        )
        assertEquals(yield* assistant.contexts, [])
      }).pipe(
        // No `update`: a write would die on it.
        Effect.provide(layerChatTest({ runs: { selectOne } }, { assistant: assistant.layer })),
      )
    },
  )

  it.effect.each([
    { name: "another user's", event: { ...eventOf(queuedRun), userId: stranger } },
    { name: "another chat's", event: { ...eventOf(queuedRun), chatId: unknownChatId } },
  ])(
    "reply to an active Run's message under $name id fails RunNotFoundError, writing nothing and asking no assistant",
    ({ event }) => {
      const assistant = recordChatAssistant({ reply: Effect.succeed(sure) })
      const writes = noWrites()
      return Effect.gen(function* () {
        const replies = yield* ReplyChatService
        const error = yield* replies.reply(event).pipe(Effect.flip)

        assertSchemaEquals(
          RunNotFoundError,
          error,
          new RunNotFoundError({ where: { userMessageId: queuedRun.userMessageId } }),
        )
        assert.deepStrictEqual(writes, noWrites())
        assertEquals(yield* assistant.contexts, [])
      }).pipe(
        Effect.provide(
          layerChatTest(replyingTo(writes, { runs: storeRuns(writes, queuedRun) }), {
            assistant: assistant.layer,
          }),
        ),
      )
    },
  )
})
