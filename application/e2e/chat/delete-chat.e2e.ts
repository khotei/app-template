import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Exit, Option } from 'effect'
import { SqlClient } from 'effect/sql'

import { AttachmentBucket } from '@app-template/domain/attachment'
import { Chat, ChatService } from '@app-template/domain/chat'
import { chat, owner, upload } from '@app-template/domain/testing'
import { sortById } from '@app-template/testing'

import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import {
  ChatPgTest,
  selectAttachments,
  selectChat,
  selectMessages,
} from '#application/testing/chat.test-layer'

describe('ChatService.delete on Postgres', () => {
  it.effect('a refused chat delete keeps every row and the bytes', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const chatService = yield* ChatService
      const bucket = yield* AttachmentBucket
      const client = yield* SqlClient.SqlClient
      const photo = yield* upload(owner)
      const { userMessage, assistantMessage } = yield* sendMessage.send(owner, chat.id, {
        text: 'Look',
        attachmentIds: [photo.id],
      })
      // A row that references the chat without a cascade: Postgres refuses the chat's delete,
      // and the cascade it started goes back with it.
      yield* client
        .unsafe('CREATE TABLE chat_holds (chat_id uuid NOT NULL REFERENCES chats (id))')
        .pipe(Effect.orDie)
      yield* Effect.orDie(client`INSERT INTO chat_holds (chat_id) VALUES (${chat.id})`)

      const exit = yield* chatService.delete(owner, chat.id).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertEquals(
        yield* selectChat(chat.id),
        Option.some(new Chat({ ...chat, updatedAt: userMessage.message.createdAt })),
      )
      assertEquals(
        sortById(yield* selectMessages(chat.id)),
        sortById([userMessage.message, assistantMessage.message]),
      )
      assertEquals(yield* selectAttachments([photo]), userMessage.attachments)
      assert.isTrue(Option.isSome(yield* bucket.select(photo.id)))
    }).pipe(Effect.provide(ChatPgTest)),
  )
})
