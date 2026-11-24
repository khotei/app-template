import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Exit, Fiber, Option } from 'effect'

import type {
  MessageColumns,
  RunColumns,
  RunEntitySet,
  RunEntityWhere,
} from '@app-template/kernel/data'
import { recordMessages } from '@app-template/packages/queue/testing'
import { decodeWith, encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch, isUuidV7 } from '@app-template/packages/testing'

import { ChatBusyError } from '#chat/domain/chat.error'
import { Chat } from '#chat/domain/chat.model'
import { Message, MessageFields } from '#chat/domain/message.model'
import { RunNotRetryableError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import { RunFields } from '#chat/domain/run-fields.model'
import { ReplyToMessage, TitleChat } from '#chat/infrastructure/chat.queue'
import { AskChatService } from '#chat/services/ask-chat.service'
import { assistantMessageAt, chat, firstMessage, queuedRun } from '#testing/chat/chat.test-fixture'
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

/** The services over `queue`, inserts that keep nothing and Run updates that land in `updates`. */
function recordUpdates(queue: ChatLeaves['queue']) {
  const updates: Array<RunEntitySet> = []
  const layer = layerChatTest(
    {
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
})

/** A chat an ask has reached before, so an ask sends the reply's job alone. */
const answeredChat = withNewest(doneRun)

const replyJob = (run: Run) => ({
  queue: 'reply-to-message',
  message: new ReplyToMessage({ messageId: run.userMessageId }),
})

const ask = (read: Chat, text: string) => AskChatService.use((askChat) => askChat.ask(read, text))

const retry = (read: Chat) => AskChatService.use((askChat) => askChat.retry(read))

describe('AskChatService', () => {
  it.live(
    "ask inserts the user message and its queued Run, writing no chat, then sends a new chat's title job and the reply's",
    () => {
      const inserts = noInserts()
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const run = yield* ask(chat, 'Plan a weekend in Lisbon')

        const userMessage = yield* decodeWith(MessageFields)(Arr.getUnsafe(inserts.messages, 0))
        const sentAt = userMessage.createdAt
        assert.isTrue(DateTime.isGreaterThan(sentAt, epoch))
        assert.isTrue(DateTime.isGreaterThanOrEqualTo(run.createdAt, sentAt))
        // Each timestamp's default reads the clock itself, so the two may be a tick apart.
        assert.isTrue(DateTime.isGreaterThanOrEqualTo(run.updatedAt, run.createdAt))
        assert.isTrue(isUuidV7(userMessage.id) && isUuidV7(run.id))
        assertEquals(
          run,
          new Run({
            id: run.id,
            chatId: chat.id,
            userMessageId: userMessage.id,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
          }),
        )
        assert.deepStrictEqual(inserts.messages, [
          yield* encodeWith(MessageFields)(
            new Message({
              author: 'user',
              id: userMessage.id,
              chatId: chat.id,
              text: 'Plan a weekend in Lisbon',
              createdAt: sentAt,
            }),
          ),
        ])
        assert.deepStrictEqual(inserts.runs, [yield* encodeWith(RunFields)(run)])
        assertEquals(yield* jobs.sent, [
          { queue: 'title-chat', message: new TitleChat({ chatId: chat.id }) },
          replyJob(run),
        ])
      }).pipe(Effect.provide(layerChatTest(insertingInto(inserts), { queue: jobs.layer })))
    },
  )

  it.effect("ask on an answered chat sends the reply's job alone", () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const run = yield* ask(answeredChat, 'And in Porto?')

      assertEquals(yield* jobs.sent, [replyJob(run)])
    }).pipe(Effect.provide(layerChatTest(insertingInto(noInserts()), { queue: jobs.layer })))
  })

  it.effect("ask fails the Run with the text of SQS's refusal, and returns the failed Run", () => {
    const { updates, layer } = recordUpdates(layerRefusingQueueTest())
    return Effect.gen(function* () {
      const sent = yield* ask(answeredChat, 'And in Porto?')

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
      const sent = yield* retry(withNewest(failedRun))

      assert.deepStrictEqual(
        Arr.map(updates, ([set, where]) => [set.status, where]),
        [['failed', { id: sent.id, status: ['queued'] }]],
      )
      assert.deepStrictEqual([Arr.map(stored, ({ id }) => id), sent.status], [[sent.id], 'failed'])
    }).pipe(
      Effect.provide(
        // No `selectOne`: a read of the message's active Run, a later retry's, would die on it.
        layerChatTest(
          {
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
        const exit = yield* retry(withNewest(failedRun)).pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(
          Arr.map(updates, ({ status }) => status),
          [['queued']],
        )
      }).pipe(
        Effect.provide(
          layerChatTest(
            {
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
    const { updates, layer } = recordUpdates(layerRefusingQueueTest(held.hold))
    return Effect.gen(function* () {
      const running = yield* ask(answeredChat, 'And in Porto?').pipe(Effect.forkChild)
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

  it.effect('ask of a new chat interrupted while its Run is stored still sends both jobs', () => {
    const held = holdCall()
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const running = yield* ask(chat, 'Plan a weekend in Lisbon').pipe(Effect.forkChild)
      yield* held.reached
      const interrupting = yield* Fiber.interrupt(running).pipe(
        Effect.forkChild({ startImmediately: true }),
      )
      yield* held.release
      yield* Fiber.join(interrupting)

      assert.deepStrictEqual(
        Arr.map(yield* jobs.sent, ({ queue }) => queue),
        ['title-chat', 'reply-to-message'],
      )
    }).pipe(
      Effect.provide(
        layerChatTest(
          {
            messages: { insert: () => Effect.void },
            runs: { insert: () => held.hold },
          },
          { queue: jobs.layer },
        ),
      ),
    )
  })

  it.effect('retry interrupted while its Run is stored still sends its job', () => {
    const held = holdCall()
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const running = yield* retry(withNewest(failedRun)).pipe(Effect.forkChild)
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
      Effect.provide(layerChatTest({ runs: { insert: () => held.hold } }, { queue: jobs.layer })),
    )
  })

  it.effect('ask while a Run is in work is ChatBusyError before any write or job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const refused = yield* ask(withNewest(queuedRun), 'And in Porto?').pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, refused, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest({}, { queue: jobs.layer })))
  })

  it.effect.each([
    { name: 'while a Run is in work', read: withNewest(queuedRun) },
    { name: "when the chat's newest Run is done", read: withNewest(doneRun) },
  ])('retry $name is RunNotRetryableError before any write or job', ({ read }) => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const refused = yield* retry(read).pipe(Effect.flip)

      assertSchemaEquals(RunNotRetryableError, refused, new RunNotRetryableError())
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest({}, { queue: jobs.layer })))
  })

  it.effect(
    'retry after a failed Run inserts a new queued Run of its message, then sends its job',
    () => {
      const inserts = noInserts()
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const retried = yield* retry(withNewest(failedRun))

        assertSchemaEquals(
          Run,
          retried,
          new Run({
            id: retried.id,
            chatId: chat.id,
            userMessageId: firstMessage.id,
            createdAt: retried.createdAt,
            updatedAt: retried.createdAt,
          }),
        )
        assert.deepStrictEqual(inserts.runs, [yield* encodeWith(RunFields)(retried)])
        assert.deepStrictEqual(inserts.messages, [])
        assertEquals(yield* jobs.sent, [replyJob(retried)])
      }).pipe(Effect.provide(layerChatTest(insertingInto(inserts), { queue: jobs.layer })))
    },
  )
})
