import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import {
  assistantMessageQueue,
  Chat,
  ChatBusyError,
  chatTitleQueue,
  GenerateAssistantMessage,
  GenerateChatTitle,
  Run,
  type RunId,
} from '@app-template/application/chat'
import {
  type ChatRepositoryMocks,
  chat,
  layerChatTest,
  owner,
  queuedRun,
} from '@app-template/application/chat/testing'
import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordMessages } from '@app-template/packages/queue/testing'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { createUserMessage } from '#use-cases/chat/create-user-message.use-case'

/** The read of `read`, the chat the send names, and inserts that keep nothing. */
const sendingTo = (read: Chat) =>
  ({
    chats: { selectOne: () => encodeWith(Chat)(read).pipe(Effect.map(Option.some)) },
    messages: { insert: () => Effect.void },
    runs: { insert: () => Effect.void },
  }) satisfies ChatRepositoryMocks

const replyJob = (runId: RunId) => ({
  queue: 'assistant-message',
  message: new GenerateAssistantMessage({ runId }),
})

const answeredChat = new Chat({
  ...chat,
  run: Option.some(new Run({ ...queuedRun, status: 'done' })),
})

const busyChat = new Chat({ ...chat, run: Option.some(queuedRun) })

describe('createUserMessage', () => {
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
    }).pipe(Effect.provide(layerChatTest(sendingTo(read)).pipe(Layer.provideMerge(jobs.layer))))
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
      const mocks = sendingTo(chat)
      return Effect.gen(function* () {
        const run = yield* createUserMessage(owner, chat.id, 'Plan a weekend in Lisbon')

        assert.strictEqual(run.status, 'failed')
        assert.deepStrictEqual(queued, [chatTitleQueue.name])
      }).pipe(
        Effect.provide(
          layerChatTest({
            ...mocks,
            runs: {
              ...mocks.runs,
              selectOne: () => encodeWith(Run)(queuedRun).pipe(Effect.map(Option.some)),
              update: () => Effect.void,
            },
          }).pipe(Layer.provideMerge(RefusingReplyQueueTest)),
        ),
      )
    },
  )

  it.effect('a create refused while a Run is in work queues no job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const refused = yield* createUserMessage(owner, chat.id, 'And in Porto?').pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, refused, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest(sendingTo(busyChat)).pipe(Layer.provideMerge(jobs.layer))))
  })
})
