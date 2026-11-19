import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option, Schema } from 'effect'

import {
  assistantMessageQueue,
  Chat,
  ChatBusyError,
  ChatTitle,
  chatTitleQueue,
  GenerateAssistantMessage,
  GenerateChatTitle,
  Message,
  MessageFields,
  MessageInputInvalidError,
  Run,
  RunFields,
  type RunId,
} from '@app-template/application/chat'
import {
  type ChatRepositoryMocks,
  chat,
  layerChatTest,
  owner,
  queuedRun,
} from '@app-template/application/chat/testing'
import type { MessageColumns, RunColumns } from '@app-template/kernel/data'
import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordMessages } from '@app-template/packages/queue/testing'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch, isUuidV7, recordLogs } from '@app-template/packages/testing'

import { createUserMessage } from '#use-cases/chat/create-user-message.use-case'

/** Every refusal a send answers before its first write. */
const CreateRefusal = Schema.Union([MessageInputInvalidError, ChatBusyError])

/** The read of `read`, the chat the send names. */
const sendingTo = (read: Chat) =>
  ({
    chats: { selectOne: () => encodeWith(Chat)(read).pipe(Effect.map(Option.some)) },
  }) satisfies ChatRepositoryMocks

/** The rows a send hands each repository's `insert`. */
interface Inserts {
  readonly messages: Array<MessageColumns>
  readonly runs: Array<RunColumns>
}

/** `mocks` whose inserts keep each row they are handed in `inserts`. */
const insertingInto = (
  inserts: Inserts,
  mocks: ReturnType<typeof sendingTo>,
): ChatRepositoryMocks => ({
  ...mocks,
  messages: {
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

const noInserts = (): Inserts => ({ messages: [], runs: [] })

const replyJob = (runId: RunId) => ({
  queue: 'assistant-message',
  message: new GenerateAssistantMessage({ runId }),
})

const titledChat = new Chat({ ...chat, title: Option.some(ChatTitle.make('Trip')) })

const answeredChat = new Chat({
  ...chat,
  run: Option.some(new Run({ ...queuedRun, status: 'done' })),
})

const busyChat = new Chat({ ...chat, run: Option.some(queuedRun) })

describe('createUserMessage', () => {
  it.live('create inserts the user message and its queued Run, writing no chat', () => {
    const jobs = recordMessages()
    const inserts = noInserts()
    return Effect.gen(function* () {
      const run = yield* createUserMessage(owner, chat.id, 'Plan a weekend in Lisbon')

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
    }).pipe(
      Effect.provide(
        layerChatTest(insertingInto(inserts, sendingTo(titledChat))).pipe(
          Layer.provideMerge(jobs.layer),
        ),
      ),
    )
  })

  it.effect.each([
    { name: 'the first create queues the title job, then the reply job', read: chat, title: true },
    {
      name: 'a create after an answered one queues the reply job only',
      read: answeredChat,
      title: false,
    },
  ])('$name', ({ read, title }) => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const run = yield* createUserMessage(owner, chat.id, 'Plan a weekend in Lisbon')

      const titleJob = {
        queue: 'chat-title',
        message: new GenerateChatTitle({ messageId: run.userMessageId }),
      }
      assertEquals(yield* jobs.sent, title ? [titleJob, replyJob(run.id)] : [replyJob(run.id)])
    }).pipe(
      Effect.provide(
        layerChatTest(insertingInto(noInserts(), sendingTo(read))).pipe(
          Layer.provideMerge(jobs.layer),
        ),
      ),
    )
  })

  it.effect('a title job SQS refuses is logged with its chat and message', () => {
    const { logs, layer: logger } = recordLogs('chatId', 'messageId')
    const RefusingTitleQueueTest = Layer.mock(QueueSender, {
      send: ({ name }) =>
        name === chatTitleQueue.name
          ? Effect.fail(new QueueError({ cause: new Error('SQS is unavailable') }))
          : Effect.void,
    })
    return Effect.gen(function* () {
      const run = yield* createUserMessage(owner, chat.id, 'Plan a weekend in Lisbon')

      assert.deepStrictEqual(logs, [['Error', 'chat title not queued', chat.id, run.userMessageId]])
    }).pipe(
      Effect.provide([
        layerChatTest(insertingInto(noInserts(), sendingTo(chat))).pipe(
          Layer.provideMerge(RefusingTitleQueueTest),
        ),
        logger,
      ]),
    )
  })

  it.effect(
    'a first create whose reply job SQS refuses answers the failed Run and queues the title job',
    () => {
      const queued: Array<string> = []
      const RefusingReplyQueueTest = Layer.mock(QueueSender, {
        send: ({ name }) =>
          name === assistantMessageQueue.name
            ? Effect.fail(new QueueError({ cause: new Error('SQS is unavailable') }))
            : Effect.sync(() => {
                queued.push(name)
              }),
      })
      const mocks = insertingInto(noInserts(), sendingTo(chat))
      return Effect.gen(function* () {
        const run = yield* createUserMessage(owner, chat.id, 'Plan a weekend in Lisbon')

        assert.strictEqual(run.status, 'failed')
        assert.strictEqual(Option.getOrThrow(run.failure).reason, 'QueueError')
        assert.deepStrictEqual(queued, [chatTitleQueue.name])
      }).pipe(
        Effect.provide(
          layerChatTest({ ...mocks, runs: { ...mocks.runs, update: () => Effect.void } }).pipe(
            Layer.provideMerge(RefusingReplyQueueTest),
          ),
        ),
      )
    },
  )

  it.effect.each([
    {
      name: 'with a blank text',
      read: chat,
      text: ' ',
      error: new MessageInputInvalidError(),
    },
    {
      name: 'while a Run is in work',
      read: busyChat,
      text: 'And in Porto?',
      error: new ChatBusyError({ id: chat.id }),
    },
  ])('create $name is refused before any write or job', ({ read, text, error }) => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const refused = yield* createUserMessage(owner, chat.id, text).pipe(Effect.flip)

      assertSchemaEquals(CreateRefusal, refused, error)
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest(sendingTo(read)).pipe(Layer.provideMerge(jobs.layer))))
  })
})
