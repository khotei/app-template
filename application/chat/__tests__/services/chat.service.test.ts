import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { type ChatEntitySet, type ChatEntityWhere, ChatRepository } from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { assertSchemaEquals, epoch } from '@app-template/packages/testing'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import type { ChatId } from '#chat/domain/chat.id'
import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { ChatService } from '#chat/services/chat.service'
import { chat, owner, unknownChatId } from '#testing/chat/chat.test-fixture'

/** The service over a repository that answers only the methods the case gives; any other dies. */
const chatServiceOver = ({
  chats = {},
}: {
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
}) => ChatService.layer.pipe(Layer.provide([Layer.mock(ChatRepository, chats), BunCrypto.layer]))

/** A `selectOne` that answers `found` as its row. */
const selectsOne = (found: Chat) => () => encodeRowWith(Chat)(found).pipe(Effect.map(Option.some))

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
    name: 'rename',
    call: (service, userId, chatId) => service.rename({ id: chatId, userId }, trip),
  },
  { name: 'delete', call: (service, userId, chatId) => service.delete({ id: chatId, userId }) },
]

describe('ChatService', () => {
  it.live(
    "rename writes the title and a moved updatedAt under the owner's where, and returns the chat",
    () => {
      const updates: Array<readonly [ChatEntitySet, ChatEntityWhere]> = []
      return Effect.gen(function* () {
        const service = yield* ChatService

        const renamed = yield* service.rename({ id: chat.id, userId: owner }, trip)

        assert.isTrue(DateTime.isGreaterThan(renamed.updatedAt, epoch))
        assertEquals(
          renamed,
          new Chat({ ...chat, title: Option.some(trip), updatedAt: renamed.updatedAt }),
        )
        assert.deepStrictEqual(updates, [
          [
            { title: trip, updatedAt: DateTime.toDateUtc(renamed.updatedAt) },
            { id: chat.id, userId: owner },
          ],
        ])
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
    'rename where the title is none reads and writes only while the chat is untitled',
    () => {
      const wheres: Array<ChatEntityWhere> = []
      return Effect.gen(function* () {
        const service = yield* ChatService

        const renamed = yield* service.rename({ id: chat.id, title: Option.none() }, lisbonWeekend)

        assertEquals(renamed.title, Option.some(lisbonWeekend))
        assert.deepStrictEqual(wheres, [
          { id: chat.id, title: null },
          { id: chat.id, title: null },
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
    const wheres: Array<ChatEntityWhere> = []
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
              }).pipe(
                Effect.andThen(encodeRowWith(Chat)(chat)),
                Effect.map((row) => [row]),
              ),
          },
        }),
      ),
    )
  })

  it.effect("delete removes the owner's chat by its id and answers the chat it removed", () => {
    const deleted: Array<ChatEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* ChatService

      const removed = yield* service.delete({ id: chat.id, userId: owner })

      assertEquals(removed, chat)
      assert.deepStrictEqual(deleted, [{ id: chat.id }])
    }).pipe(
      Effect.provide(
        chatServiceOver({
          chats: {
            selectOne: selectsOne(chat),
            delete: (where) =>
              Effect.sync(() => {
                deleted.push(where)
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
