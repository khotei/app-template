import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Exit, Fiber, Option, Struct } from 'effect'

import type {
  ChatEntitySelectWhere,
  MessageColumns,
  RunColumns,
  RunEntitySet,
  RunEntityWhere,
} from '@app-template/kernel/data'
import { recordMessages } from '@app-template/packages/queue/testing'
import { decodeWith, encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch, isUuidV7 } from '@app-template/packages/testing'

import { Chat, ChatBusyError, ChatNotFoundError } from '#chat/domain/chat.model'
import { Message } from '#chat/domain/message.model'
import { Run, RunNotRetryableError } from '#chat/domain/run.model'
import { FirstMessageCreated, ReplyToMessage } from '#chat/infrastructure/chat.queue'
import { AskChatService } from '#chat/services/ask-chat.service'
import {
  assistantMessageAt,
  chat,
  firstMessage,
  owner,
  queuedRun,
  runUsage,
} from '#testing/chat/chat.test-fixture'
import {
  type ChatLeaves,
  type ChatRepositoryMocks,
  layerChatTest,
} from '#testing/chat/chat.test-layer'
import { holdCall } from '#testing/chat/chat.test-util'
import { layerRefusingQueueTest } from '#testing/chat/queue-sender.test-fake'

/** The rows each repository's `insert` is handed. */
interface Inserts {
  readonly messages: Array<MessageColumns>
  readonly runs: Array<RunColumns>
}

const noInserts = (): Inserts => ({ messages: [], runs: [] })

/** Inserts that keep each row they are handed in `inserts`, and `mocks`'s reads. */
const insertingInto = (inserts: Inserts, mocks: ChatRepositoryMocks = {}): ChatRepositoryMocks => ({
  ...mocks,
  messages: {
    ...mocks.messages,
    insert: (row) =>
      Effect.sync(() => {
        inserts.messages.push(row)
      }),
  },
  runs: {
    insert: (row) =>
      Effect.sync(() => {
        inserts.runs.push(row)
      }),
  },
})

/**
 * The services over `queue` and the read of `read`, inserts that keep nothing and Run updates that
 * land in `updates`.
 */
function recordUpdates(read: Chat, queue: Required<ChatLeaves>['queue']) {
  const updates: Array<RunEntitySet> = []
  const layer = layerChatTest(
    {
      ...reading(read),
      messages: { insert: () => Effect.void },
      runs: {
        insert: () => Effect.void,
        update: (set) =>
          Effect.sync(() => {
            updates.push(set)
          }),
      },
    },
    { queue },
  )
  return { updates, layer }
}

/** The chat read of `read`, whatever the where. */
const reading = (read: Chat): ChatRepositoryMocks => ({
  chats: { selectOne: () => encodeWith(Chat)(read).pipe(Effect.map(Option.some)) },
})

const withNewest = (newest: Run) => new Chat({ ...chat, run: Option.some(newest) })

const failedRun = new Run({
  ...queuedRun,
  status: 'failed',
  failure: Option.some({ cause: '529 overloaded' }),
})

const reply = assistantMessageAt(1, 'Sure.')

const doneRun = new Run({
  ...queuedRun,
  status: 'done',
  assistantMessageId: Option.some(reply.id),
  usage: Option.some(runUsage),
})

/** A chat an ask has reached before, so an ask sends the reply's job alone. */
const answeredChat = withNewest(doneRun)

const replyJob = (run: Run) => ({
  queue: 'reply-to-message',
  message: new ReplyToMessage({ messageId: run.userMessageId }),
})

/** The owner's chat each case asks or retries in; the store's read decides what it holds. */
const inChat = { id: chat.id, userId: owner }

const ask = Effect.fnUntraced(function* (text: string, where = inChat) {
  const asks = yield* AskChatService
  return yield* asks.ask(where, text)
})

const retry = Effect.fnUntraced(function* (where = inChat) {
  const asks = yield* AskChatService
  return yield* asks.retry(where)
})

