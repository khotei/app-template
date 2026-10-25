import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Deferred, Effect, Exit, Layer, Option, Ref } from 'effect'

import { AttachmentStore } from '@app-template/domain/attachment'
import { ChatNotFoundError, ChatRepository } from '@app-template/domain/chat'
import { ChatRepositoryPg } from '@app-template/infrastructure/chat'
import { assertSchemaEquals } from '@app-template/testing'

import { ChatService } from '#application/chat/chat.service'
import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { ask, chat, unknownChatId } from '#application/testing/chat.fixture'
import {
  ChatFakes,
  ChatTest,
  layerChatTest,
  selectAttachments,
  selectChat,
  selectMessages,
  upload,
} from '#application/testing/chat.harness'
import { owner, stranger } from '#application/testing/user.fixture'

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
      assertEquals(yield* (yield* AttachmentStore).select(photo.id), Option.none())
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('a delete retried after the chat write failed still removes everything', () =>
    Effect.gen(function* () {
      const deleteChat = yield* DeleteChatUseCase
      const { photo } = yield* sendPhoto

      const failed = yield* Effect.exit(deleteChat.delete(owner, chat.id))
      yield* deleteChat.delete(owner, chat.id)

      assert.isTrue(Exit.hasDies(failed))
      assertEquals(yield* selectChat(chat.id), Option.none())
      assertEquals(yield* selectMessages(chat.id), [])
      assertEquals(yield* selectAttachments([photo]), [])
      assertEquals(yield* (yield* AttachmentStore).select(photo.id), Option.none())
    }).pipe(Effect.provide(layerChatTest(ChatRepositoryDeleteFailingOnce))),
  )

  it.effect('a delete during a send of the same user waits for it, then removes its messages', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const deleteChat = yield* DeleteChatUseCase
      const { interleaving } = yield* ChatFakes
      const checked = yield* Deferred.make<void>()
      // Turns enough for a delete that does not wait to finish before the send writes.
      interleaving.write = Effect.andThen(
        Deferred.succeed(checked, undefined),
        Effect.repeat(Effect.yieldNow, { times: 9 }),
      )

      // Started from the test's fiber: one forked inside the send would share its transaction.
      yield* Effect.all(
        [
          sendMessage.send(owner, chat.id, ask('Lisbon?')),
          Effect.andThen(Deferred.await(checked), deleteChat.delete(owner, chat.id)),
        ],
        { concurrency: 'unbounded', discard: true },
      )

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
