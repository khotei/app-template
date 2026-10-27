import { BunCrypto } from '@effect/platform-bun'
import { Array as Arr, Context, DateTime, Effect, Layer, Stream } from 'effect'

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
import type { UserId } from '@app-template/domain/user'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { ChatRepositoryPg, MessageRepositoryPg } from '@app-template/infrastructure/chat'
import type { Db } from '@app-template/infrastructure/db'
import { recordQueue, type SentJob } from '@app-template/queue/testing'
import { png } from '@app-template/testing'

import { AttachmentService } from '#application/attachment/attachment.service'
import { ChatService } from '#application/chat/chat.service'
import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { AttachmentStoreMemory } from '#application/testing/attachment.fake'
import { chat } from '#application/testing/chat.fixture'
import { DbWithUsers } from '#application/testing/db.harness'

/** The handle of the fake under `ChatTest`: the jobs sent. */
export class ChatFakes extends Context.Service<
  ChatFakes,
  { readonly sent: ReadonlyArray<SentJob> }
>()('@app-template/application/chat/ChatFakes') {
  static readonly layer = Layer.unwrap(
    Effect.sync(() => {
      const queue = recordQueue()
      return Layer.merge(queue.layer, Layer.succeed(ChatFakes, { sent: queue.sent }))
    }),
  )
}

const insertChat = Layer.effectDiscard(
  Effect.flatMap(ChatRepository, (chats) => chats.insert(chat)),
)

/**
 * The chat services and use cases on a fresh test database where `chat` exists, over the memory
 * attachment store and the recording queue; `chats` replaces the Postgres chat repository.
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
        ChatFakes.layer,
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
  Effect.flatMap(MessageRepository, (messages) => messages.selectByChat(chatId))

export const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  Effect.flatMap(AttachmentRepository, (repository) =>
    repository.selectByIds(Arr.map(attachments, (attachment) => attachment.id)),
  )
