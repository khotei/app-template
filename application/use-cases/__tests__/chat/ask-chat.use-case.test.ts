import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Effect, Fiber, Option } from 'effect'

import {
  Chat,
  ChatInitialized,
  ChatNotFoundError,
  type Message,
  Run,
  UserMessageCreated,
} from '@app-template/application/chat'
import {
  type ChatRepositoryMocks,
  chat,
  holdCall,
  layerChatTest,
  layerRefusingQueueTest,
  owner,
  queuedRun,
} from '@app-template/application/chat/testing'
import type { ChatEntitySelectWhere } from '@app-template/kernel/data'
import { recordMessages } from '@app-template/packages/aws/queue/testing'
import { SchemaCodec } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { askChat } from '#use-cases/chat/ask-chat.use-case'

/** The chat read of `read`, whatever the where, after `before`, and inserts that keep nothing. */
const asking = (read: Chat, before: Effect.Effect<void> = Effect.void): ChatRepositoryMocks => ({
  chats: {
    selectOne: () =>
      before.pipe(Effect.andThen(SchemaCodec.encode(Chat)(read)), Effect.map(Option.some)),
  },
  messages: { insert: () => Effect.void },
  runs: { insert: () => Effect.void },
})

const answeredChat = new Chat({
  ...chat,
  run: Option.some(new Run({ ...queuedRun, status: 'done' })),
})

const inChat = { id: chat.id, userId: owner }

/** The fields of each event that names the message. */
const idsOf = (message: Message) => ({
  chatId: chat.id,
  userId: owner,
  messageId: message.id,
})

describe('askChat', () => {
  it.effect(
    "a new chat's ask sends its user message's event, then its chat's initialization, returning the message with its queued Run",
    () => {
      const events = recordMessages()
      return Effect.gen(function* () {
        const asked = yield* askChat(inChat, 'Plan a weekend in Lisbon')

        assert.deepStrictEqual(
          Option.map(asked.run, ({ status }) => status),
          Option.some('queued'),
        )
        assertEquals(yield* events.sent, [
          { queue: 'user-message-created', message: new UserMessageCreated(idsOf(asked)) },
          { queue: 'chat-initialized', message: new ChatInitialized(idsOf(asked)) },
        ])
      }).pipe(Effect.provide(layerChatTest(asking(chat), { queue: events.layer })))
    },
  )

  it.effect("an ask of a chat with a Run sends its user message's event alone", () => {
    const events = recordMessages()
    return Effect.gen(function* () {
      yield* askChat(inChat, 'And in Porto?')

      assert.deepStrictEqual(
        Arr.map(yield* events.sent, ({ queue }) => queue),
        ['user-message-created'],
      )
    }).pipe(Effect.provide(layerChatTest(asking(answeredChat), { queue: events.layer })))
  })

  it.effect(
    "a new chat's ask whose user message's send SQS refuses still tries its chat's event, and returns the message",
    () => {
      let tried = 0
      const refusing = layerRefusingQueueTest(
        Effect.sync(() => {
          tried += 1
        }),
      )
      return Effect.gen(function* () {
        const asked = yield* askChat(inChat, 'Plan a weekend in Lisbon')

        assert.deepStrictEqual([tried, asked.text], [2, 'Plan a weekend in Lisbon'])
      }).pipe(
        Effect.provide(
          layerChatTest(
            { ...asking(chat), runs: { insert: () => Effect.void, update: () => Effect.void } },
            { queue: refusing },
          ),
        ),
      )
    },
  )

  it.effect(
    'an ask with a whole chat as its where reads the chat by its id and owner alone; one the store finds none of is ChatNotFoundError before any write or event',
    () => {
      const wheres: Array<ChatEntitySelectWhere> = []
      const events = recordMessages()
      return Effect.gen(function* () {
        const error = yield* askChat(answeredChat, 'Hi').pipe(Effect.flip)

        assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
        assert.deepStrictEqual(wheres, [{ id: chat.id, userId: owner }])
        assertEquals(yield* events.sent, [])
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
            { queue: events.layer },
          ),
        ),
      )
    },
  )

  it.effect.each([
    { name: 'its chat is read', holding: (hold: Effect.Effect<void>) => asking(chat, hold) },
    {
      name: 'its Run is stored',
      holding: (hold: Effect.Effect<void>) => ({ ...asking(chat), runs: { insert: () => hold } }),
    },
  ])("a new chat's ask interrupted while $name still sends both its events", ({ holding }) => {
    const held = holdCall()
    const events = recordMessages()
    const mocks = holding(held.hold)
    return Effect.gen(function* () {
      const running = yield* askChat(inChat, 'Plan a weekend in Lisbon').pipe(Effect.forkChild)
      yield* held.reached
      const interrupting = yield* Fiber.interrupt(running).pipe(
        Effect.forkChild({ startImmediately: true }),
      )
      yield* held.release
      yield* Fiber.join(interrupting)

      assert.deepStrictEqual(
        Arr.map(yield* events.sent, ({ queue }) => queue),
        ['user-message-created', 'chat-initialized'],
      )
    }).pipe(Effect.provide(layerChatTest(mocks, { queue: events.layer })))
  })
})
