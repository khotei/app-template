import { BunCrypto } from '@effect/platform-bun'
import { Array as Arr, DateTime, Effect, Layer } from 'effect'

import {
  type Attachment,
  AttachmentRepository,
  AttachmentService,
} from '@app-template/domain/attachment'
import {
  type ChatId,
  ChatRepository,
  completeMessage,
  type Message,
  MessageRepository,
  prepareMessage,
} from '@app-template/domain/chat'
import { AttachmentBucketTest, chat } from '@app-template/domain/testing'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { ChatRepositoryPg, MessageRepositoryPg } from '@app-template/infrastructure/chat'
import type { Db } from '@app-template/infrastructure/db'
import { QueueClientOutbox } from '@app-template/infrastructure/shared'

import { ChatService } from '#application/chat/chat.service'
import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { DbWithUsersTest } from '#application/testing/db.test-layer'

const insertChat = Layer.effectDiscard(
  Effect.flatMap(ChatRepository, (chats) => chats.insert(chat)),
)

/**
 * The chat services and use cases on a fresh test database where `chat` exists, over the memory
 * attachment bucket and the outbox; `chats` replaces the Postgres chat repository.
 */
export const layerChatTest = (chats: Layer.Layer<ChatRepository, never, Db> = ChatRepositoryPg) =>
  Layer.mergeAll(
    ChatService.layer,
    AttachmentService.layer,
    SendMessageUseCase.layer,
    DeleteChatUseCase.layer,
  ).pipe(
    Layer.provideMerge(insertChat),
    Layer.provideMerge(
      Layer.mergeAll(
        chats,
        MessageRepositoryPg,
        AttachmentRepositoryPg,
        AttachmentBucketTest,
        QueueClientOutbox,
      ),
    ),
    Layer.provideMerge(DbWithUsersTest),
    Layer.provide(BunCrypto.layer),
  )

export const ChatTest = layerChatTest()

/** Completes an assistant message as the worker would, freeing its chat for the next send. */
export const settle = (message: Message) =>
  Effect.gen(function* () {
    const messages = yield* MessageRepository
    const at = yield* DateTime.now

    const prepared = yield* prepareMessage(message, at)
    const completed = yield* completeMessage(prepared, { text: 'Sure.', at })
    yield* messages.update(completed, { stage: message.stage })
  })

export const selectChat = (chatId: ChatId) =>
  Effect.flatMap(ChatRepository, (chats) => chats.selectById(chatId))

export const selectMessages = (chatId: ChatId) =>
  Effect.flatMap(MessageRepository, (messages) => messages.selectByChat(chatId)).pipe(
    Effect.map(Arr.map(({ message }) => message)),
  )

export const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  Effect.flatMap(AttachmentRepository, (repository) =>
    repository.selectMany({ id: Arr.map(attachments, (attachment) => attachment.id) }),
  )
