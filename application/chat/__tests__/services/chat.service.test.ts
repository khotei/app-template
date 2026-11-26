import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Exit, Layer, Option, Schema, Struct } from 'effect'

import type { UserId } from '@app-template/application/user'
import {
  type ChatColumns,
  type ChatEntitySelectWhere,
  type ChatEntitySet,
  type ChatEntityWhere,
  ChatRepository,
} from '@app-template/kernel/data'
import { encodeWith, RowCodec } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch, isUuidV7 } from '@app-template/packages/testing'

import { Chat, ChatNotFoundError, ChatTitle } from '#chat/domain/chat.model'
import type { ChatId } from '#chat/domain/chat.util'
import { Run } from '#chat/domain/run.model'
import { ChatService } from '#chat/services/chat.service'
import {
  chat,
  firstMessage,
  owner,
  queuedRun,
  unknownChatId,
} from '#testing/chat/chat.test-fixture'

/** The service over a repository that implements only the methods the case gives; any other dies. */
const chatServiceOver = ({
  chats = {},
}: {
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
}) => ChatService.layer.pipe(Layer.provide(Layer.mock(ChatRepository, chats)))

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

/** A title a where names, and what the repository's filter holds for it. */
const titleWheres: ReadonlyArray<{
  readonly name: string
  readonly title: Chat['title']
  readonly stored: Required<ChatEntityWhere>['title']
}> = [
  { name: 'none', title: Option.none(), stored: { isNull: true } },
  { name: 'some', title: Option.some(trip), stored: 'Trip' },
]

describe('ChatService', () => {
  // The id's random bits come from `globalThis.crypto`, past any `SecureRandom` a test provides,
  // so the case asserts its form, not its value.
  it.effect(
    'create inserts an untitled chat with a UUIDv7 id at the clock time, and returns it',
    () => {
      const inserts: Array<ChatColumns> = []
      return Effect.gen(function* () {
        const service = yield* ChatService

        const created = yield* service.create(owner)

        assert.isTrue(isUuidV7(created.id))
        assertEquals(
          created,
          new Chat({ id: created.id, userId: owner, createdAt: epoch, updatedAt: epoch }),
        )
        assert.deepStrictEqual(inserts, [
          {
            id: created.id,
            userId: owner,
            title: null,
            context: null,
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
            {
              id: chat.id,
              title: trip,
              context: null,
              updatedAt: DateTime.toDateUtc(updated.updatedAt),
            },
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

  it.live('update writes a context with the title the chat was read with', () => {
    const updates: Array<readonly [ChatEntitySet, ChatEntityWhere]> = []
    const titled = new Chat({ ...chat, title: Option.some(trip) })
    const cut = { compacted: 'A summary.', headMessageId: firstMessage.id }
    return Effect.gen(function* () {
      const service = yield* ChatService

      const updated = yield* service.update(
        { context: Option.some(cut) },
        { id: chat.id, userId: owner },
      )

      assertEquals(
        updated,
        new Chat({ ...titled, context: Option.some(cut), updatedAt: updated.updatedAt }),
      )
      assert.deepStrictEqual(updates, [
        [
          {
            id: chat.id,
            title: trip,
            context: { compacted: 'A summary.', headMessageId: firstMessage.id },
            updatedAt: DateTime.toDateUtc(updated.updatedAt),
          },
          { id: chat.id, userId: owner },
        ],
      ])
    }).pipe(
      Effect.provide(
        chatServiceOver({
          chats: {
            selectOne: selectsOne(titled),
            update: (...update) =>
              Effect.sync(() => {
                updates.push(update)
              }),
          },
        }),
      ),
    )
  })

  it.effect.each(titleWheres)(
    'update where the title is $name reads and writes only while the chat holds it',
    ({ title, stored }) => {
      const wheres: Array<ChatEntitySelectWhere> = []
      return Effect.gen(function* () {
        const service = yield* ChatService

        const updated = yield* service.update(
          { title: Option.some(lisbonWeekend) },
          { id: chat.id, title },
        )

        assertEquals(updated.title, Option.some(lisbonWeekend))
        assert.deepStrictEqual(wheres, [
          { id: chat.id, title: stored },
          { id: chat.id, title: stored },
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
    const wheres: Array<ChatEntitySelectWhere> = []
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

  it.effect('delete reads the chat, then removes it, both under its owner', () => {
    const reads: Array<ChatEntitySelectWhere> = []
    const deleted: Array<ChatEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* ChatService

      yield* service.delete({ id: chat.id, userId: owner })

      assert.deepStrictEqual(reads, [{ id: chat.id, userId: owner }])
      assert.deepStrictEqual(deleted, [{ id: chat.id, userId: owner }])
    }).pipe(
      Effect.provide(
        chatServiceOver({
          chats: {
            selectOne: (where) =>
              Effect.sync(() => {
                reads.push(where)
              }).pipe(Effect.andThen(selectsOne(chat))),
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

describe("a Chat's rows, as its service codes them", () => {
  it.effect('a row without one of its columns fails to compile, and its read dies', () =>
    Effect.gen(function* () {
      const { createdAt: _, ...drifted } = yield* encodeWith(Chat)(chat)

      // @ts-expect-error a row without createdAt is no Chat's
      const decoded = RowCodec.decodeOne(Chat)(Option.some(drifted))
      const defect = yield* decoded.pipe(Effect.catchDefect(Effect.succeed))

      assert.isTrue(Schema.isSchemaError(defect))
    }),
  )

  it.effect("a Run's row fails to compile as a chat's", () =>
    Effect.gen(function* () {
      const fields = Struct.pick(queuedRun, ['chatId', 'userId', 'userMessageId'])
      const { row } = yield* RowCodec.makeInsert(Run)(fields)

      // @ts-expect-error a Run's row is no chat's
      const chatRow: ChatColumns = row

      assert.notProperty(chatRow, 'title')
    }),
  )

  it.effect('an update keeps the title typed and refuses the owner, written once', () =>
    Effect.gen(function* () {
      const update = RowCodec.makeUpdate(Chat)

      // @ts-expect-error a title is an Option of a ChatTitle
      const untitled = yield* update({ id: chat.id, title: 'Trip' }).pipe(Effect.exit)
      // @ts-expect-error userId is written once, by the insert
      const { row } = yield* update({ id: chat.id, userId: owner })

      assert.isTrue(Exit.hasDies(untitled))
      assert.notProperty(row, 'userId')
    }),
  )
})
