import { describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer } from 'effect'

import { RepositoryStackTest } from '@app-template/kernel/data/testing'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { MessageId } from '#chat/domain/chat.id'
import { MessageNotFoundError } from '#chat/domain/message.error'
import { MessageService, type MessageWhere } from '#chat/services/message.service'
import { chat, firstMessage, owner, stranger, unknownChatId } from '#testing/chat/chat.test-fixture'
import { insertChatLayer, insertMessage } from '#testing/chat/chat.test-layer'

const unknownMessageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000039')

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
