import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option, Schema } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { assertSchemaEquals, epoch } from '@app-template/packages/testing'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { Chat, ChatTitle } from '#chat/domain/chat.model'
import type { ChatId } from '#chat/domain/chat.util'
import { type ChatFilter, ChatRepository } from '#chat/services/chat.repository'
import { ChatService } from '#chat/services/chat.service'
import { chat, owner, unknownChatId } from '#testing/chat/chat.test-fixture'

/** The service over a repository that implements only the methods the case gives; any other dies. */
const chatServiceOver = ({
  chats = {},
}: {
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
}) => ChatService.layer.pipe(Layer.provide([Layer.mock(ChatRepository, chats), BunCrypto.layer]))

/** A `selectOne` that returns `found`. */
const selectsOne = (found: Chat) => () => Effect.succeedSome(found)

/** The columns an update writes. */
const encodeChatSet = Schema.encodeUnknownSync(Chat.update)

const trip = ChatTitle.make('Trip')

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

type ChatCall = (
  service: ChatService['Service'],
  userId: UserId,
  chatId: ChatId,
) => Effect.Effect<unknown, ChatNotFoundError>

const chatCalls: ReadonlyArray<{ readonly name: string; readonly call: ChatCall }> = [
  { name: 'getOne', call: (service, userId, chatId) => service.getOne({ id: chatId, userId }) },
  {
    name: 'update',
    call: (service, userId, chatId) =>
      service.update({ title: Option.some(trip) }, { id: chatId, userId }),
  },
  { name: 'delete', call: (service, userId, chatId) => service.delete({ id: chatId, userId }) },
]

describe('ChatService', () => {
  it.live(
    "update writes the title and a moved updatedAt under the owner's where, and returns the chat",
    () => {
      const updates: Array<readonly [typeof Chat.update.Type, ChatFilter]> = []
      return Effect.gen(function* () {
        const service = yield* ChatService

        const updated = yield* service.update(
          { title: Option.some(trip) },
          { id: chat.id, userId: owner },
        )

        assert.isTrue(DateTime.isGreaterThan(updated.updatedAt, epoch))
        assertEquals(
          updated,
          new Chat({ ...chat, title: Option.some(trip), updatedAt: updated.updatedAt }),
        )
        assert.deepStrictEqual(
          updates.map(([set, where]) => [encodeChatSet(set), where]),
          [
            [
              { id: chat.id, title: trip, updatedAt: DateTime.toDateUtc(updated.updatedAt) },
              { id: chat.id, userId: owner },
            ],
          ],
        )
      }).pipe(
        Effect.provide(
          chatServiceOver({
            chats: {
              selectOne: selectsOne(chat),
              update: (...update) =>
                Effect.sync(() => {
                  updates.push(update)
                }),
            },
          }),
        ),
      )
    },
  )

  it.effect(
    'update where the title is none reads and writes only while the chat is untitled',
    () => {
      const wheres: Array<ChatFilter> = []
      return Effect.gen(function* () {
        const service = yield* ChatService

        const updated = yield* service.update(
          { title: Option.some(lisbonWeekend) },
          { id: chat.id, title: Option.none() },
        )

        assertEquals(updated.title, Option.some(lisbonWeekend))
        assert.deepStrictEqual(wheres, [
          { id: chat.id, title: Option.none() },
          { id: chat.id, title: Option.none() },
        ])
      }).pipe(
        Effect.provide(
          chatServiceOver({
            chats: {
              selectOne: (where) =>
                Effect.sync(() => {
                  wheres.push(where)
                }).pipe(Effect.andThen(selectsOne(chat))),
              update: (_, where) =>
                Effect.sync(() => {
                  wheres.push(where)
                }),
            },
          }),
        ),
      )
    },
  )

  it.effect("list reads the user's chats", () => {
    const wheres: Array<ChatFilter> = []
    return Effect.gen(function* () {
      const service = yield* ChatService

      assertEquals(yield* service.list(owner), [chat])
      assert.deepStrictEqual(wheres, [{ userId: owner }])
    }).pipe(
      Effect.provide(
        chatServiceOver({
          chats: {
            selectMany: (where) =>
              Effect.sync(() => {
                wheres.push(where)
              }).pipe(Effect.as([chat])),
          },
        }),
      ),
    )
  })

  it.effect("delete removes the owner's chat by its id", () => {
    const deleted: Array<ChatId> = []
    return Effect.gen(function* () {
      const service = yield* ChatService

      yield* service.delete({ id: chat.id, userId: owner })

      assert.deepStrictEqual(deleted, [chat.id])
    }).pipe(
      Effect.provide(
        chatServiceOver({
          chats: {
            selectOne: selectsOne(chat),
            delete: (id) =>
              Effect.sync(() => {
                deleted.push(id)
              }),
          },
        }),
      ),
    )
  })

  it.effect.each(chatCalls)(
    '$name of a chat the store finds none of is ChatNotFoundError, writing nothing',
    ({ call }) =>
      Effect.gen(function* () {
        const service = yield* ChatService

        const missing = yield* call(service, owner, unknownChatId).pipe(Effect.flip)

        assertSchemaEquals(ChatNotFoundError, missing, new ChatNotFoundError({ id: unknownChatId }))
      }).pipe(Effect.provide(chatServiceOver({ chats: { selectOne: () => Effect.succeedNone } }))),
  )
})