describe('AskChatService', () => {
  it.live(
    "ask inserts the user message and its queued Run, writing no chat, then sends a new chat's first message's event and the reply's job",
    () => {
      const inserts = noInserts()
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const run = yield* ask('Plan a weekend in Lisbon')

        const userMessage = yield* decodeWith(Message.insert)(Arr.getUnsafe(inserts.messages, 0))
        const sentAt = userMessage.createdAt
        assert.isTrue(DateTime.isGreaterThan(sentAt, epoch))
        assert.isTrue(DateTime.isGreaterThanOrEqualTo(run.createdAt, sentAt))
        assert.isTrue(isUuidV7(userMessage.id) && isUuidV7(run.id))
        assertEquals(
          run,
          new Run({
            ...Struct.pick(run, ['id', 'createdAt', 'updatedAt']),
            chatId: chat.id,
            userId: chat.userId,
            userMessageId: userMessage.id,
          }),
        )
        assert.deepStrictEqual(inserts.messages, [
          yield* encodeWith(Message.insert)({
            author: 'user',
            id: userMessage.id,
            chatId: chat.id,
            userId: chat.userId,
            text: 'Plan a weekend in Lisbon',
            createdAt: sentAt,
          }),
        ])
        assert.deepStrictEqual(inserts.runs, [yield* encodeWith(Run)(run)])
        assertEquals(yield* jobs.sent, [
          {
            queue: 'first-message-created',
            message: new FirstMessageCreated({
              id: userMessage.id,
              chatId: chat.id,
              userId: chat.userId,
            }),
          },
          replyJob(run),
        ])
      }).pipe(
        Effect.provide(layerChatTest(insertingInto(inserts, reading(chat)), { queue: jobs.layer })),
      )
    },
  )

  it.effect("ask on an answered chat sends the reply's job alone, and no event", () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const run = yield* ask('And in Porto?')

      assertEquals(yield* jobs.sent, [replyJob(run)])
    }).pipe(
      Effect.provide(
        layerChatTest(insertingInto(noInserts(), reading(answeredChat)), {
          queue: jobs.layer,
        }),
      ),
    )
  })

  it.effect("ask fails the Run with the text of SQS's refusal, and returns the failed Run", () => {
    const { updates, layer } = recordUpdates(answeredChat, layerRefusingQueueTest())
    return Effect.gen(function* () {
      const sent = yield* ask('And in Porto?')

      assert.strictEqual(sent.status, 'failed')
      assert.include(Option.getOrThrow(sent.failure).cause, 'SQS is unavailable')
      assert.deepStrictEqual(
        Arr.map(updates, ({ status }) => status),
        ['failed'],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect("retry's refused send fails the Run it stored, by its id, reading no Run", () => {
    const stored: Array<RunColumns> = []
    const updates: Array<readonly [RunEntitySet, RunEntityWhere]> = []
    return Effect.gen(function* () {
      const sent = yield* retry()

      assert.deepStrictEqual(
        Arr.map(updates, ([set, where]) => [set.status, where]),
        [['failed', { id: sent.id, status: 'queued' }]],
      )
      assert.deepStrictEqual([Arr.map(stored, ({ id }) => id), sent.status], [[sent.id], 'failed'])
    }).pipe(
      Effect.provide(
        // No `selectOne`: a read of the message's active Run, a later retry's, would die on it.
        layerChatTest(
          {
            ...reading(withNewest(failedRun)),
            runs: {
              insert: (row) =>
                Effect.sync(() => {
                  stored.push(row)
                }),
              update: (...update) =>
                Effect.sync(() => {
                  updates.push(update)
                }),
            },
          },
          { queue: layerRefusingQueueTest() },
        ),
      ),
    )
  })

  it.effect(
    "a refused send whose Run a worker settled meanwhile dies on the write's guard, failing no later Run",
    () => {
      const updates: Array<RunEntityWhere> = []
      return Effect.gen(function* () {
        const exit = yield* retry().pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(
          Arr.map(updates, ({ status }) => status),
          ['queued'],
        )
      }).pipe(
        Effect.provide(
          layerChatTest(
            {
              ...reading(withNewest(failedRun)),
              runs: {
                insert: () => Effect.void,
                // The Run stored is no longer queued, so the guarded write touches no row.
                update: (_, where) =>
                  Effect.sync(() => {
                    updates.push(where)
                  }).pipe(Effect.andThen(Effect.die('no run was updated'))),
              },
            },
            { queue: layerRefusingQueueTest() },
          ),
        ),
      )
    },
  )

  it.effect('ask interrupted while SQS refuses the job still fails the Run', () => {
    const held = holdCall()
    const { updates, layer } = recordUpdates(answeredChat, layerRefusingQueueTest(held.hold))
    return Effect.gen(function* () {
      const running = yield* ask('And in Porto?').pipe(Effect.forkChild)
      yield* held.reached
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
    'ask of a new chat interrupted while its Run is stored still sends its event and its job',
    () => {
      const held = holdCall()
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const running = yield* ask('Plan a weekend in Lisbon').pipe(Effect.forkChild)
        yield* held.reached
        const interrupting = yield* Fiber.interrupt(running).pipe(
          Effect.forkChild({ startImmediately: true }),
        )
        yield* held.release
        yield* Fiber.join(interrupting)

        assert.deepStrictEqual(
          Arr.map(yield* jobs.sent, ({ queue }) => queue),
          ['first-message-created', 'reply-to-message'],
        )
      }).pipe(
        Effect.provide(
          layerChatTest(
            {
              ...reading(chat),
              messages: { insert: () => Effect.void },
              runs: { insert: () => held.hold },
            },
            { queue: jobs.layer },
          ),
        ),
      )
    },
  )

  it.effect('retry interrupted while its Run is stored still sends its job', () => {
    const held = holdCall()
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const running = yield* retry().pipe(Effect.forkChild)
      yield* held.reached
      const interrupting = yield* Fiber.interrupt(running).pipe(
        Effect.forkChild({ startImmediately: true }),
      )
      yield* held.release
      yield* Fiber.join(interrupting)

      assert.deepStrictEqual(
        Arr.map(yield* jobs.sent, ({ queue }) => queue),
        ['reply-to-message'],
      )
    }).pipe(
      Effect.provide(
        layerChatTest(
          { ...reading(withNewest(failedRun)), runs: { insert: () => held.hold } },
          { queue: jobs.layer },
        ),
      ),
    )
  })

  it.effect('ask while a Run is in work is ChatBusyError before any write or job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const refused = yield* ask('And in Porto?').pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, refused, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest(reading(withNewest(queuedRun)), { queue: jobs.layer })))
  })

  it.effect.each([
    { name: 'while a Run is in work', read: withNewest(queuedRun) },
    { name: "when the chat's newest Run is done", read: withNewest(doneRun) },
  ])('retry $name is RunNotRetryableError before any write or job', ({ read }) => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const refused = yield* retry().pipe(Effect.flip)

      assertSchemaEquals(RunNotRetryableError, refused, new RunNotRetryableError())
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest(reading(read), { queue: jobs.layer })))
  })

  it.effect(
    'retry after a failed Run inserts a new queued Run of its message, then sends its job',
    () => {
      const inserts = noInserts()
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const retried = yield* retry()

        assertSchemaEquals(
          Run,
          retried,
          new Run({
            id: retried.id,
            chatId: chat.id,
            userId: chat.userId,
            userMessageId: firstMessage.id,
            createdAt: retried.createdAt,
            updatedAt: retried.createdAt,
          }),
        )
        assert.deepStrictEqual(inserts.runs, [yield* encodeWith(Run)(retried)])
        assert.deepStrictEqual(inserts.messages, [])
        assertEquals(yield* jobs.sent, [replyJob(retried)])
      }).pipe(
        Effect.provide(
          layerChatTest(insertingInto(inserts, reading(withNewest(failedRun))), {
            queue: jobs.layer,
          }),
        ),
      )
    },
  )

  it.effect.each([
    { name: 'ask', refused: ask('Plan a weekend in Lisbon').pipe(Effect.flip) },
    { name: 'retry', refused: retry().pipe(Effect.flip) },
  ])(
    '$name in a chat the store finds none of for the user is ChatNotFoundError before any write or job',
    ({ refused }) => {
      const wheres: Array<ChatEntitySelectWhere> = []
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const error = yield* refused

        assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
        assert.deepStrictEqual(wheres, [{ id: chat.id, userId: owner }])
        assertEquals(yield* jobs.sent, [])
      }).pipe(
        Effect.provide(
          layerChatTest(
            {
              chats: {
                selectOne: (where) =>
                  Effect.sync(() => {
                    wheres.push(where)
                  }).pipe(Effect.as(Option.none())),
              },
            },
            { queue: jobs.layer },
          ),
        ),
      )
    },
  )

  it.effect.each([
    { name: 'ask', refused: ask('Hi', answeredChat).pipe(Effect.flip) },
    { name: 'retry', refused: retry(answeredChat).pipe(Effect.flip) },
  ])(
    '$name with a whole chat as its where reads the chat by its id and owner alone',
    ({ refused }) => {
      const wheres: Array<ChatEntitySelectWhere> = []
      return Effect.gen(function* () {
        yield* refused

        assert.deepStrictEqual(wheres, [{ id: chat.id, userId: owner }])
      }).pipe(
        Effect.provide(
          layerChatTest({
            chats: {
              selectOne: (where) =>
                Effect.sync(() => {
                  wheres.push(where)
                }).pipe(Effect.as(Option.none())),
            },
          }),
        ),
      )
    },
  )

  it.effect.each([
    { name: 'ask', interrupted: ask('Plan a weekend in Lisbon'), read: chat },
    { name: 'retry', interrupted: retry(), read: withNewest(failedRun) },
  ])(
    '$name interrupted while its chat is read stops before any write or job',
    ({ interrupted, read }) => {
      const held = holdCall()
      const inserts = noInserts()
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const running = yield* Effect.forkChild(interrupted)
        yield* held.reached
        const interrupting = yield* Fiber.interrupt(running).pipe(
          Effect.forkChild({ startImmediately: true }),
        )
        yield* held.release
        yield* Fiber.join(interrupting)

        assert.deepStrictEqual(inserts, noInserts())
        assertEquals(yield* jobs.sent, [])
      }).pipe(
        Effect.provide(
          layerChatTest(
            insertingInto(inserts, {
              chats: {
                selectOne: () =>
                  held.hold.pipe(Effect.andThen(encodeWith(Chat)(read)), Effect.map(Option.some)),
              },
            }),
            { queue: jobs.layer },
          ),
        ),
      )
    },
  )

  it.effect(
    "a new chat's ask whose sends SQS refuses goes on past the event to the reply's job, and returns the failed Run",
    () => {
      let tried = 0
      const { updates, layer } = recordUpdates(
        chat,
        layerRefusingQueueTest(
          Effect.sync(() => {
            tried += 1
          }),
        ),
      )
      return Effect.gen(function* () {
        const sent = yield* ask('Plan a weekend in Lisbon')

        assert.deepStrictEqual([tried, sent.status], [2, 'failed'])
        assert.deepStrictEqual(
          Arr.map(updates, ({ status }) => status),
          ['failed'],
        )
      }).pipe(Effect.provide(layer))
    },
  )
})
