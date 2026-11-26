import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Option } from 'effect'

import type { MessageEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { Message, MessageNotFoundError } from '#chat/domain/message.model'
import { MessageService } from '#chat/services/message.service'
import { chat, firstMessage, owner } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'

const firstMessageRow = encodeWith(Message)(firstMessage)

const where = { id: firstMessage.id, chatId: chat.id, userId: owner }

describe('MessageService', () => {
  it.effect('getOne reads the message by the id, chat and user of its where', () => {
    const wheres: Array<MessageEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* MessageService

      const found = yield* service.getOne(where)

      assertEquals(found, firstMessage)
      assert.deepStrictEqual(wheres, [where])
    }).pipe(
      Effect.provide(
        layerChatTest({
          messages: {
            selectOne: (read) =>
              Effect.sync(() => {
                wheres.push(read)
              }).pipe(Effect.andThen(firstMessageRow), Effect.map(Option.some)),
          },
        }),
      ),
    )
  })

  it.effect('getOne of a message the store finds none of is MessageNotFoundError', () =>
    Effect.gen(function* () {
      const service = yield* MessageService

      const error = yield* service.getOne(where).pipe(Effect.flip)

      assertSchemaEquals(MessageNotFoundError, error, new MessageNotFoundError({ id: where.id }))
    }).pipe(Effect.provide(layerChatTest({ messages: { selectOne: () => Effect.succeedNone } }))),
  )

  it.effect("getMany reads the chat's messages from the one its where names on", () => {
    const wheres: Array<MessageEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* MessageService

      yield* service.getMany({ chatId: chat.id, fromId: firstMessage.id })

      assert.deepStrictEqual(wheres, [{ chatId: chat.id, id: { gte: firstMessage.id } }])
    }).pipe(
      Effect.provide(
        layerChatTest({
          messages: {
            selectMany: (read) =>
              Effect.sync(() => {
                wheres.push(read)
              }).pipe(Effect.as([])),
          },
        }),
      ),
    )
  })

  it.effect("getMany reads the chat's messages by the chat of its where", () => {
    const wheres: Array<MessageEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* MessageService

      const found = yield* service.getMany({ chatId: chat.id })

      assertEquals(found, [firstMessage])
      assert.deepStrictEqual(wheres, [{ chatId: chat.id }])
    }).pipe(
      Effect.provide(
        layerChatTest({
          messages: {
            selectMany: (read) =>
              Effect.sync(() => {
                wheres.push(read)
              }).pipe(
                Effect.andThen(firstMessageRow),
                Effect.map((row) => [row]),
              ),
          },
        }),
      ),
    )
  })
})
