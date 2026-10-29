import { describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import { AttachmentBucket } from '@app-template/domain/attachment'
import { ChatService } from '@app-template/domain/chat'
import { chat, owner, upload } from '@app-template/domain/testing'
import { recordQueue } from '@app-template/queue/testing'

import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import {
  ChatTest,
  selectAttachments,
  selectChat,
  selectMessages,
} from '#application/testing/chat.test-layer'

describe('DeleteChatUseCase', () => {
  it.effect(
    'delete while a reply runs removes the chat, its messages, their attachments and the bytes',
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const chats = yield* ChatService
        const sendMessage = yield* SendMessageUseCase
        const deleteChat = yield* DeleteChatUseCase
        const bucket = yield* AttachmentBucket
        const photo = yield* upload(owner)
        yield* sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] })

        yield* deleteChat.delete(owner, chat.id)

        assertEquals(yield* chats.list(owner), [])
        assertEquals(yield* selectChat(chat.id), Option.none())
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo]), [])
        assertEquals(yield* bucket.select(photo.id), Option.none())
      }).pipe(Effect.provide(ChatTest.pipe(Layer.provide(queue.layer))))
    },
  )
})
