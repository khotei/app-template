import { BunCrypto } from '@effect/platform-bun'
import { Array as Arr, DateTime, Effect, Layer, Stream } from 'effect'

import {
  type Attachment,
  AttachmentRepository,
  FileName,
  MediaType,
} from '@app-template/domain/attachment'
import {
  type ChatId,
  ChatRepository,
  completeMessage,
  type Message,
  MessageRepository,
  prepareMessage,
} from '@app-template/domain/chat'
import { AttachmentStoreMemory, chat } from '@app-template/domain/testing'
import type { UserId } from '@app-template/domain/user'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { ChatRepositoryPg, MessageRepositoryPg } from '@app-template/infrastructure/chat'
import type { Db } from '@app-template/infrastructure/db'
import { QueueClientOutbox } from '@app-template/infrastructure/shared'
import { png } from '@app-template/testing'

import { AttachmentService } from '#application/attachment/attachment.service'
import { ChatService } from '#application/chat/chat.service'
import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { DbWithUsers } from '#application/testing/db.harness'

const insertChat = Layer.effectDiscard(
  Effect.flatMap(ChatRepository, (chats) => chats.insert(chat)),
)

/**
 * The chat services and use cases on a fresh test database where `chat` exists, over the memory
 * attachment store and the outbox; `chats` replaces the Postgres chat repository.
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
        AttachmentStoreMemory,
        QueueClientOutbox,
      ),
    ),
    Layer.provideMerge(DbWithUsers),
    Layer.provide(BunCrypto.layer),
  )

export const ChatTest = layerChatTest()

export const upload = (userId: UserId, name: string) =>
  Effect.flatMap(AttachmentService, (attachments) =>
    attachments.upload(
      userId,
      Stream.make({
        fileName: FileName.make(name),
        mediaType: MediaType.make('image/png'),
        content: Stream.make(png),
      }),
    ),
  ).pipe(
    Effect.flatMap((uploaded) => Effect.fromOption(Arr.head(uploaded))),
    Effect.orDie,
  )

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
    repository.selectByIds(Arr.map(attachments, (attachment) => attachment.id)),
  )
