import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Fiber, Layer, Option } from 'effect'

import type {
  MessageColumns,
  MessageEntityWhere,
  RunColumns,
  RunEntitySelectWhere,
  RunEntitySet,
  RunEntityWhere,
} from '@app-template/kernel/data'
import { recordMessages } from '@app-template/packages/queue/testing'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch, isUuidV7 } from '@app-template/packages/testing'

import { ChatBusyError } from '#chat/domain/chat.error'
import { Chat } from '#chat/domain/chat.model'
import { MessageNotFoundError } from '#chat/domain/message.error'
import { Message, MessageFields } from '#chat/domain/message.model'
import { RunNotRetryableError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { RunFields } from '#chat/domain/run-fields.model'
import { ReplyToMessage, TitleChat } from '#chat/infrastructure/chat.queue'
import { AskChatService } from '#chat/services/ask-chat.service'
import { assistantMessageAt, chat, firstMessage, queuedRun } from '#testing/chat/chat.test-fixture'
import { type ChatRepositoryMocks, layerChatTest } from '#testing/chat/chat.test-layer'
import { holdAssistantCall } from '#testing/chat/message-assistant.test-fake'
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

/** The read of the message the failed Run answers. */
const readsFirstMessage = {
  messages: { selectOne: () => encodeWith(Message)(firstMessage).pipe(Effect.map(Option.some)) },
} satisfies ChatRepositoryMocks

/**
 * The services over `queue`, inserts that keep nothing and a store that reads `queuedRun`, whose
 * updates land in `updates`.
 */
function recordUpdates<Queue>(queue: Layer.Layer<Queue>) {
  const updates: Array<RunEntitySet> = []
  const layer = layerChatTest({
    messages: { insert: () => Effect.void },
    runs: {
      insert: () => Effect.void,
      selectOne: () => encodeWith(Run)(queuedRun).pipe(Effect.map(Option.some)),
      update: (set) =>
        Effect.sync(() => {
          updates.push(set)
        }),
    },
  }).pipe(Layer.provideMerge(queue))
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
  assistantMessage: Option.some(reply),
})

/** A chat a send has reached before, so an ask sends the reply's job alone. */
const answeredChat = withNewest(doneRun)

const replyJob = (run: Run) => ({
  queue: 'reply-to-message',
  message: new ReplyToMessage({ messageId: run.userMessageId }),
})

const askMessage = (read: Chat, text: string) =>
  AskChatService.use((askChat) => askChat.askMessage(read, text))

const askRetryMessage = (read: Chat) =>
  AskChatService.use((askChat) => askChat.askRetryMessage(read))

