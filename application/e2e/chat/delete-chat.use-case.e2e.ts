import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Exit, Layer, Option, Ref } from 'effect'

import { AttachmentBucket } from '@app-template/domain/attachment'
import { ChatNotFoundError, ChatRepository } from '@app-template/domain/chat'
import { ask, chat, owner, stranger, unknownChatId, upload } from '@app-template/domain/testing'
import { ChatRepositoryPg } from '@app-template/infrastructure/chat'
import { assertSchemaEquals } from '@app-template/testing'

import { ChatService } from '#application/chat/chat.service'
import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import {
  ChatTest,
  layerChatTest,
  selectAttachments,
  selectChat,
  selectMessages,
} from '#application/testing/chat.test-layer'

/** The Postgres chat repository whose first `delete` dies, as a store failure would. */
const ChatRepositoryDeleteFailingOnce = Layer.effect(
  ChatRepository,
  Effect.gen(function* () {
    const inner = yield* ChatRepository
    const failuresLeft = yield* Ref.make(1)
    return ChatRepository.of({
      ...inner,
      delete: (id) =>
        Effect.flatMap(
          Ref.getAndUpdate(failuresLeft, (left) => left - 1),
          (left) => (left > 0 ? Effect.die('store failed') : inner.delete(id)),
        ),
    })
  }),
).pipe(Layer.provide(ChatRepositoryPg))

/** A message with an attachment in `chat`. */
const sendPhoto = Effect.gen(function* () {
  const sendMessage = yield* SendMessageUseCase
  const photo = yield* upload(owner, 'photo.png')

  const { userMessage } = yield* sendMessage.send(owner, chat.id, {
    text: 'Look',
    attachmentIds: [photo.id],
  })
  return { photo, userMessage }
})

describe('DeleteChatUseCase', () => {
  it.effect('delete while a message is active removes the chat, its messages and attachments', () =>
    Effect.gen(function* () {
      const chats = yield* ChatService
      const deleteChat = yield* DeleteChatUseCase
      const { photo } = yield* sendPhoto

      yield* deleteChat.delete(owner, chat.id)

      assertEquals(
        yield* Effect.flip(chats.get(owner, chat.id)),
        new ChatNotFoundError({ id: chat.id }),
      )
      assertEquals(yield* chats.list(owner), [])
      assertEquals(yield* selectMessages(chat.id), [])
      assertEquals(yield* selectAttachments([photo]), [])
      assertEquals(yield* (yield* AttachmentBucket).select(photo.id), Option.none())
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('a delete whose chat write fails keeps every row, and a retry removes them', () =>
    Effect.gen(function* () {
      const deleteChat = yield* DeleteChatUseCase
      const { photo, userMessage } = yield* sendPhoto

      const failed = yield* Effect.exit(deleteChat.delete(owner, chat.id))

      assert.isTrue(Exit.hasDies(failed))
      assert.isTrue(Option.isSome(yield* selectChat(chat.id)))
      assertEquals((yield* selectMessages(chat.id)).length, 2)
      assertEquals(yield* selectAttachments([photo]), userMessage.attachments)

      yield* deleteChat.delete(owner, chat.id)

      assertEquals(yield* selectChat(chat.id), Option.none())
      assertEquals(yield* selectMessages(chat.id), [])
      assertEquals(yield* selectAttachments([photo]), [])
      assertEquals(yield* (yield* AttachmentBucket).select(photo.id), Option.none())
    }).pipe(Effect.provide(layerChatTest(ChatRepositoryDeleteFailingOnce))),
  )

  it.effect('a delete beside a send of the same chat leaves no chat and no message', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const deleteChat = yield* DeleteChatUseCase

      const [, sent] = yield* Effect.all(
        [
          deleteChat.delete(owner, chat.id),
          Effect.exit(sendMessage.send(owner, chat.id, ask('Lisbon?'))),
        ],
        { concurrency: 'unbounded' },
      )

      if (Exit.isFailure(sent)) {
        assertSchemaEquals(
          ChatNotFoundError,
          yield* Effect.fromOption(Exit.findErrorOption(sent)),
          new ChatNotFoundError({ id: chat.id }),
        )
      }
      assertEquals(yield* selectChat(chat.id), Option.none())
      assertEquals(yield* selectMessages(chat.id), [])
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect("delete of another user's chat or of an unknown chat is ChatNotFoundError", () =>
    Effect.gen(function* () {
      const deleteChat = yield* DeleteChatUseCase
      const { photo, userMessage } = yield* sendPhoto

      const foreign = yield* Effect.flip(deleteChat.delete(stranger, chat.id))
      const missing = yield* Effect.flip(deleteChat.delete(owner, unknownChatId))

      assertSchemaEquals(ChatNotFoundError, foreign, new ChatNotFoundError({ id: chat.id }))
      assertSchemaEquals(ChatNotFoundError, missing, new ChatNotFoundError({ id: unknownChatId }))
      assertEquals(yield* selectAttachments([photo]), userMessage.attachments)
      assertEquals((yield* selectMessages(chat.id)).length, 2)
    }).pipe(Effect.provide(ChatTest)),
  )
})
