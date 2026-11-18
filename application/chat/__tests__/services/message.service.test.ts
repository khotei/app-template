import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import {
  type ChatEntityWhere,
  ChatRepository,
  type MessageEntityWhere,
  MessageRepository,
} from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { MessageNotFoundError } from '#chat/domain/message.error'
import { Message } from '#chat/domain/message.model'
import { MessageService, type MessageWhere } from '#chat/services/message.service'
import { chat, firstMessage, owner } from '#testing/chat/chat.test-fixture'

/** The service over repositories that answer only the methods the case gives; any other dies. */
const messageServiceOver = ({
  chats = {},
  messages = {},
}: {
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
  readonly messages?: Layer.PartialEffectful<MessageRepository['Service']>
}) =>
  MessageService.layer.pipe(
    Layer.provide([
      Layer.mock(ChatRepository, chats),
      Layer.mock(MessageRepository, messages),
      BunCrypto.layer,
    ]),
  )

const firstMessageRow = encodeRowWith(Message)(firstMessage)

const where = { id: firstMessage.id, chatId: chat.id, userId: owner }

describe('MessageService', () => {
  it.effect('getOne reads the message by the where it was given', () => {
    const wheres: Array<MessageEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* MessageService

      const found = yield* service.getOne(where)

      assertEquals(found, firstMessage)
      assert.deepStrictEqual(wheres, [where])
    }).pipe(
      Effect.provide(
        messageServiceOver({
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

  it.effect.each<{ readonly name: string; readonly where: MessageWhere }>([
    { name: 'a message', where },
    { name: "an assistant's message", where: { ...where, author: 'assistant' } },
  ])('getOne of $name the store finds none of is MessageNotFoundError', ({ where }) =>
    Effect.gen(function* () {
      const service = yield* MessageService

      const error = yield* service.getOne(where).pipe(Effect.flip)

      assertSchemaEquals(
        MessageNotFoundError,
        error,
        new MessageNotFoundError({ id: where.id, author: Option.fromUndefinedOr(where.author) }),
      )
    }).pipe(
      Effect.provide(messageServiceOver({ messages: { selectOne: () => Effect.succeedNone } })),
    ),
  )

  it.effect('getMany of a chat the store finds none of for the user is ChatNotFoundError', () => {
    const wheres: Array<ChatEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* MessageService

      const error = yield* service.getMany({ chatId: chat.id, userId: owner }).pipe(Effect.flip)

      assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
      assert.deepStrictEqual(wheres, [{ id: chat.id, userId: owner }])
    }).pipe(
      Effect.provide(
        messageServiceOver({
          chats: {
            selectOne: (read) =>
              Effect.sync(() => {
                wheres.push(read)
              }).pipe(Effect.as(Option.none())),
          },
        }),
      ),
    )
  })
})