describe('AskChatService', () => {
  it.live(
    "askMessage inserts the user message and its queued Run, writing no chat, then sends a new chat's title job and the reply's",
    () => {
      const inserts = noInserts()
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const run = yield* askMessage(chat, 'Plan a weekend in Lisbon')

        const { userMessage } = run
        const sentAt = userMessage.createdAt
        assert.isTrue(DateTime.isGreaterThan(sentAt, epoch))
        assert.isTrue(DateTime.isGreaterThanOrEqualTo(run.createdAt, sentAt))
        assert.isTrue(isUuidV7(userMessage.id) && isUuidV7(run.id))
        assertEquals(
          run,
          new Run({
            id: run.id,
            chatId: chat.id,
            userMessage: new Message({
              author: 'user',
              id: userMessage.id,
              chatId: chat.id,
              text: 'Plan a weekend in Lisbon',
              createdAt: sentAt,
            }),
            userMessageId: userMessage.id,
            createdAt: run.createdAt,
            updatedAt: run.createdAt,
          }),
        )
        assert.deepStrictEqual(inserts.messages, [yield* encodeWith(MessageFields)(userMessage)])
        assert.deepStrictEqual(inserts.runs, [yield* encodeWith(RunFields)(run)])
        assertEquals(yield* jobs.sent, [
          { queue: 'title-chat', message: new TitleChat({ chatId: chat.id }) },
          replyJob(run),
        ])
      }).pipe(
        Effect.provide(layerChatTest(insertingInto(inserts)).pipe(Layer.provideMerge(jobs.layer))),
      )
    },
  )

  it.effect("askMessage on an answered chat sends the reply's job alone", () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const run = yield* askMessage(answeredChat, 'And in Porto?')

      assertEquals(yield* jobs.sent, [replyJob(run)])
    }).pipe(
      Effect.provide(
        layerChatTest(insertingInto(noInserts())).pipe(Layer.provideMerge(jobs.layer)),
      ),
    )
  })

  it.effect(
    "askMessage fails the Run with the text of SQS's refusal, and returns the failed Run",
    () => {
      const { updates, layer } = recordUpdates(layerRefusingQueueTest())
      return Effect.gen(function* () {
        const sent = yield* askMessage(answeredChat, 'And in Porto?')

        assert.strictEqual(sent.status, 'failed')
        assert.include(Option.getOrThrow(sent.failure).cause, 'SQS is unavailable')
        assert.deepStrictEqual(
          Arr.map(updates, ({ status }) => status),
          ['failed'],
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect(
    "askRetryMessage's refused send fails its message's active Run as it stands, a later retry's included",
    () => {
      // A worker failed the Run sent, as SQS took it after all, and the user retried again.
      const laterRetry = new Run({
        ...queuedRun,
        id: RunId.make('0192d4e0-7b3a-7c00-8000-000000000033'),
      })
      const reads: Array<RunEntitySelectWhere> = []
      const updates: Array<RunEntityWhere> = []
      return Effect.gen(function* () {
        const sent = yield* askRetryMessage(withNewest(failedRun))

        assert.deepStrictEqual(reads, [
          { userMessageId: firstMessage.id, status: ['queued', 'generating'] },
        ])
        assert.deepStrictEqual(updates, [{ id: laterRetry.id, status: ['queued'] }])
        assert.deepStrictEqual([sent.id, sent.status], [laterRetry.id, 'failed'])
      }).pipe(
        Effect.provide(
          layerChatTest({
            ...readsFirstMessage,
            runs: {
              insert: () => Effect.void,
              selectOne: (where) =>
                Effect.sync(() => {
                  reads.push(where)
                }).pipe(Effect.andThen(encodeWith(Run)(laterRetry)), Effect.map(Option.some)),
              update: (_, where) =>
                Effect.sync(() => {
                  updates.push(where)
                }),
            },
          }).pipe(Layer.provideMerge(layerRefusingQueueTest())),
        ),
      )
    },
  )

  it.effect('askMessage interrupted while SQS refuses the job still fails the Run', () => {
    const held = holdAssistantCall()
    const { updates, layer } = recordUpdates(layerRefusingQueueTest(held.hold))
    return Effect.gen(function* () {
      const running = yield* askMessage(answeredChat, 'And in Porto?').pipe(Effect.forkChild)
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

  it.effect('askMessage while a Run is in work is ChatBusyError before any write or job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const refused = yield* askMessage(withNewest(queuedRun), 'And in Porto?').pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, refused, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest({}).pipe(Layer.provideMerge(jobs.layer))))
  })

  it.effect.each([
    { name: 'while a Run is in work', read: withNewest(queuedRun) },
    { name: "when the chat's newest Run is done", read: withNewest(doneRun) },
  ])('askRetryMessage $name is RunNotRetryableError before any write or job', ({ read }) => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const refused = yield* askRetryMessage(read).pipe(Effect.flip)

      assertSchemaEquals(RunNotRetryableError, refused, new RunNotRetryableError())
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest({}).pipe(Layer.provideMerge(jobs.layer))))
  })

  it.effect(
    'askRetryMessage after a failed Run inserts a new queued Run of its message, then sends its job',
    () => {
      const inserts = noInserts()
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const retried = yield* askRetryMessage(withNewest(failedRun))

        assertSchemaEquals(
          Run,
          retried,
          new Run({
            id: retried.id,
            chatId: chat.id,
            userMessage: firstMessage,
            userMessageId: firstMessage.id,
            createdAt: retried.createdAt,
            updatedAt: retried.createdAt,
          }),
        )
        assert.deepStrictEqual(inserts.runs, [yield* encodeWith(RunFields)(retried)])
        assert.deepStrictEqual(inserts.messages, [])
        assertEquals(yield* jobs.sent, [replyJob(retried)])
      }).pipe(
        Effect.provide(
          layerChatTest(insertingInto(inserts, readsFirstMessage)).pipe(
            Layer.provideMerge(jobs.layer),
          ),
        ),
      )
    },
  )

  it.effect(
    "askRetryMessage asks the store for the failed Run's message by its id and returns its none as MessageNotFoundError, sending no job",
    () => {
      const wheres: Array<MessageEntityWhere> = []
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const error = yield* askRetryMessage(withNewest(failedRun)).pipe(Effect.flip)

        assertSchemaEquals(
          MessageNotFoundError,
          error,
          new MessageNotFoundError({ id: firstMessage.id }),
        )
        assert.deepStrictEqual(wheres, [{ id: firstMessage.id }])
        assertEquals(yield* jobs.sent, [])
      }).pipe(
        Effect.provide(
          layerChatTest({
            messages: {
              selectOne: (where) =>
                Effect.sync(() => {
                  wheres.push(where)
                }).pipe(Effect.as(Option.none())),
            },
          }).pipe(Layer.provideMerge(jobs.layer)),
        ),
      )
    },
  )
})
