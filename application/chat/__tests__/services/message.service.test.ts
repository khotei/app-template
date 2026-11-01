import { describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer } from 'effect'

import { RepositoryStackTest } from '@app-template/kernel/testing'
import { assertSchemaEquals } from '@app-template/testing'

import { MessageNotFoundError } from '#domain/message.error'
import { MessageService, type MessageWhere } from '#services/message.service'
import {
  chat,
  firstMessage,
  owner,
  stranger,
  unknownChatId,
  unknownMessageId,
} from '#testing/chat.test-fixture'
import { insertChatLayer, insertMessage } from '#testing/chat.test-layer'

/** The message service over the memory layers, on fresh rows where `chat` has `firstMessage`. */
const MessageServiceTest = MessageService.layer.pipe(
  Layer.provideMerge(Layer.effectDiscard(insertMessage(firstMessage))),
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(RepositoryStackTest),
)

const misses: ReadonlyArray<{ readonly name: string; readonly where: MessageWhere }> = [
  { name: "another user's", where: { id: firstMessage.id, chatId: chat.id, userId: stranger } },
  {
    name: "another chat's",
    where: { id: firstMessage.id, chatId: unknownChatId, userId: owner },
  },
  { name: 'an unknown', where: { id: unknownMessageId, chatId: chat.id, userId: owner } },
]

describe('MessageService', () => {
  it.effect("getOne returns the message of the user's chat", () =>
    Effect.gen(function* () {
      const service = yield* MessageService

      const found = yield* service.getOne({ id: firstMessage.id, chatId: chat.id, userId: owner })

      assertEquals(found, firstMessage)
    }).pipe(Effect.provide(MessageServiceTest)),
  )

  it.effect.each(misses)('getOne of $name message is MessageNotFoundError', ({ where }) =>
    Effect.gen(function* () {
      const service = yield* MessageService

      const error = yield* service.getOne(where).pipe(Effect.flip)

      assertSchemaEquals(MessageNotFoundError, error, new MessageNotFoundError({ id: where.id }))
    }).pipe(Effect.provide(MessageServiceTest)),
  )
})
