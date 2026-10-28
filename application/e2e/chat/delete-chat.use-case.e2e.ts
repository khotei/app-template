import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Exit, Option } from 'effect'
import { SqlClient } from 'effect/sql'

import { chat, owner, upload } from '@app-template/domain/testing'

import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import {
  ChatPgTest,
  selectAttachments,
  selectChat,
  selectMessages,
} from '#application/testing/chat.test-layer'

describe('DeleteChatUseCase', () => {
  it.effect('a delete whose chat delete is refused keeps every row', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const deleteChat = yield* DeleteChatUseCase
      const client = yield* SqlClient.SqlClient
      const photo = yield* upload(owner)
      const { userMessage } = yield* sendMessage.send(owner, chat.id, {
        text: 'Look',
        attachmentIds: [photo.id],
      })
      // A row that references the chat without a cascade: Postgres refuses the chat's delete,
      // the write after the attachments' rows went.
      yield* Effect.orDie(
        client.unsafe('CREATE TABLE chat_holds (chat_id uuid NOT NULL REFERENCES chats (id))'),
      )
      yield* Effect.orDie(client`INSERT INTO chat_holds (chat_id) VALUES (${chat.id})`)

      const exit = yield* Effect.exit(deleteChat.delete(owner, chat.id))

      assert.isTrue(Exit.hasDies(exit))
      assert.isTrue(Option.isSome(yield* selectChat(chat.id)))
      assert.strictEqual((yield* selectMessages(chat.id)).length, 2)
      assertEquals(yield* selectAttachments([photo]), userMessage.attachments)
    }).pipe(Effect.provide(ChatPgTest)),
  )
})
