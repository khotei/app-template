import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option } from 'effect'
import { SecureRandom } from 'effect/crypto'

import type { UserId } from '@app-template/application/identity'
import {
  type ChatColumns,
  type ChatEntitySet,
  type ChatEntityWhere,
  ChatRepository,
} from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch } from '@app-template/packages/testing'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { ChatId } from '#chat/domain/chat.util'
import { ChatService } from '#chat/services/chat.service'
import { chat, owner, unknownChatId } from '#testing/chat/chat.test-fixture'

/**
 * The service over a repository that implements only the methods the case gives; any other dies.
 * A case that asserts an id gives its own `random`.
 */
const chatServiceOver = ({
  chats = {},
  random = BunCrypto.layer,
}: {
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
  readonly random?: Layer.Layer<SecureRandom.SecureRandom>
}) => ChatService.layer.pipe(Layer.provide([Layer.mock(ChatRepository, chats), random]))

const generatedId = ChatId.make('0192d4e0-7b3a-7c00-8000-0000000000aa')

/** A `SecureRandom` whose every UUIDv7 is `generatedId`. */
const RandomFixed = Layer.mock(SecureRandom.SecureRandom, {
  uuidV7: () => Effect.succeed(generatedId),
})

/** A `selectOne` that returns `found` as its row. */
const selectsOne = (found: Chat) => () => encodeWith(Chat)(found).pipe(Effect.map(Option.some))

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
  it.effect(
    'create inserts an untitled chat with the generated id at the clock time, and returns it',
    () => {
      const inserts: Array<ChatColumns> = []
      return Effect.gen(function* () {
        const service = yield* ChatService

        const created = yield* service.create(owner)

        assertEquals(
          created,
          new Chat({ id: generatedId, userId: owner, createdAt: epoch, updatedAt: epoch }),
        )
        assert.deepStrictEqual(inserts, [
          {
            id: generatedId,
            userId: owner,
            title: null,
            createdAt: DateTime.toDateUtc(epoch),
            updatedAt: DateTime.toDateUtc(epoch),
          },
        ])
      }).pipe(
        Effect.provide(
          chatServiceOver({
            chats: {
              insert: (row) =>
                Effect.sync(() => {
                  inserts.push(row)
                }),
            },
            random: RandomFixed,
          }),
        ),
      )
    },
  )

  it.live(
    "update writes the title and a moved updatedAt under the owner's where, and returns the chat",
    () => {
      const updates: Array<readonly [ChatEntitySet, ChatEntityWhere]> = []
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
        assert.deepStrictEqual(updates, [
          [
            { title: trip, updatedAt: DateTime.toDateUtc(updated.updatedAt) },
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
    'update where the title is none reads and writes only while the chat is untitled',
    () => {
      const wheres: Array<ChatEntityWhere> = []
      return Effect.gen(function* () {
        const service = yield* ChatService

        const updated = yield* service.update(
          { title: Option.some(lisbonWeekend) },
          { id: chat.id, title: Option.none() },
        )

        assertEquals(updated.title, Option.some(lisbonWeekend))
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
                Effect.andThen(encodeWith(Chat)(chat)),
                Effect.map((row) => [row]),
              ),
          },
        }),
      ),
    )
  })

  it.effect("delete removes the owner's chat by its id", () => {
    const deleted: Array<ChatEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* ChatService

      yield* service.delete({ id: chat.id, userId: owner })

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
