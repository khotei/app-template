import { assert } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Deferred, Effect, Exit, Fiber, Layer, Option, Ref } from 'effect'

import { AttachmentStore } from '@app-template/domain/attachment'
import { ChatNotFoundError, ChatRepository } from '@app-template/domain/chat'
import { ChatRepositoryPg } from '@app-template/infrastructure/chat'
import { assertSchemaEquals } from '@app-template/testing'

import { ask, unknownChatId } from '#application/testing/chat.fixture'
import {
  chatSuite,
  selectAttachments,
  selectChat,
  selectMessages,
  upload,
  withChat,
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

chatSuite('DeleteChatUseCase', (it) => {
  it.effect('delete while a message is active removes the chat, its messages and attachments', () =>
    withChat(({ chat, chats, sendMessage, deleteChat }) =>
      Effect.gen(function* () {
        const photo = yield* upload(owner, 'photo.png')
        yield* sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] })

        yield* deleteChat.delete(owner, chat.id)

        assertEquals(
          yield* Effect.flip(chats.get(owner, chat.id)),
          new ChatNotFoundError({ id: chat.id }),
        )
        assertEquals(yield* chats.list(owner), [])
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo]), [])
        assertEquals(yield* (yield* AttachmentStore).select(photo.id), Option.none())
      }),
    ),
  )

  it.effect('a delete retried after the chat write failed still removes everything', () =>
    withChat(
      ({ chat, sendMessage, deleteChat }) =>
        Effect.gen(function* () {
          const photo = yield* upload(owner, 'photo.png')
          yield* sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] })

          const failed = yield* Effect.exit(deleteChat.delete(owner, chat.id))
          yield* deleteChat.delete(owner, chat.id)

          assert.isTrue(Exit.hasDies(failed))
          assertEquals(yield* selectChat(chat.id), Option.none())
          assertEquals(yield* selectMessages(chat.id), [])
          assertEquals(yield* selectAttachments([photo]), [])
          assertEquals(yield* (yield* AttachmentStore).select(photo.id), Option.none())
        }),
      { chats: ChatRepositoryDeleteFailingOnce },
    ),
  )

  it.effect('a delete during a send of the same user waits for it, then removes its messages', () =>
    withChat(({ chat, interleaving, sendMessage, deleteChat }) =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<Fiber.Fiber<void, ChatNotFoundError>>()
        interleaving.write = Effect.gen(function* () {
          yield* Deferred.succeed(
            started,
            yield* Effect.forkDetach(deleteChat.delete(owner, chat.id)),
          )
          // Turns enough for a delete that does not wait to finish before the send writes.
          yield* Effect.repeat(Effect.yieldNow, { times: 9 })
        })

        yield* sendMessage.send(owner, chat.id, ask('Lisbon?'))
        yield* Effect.flatMap(Deferred.await(started), Fiber.join)

        assertEquals(yield* selectChat(chat.id), Option.none())
        assertEquals(yield* selectMessages(chat.id), [])
      }),
    ),
  )

  it.effect("delete of another user's chat or of an unknown chat is ChatNotFoundError", () =>
    withChat(({ chat, sendMessage, deleteChat }) =>
      Effect.gen(function* () {
        const photo = yield* upload(owner, 'photo.png')
        const { userMessage } = yield* sendMessage.send(owner, chat.id, {
          text: 'Look',
          attachmentIds: [photo.id],
        })

        const foreign = yield* Effect.flip(deleteChat.delete(stranger, chat.id))
        const missing = yield* Effect.flip(deleteChat.delete(owner, unknownChatId))

        assertSchemaEquals(ChatNotFoundError, foreign, new ChatNotFoundError({ id: chat.id }))
        assertSchemaEquals(ChatNotFoundError, missing, new ChatNotFoundError({ id: unknownChatId }))
        assertEquals(yield* selectAttachments([photo]), userMessage.attachments)
        assertEquals((yield* selectMessages(chat.id)).length, 2)
      }),
    ),
  )
})
