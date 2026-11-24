import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import {
  Chat,
  ChatBusyError,
  type MessageId,
  ReplyToMessage,
  Run,
  replyToMessageQueue,
  TitleChat,
  titleChatQueue,
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

import { askChat } from '#use-cases/chat/ask-chat.use-case'

/** The read of `read`, the chat the ask names, and inserts that keep nothing. */
const sendingTo = (read: Chat) =>
  ({
    chats: { selectOne: () => encodeWith(Chat)(read).pipe(Effect.map(Option.some)) },
    messages: { insert: () => Effect.void },
    runs: { insert: () => Effect.void },
  }) satisfies ChatRepositoryMocks

const replyJob = (messageId: MessageId) => ({
  queue: 'reply-to-message',
  message: new ReplyToMessage({ messageId }),
})

const answeredChat = new Chat({
  ...chat,
  run: Option.some(new Run({ ...queuedRun, status: 'done' })),
})

const busyChat = new Chat({ ...chat, run: Option.some(queuedRun) })

describe('askChat', () => {
  it.effect.each([
    { name: 'the first ask queues the title job, then the reply job', read: chat, title: true },
    {
      name: 'an ask after an answered one queues the reply job only',
      read: answeredChat,
      title: false,
    },
  ])('$name', ({ read, title }) => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const run = yield* askChat(owner, chat.id, 'Plan a weekend in Lisbon')

      const titleJob = { queue: 'title-chat', message: new TitleChat({ chatId: run.chatId }) }
      assertEquals(
        yield* jobs.sent,
        title ? [titleJob, replyJob(run.userMessageId)] : [replyJob(run.userMessageId)],
      )
    }).pipe(Effect.provide(layerChatTest(sendingTo(read), { queue: jobs.layer })))
  })

  it.effect(
    'a first ask whose reply job SQS refuses returns the failed Run and queues the title job',
    () => {
      const queued: Array<string> = []
      const RefusingReplyQueueTest = Layer.mock(QueueSender, {
        send: ({ name }) =>
          name === replyToMessageQueue.name
            ? Effect.fail(new QueueError({ cause: new Error('SQS is unavailable') }))
            : Effect.sync(() => {
                queued.push(name)
              }),
      })
      const mocks = sendingTo(chat)
      return Effect.gen(function* () {
        const run = yield* askChat(owner, chat.id, 'Plan a weekend in Lisbon')

        assert.strictEqual(run.status, 'failed')
        assert.deepStrictEqual(queued, [titleChatQueue.name])
      }).pipe(
        Effect.provide(
          layerChatTest(
            {
              ...mocks,
              runs: {
                ...mocks.runs,
                update: () => Effect.void,
              },
            },
            { queue: RefusingReplyQueueTest },
          ),
        ),
      )
    },
  )

  it.effect('an ask refused while a Run is in work queues no job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const refused = yield* askChat(owner, chat.id, 'And in Porto?').pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, refused, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest(sendingTo(busyChat), { queue: jobs.layer })))
  })
})
