import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Option } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { MessageNotFoundError } from '#chat/domain/message.error'
import type { MessageFilter } from '#chat/services/message.repository'
import { MessageService } from '#chat/services/message.service'
import { chat, firstMessage, owner } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'

const where = { id: firstMessage.id, chatId: chat.id, userId: owner }

describe('MessageService', () => {
  it.effect('getOne reads the message by the where it was given', () => {
    const wheres: Array<MessageFilter> = []
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
              }).pipe(Effect.as(Option.some(firstMessage))),
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

  it.effect("getMany reads the chat's messages by the where it was given", () => {
    const wheres: Array<MessageFilter> = []
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
              }).pipe(Effect.as([firstMessage])),
          },
        }),
      ),
    )
  })
})
