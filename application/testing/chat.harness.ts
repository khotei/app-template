import { BunCrypto } from '@effect/platform-bun'
import { Array as Arr, DateTime, Effect, Layer, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { TestCrypto } from 'effect/testing'

import {
  type Attachment,
  AttachmentRepository,
  FileName,
  MediaType,
} from '@app-template/domain/attachment'
import {
  type Chat,
  type ChatId,
  ChatRepository,
  completeMessage,
  type Message,
  MessageRepository,
  prepareMessage,
} from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'
import { AttachmentStoreKv } from '@app-template/infrastructure/attachment'
import { ChatRepositoryKv } from '@app-template/infrastructure/chat'

import { AttachmentService } from '#application/attachment/attachment.service'
import { ChatService } from '#application/chat/chat.service'
import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { png } from '#application/testing/attachment.fixture'
import {
  AttachmentRepositoryYielding,
  type Interleaving,
  interleaveMessages,
} from '#application/testing/chat.fake'
import { recordQueue, type SentJob } from '#application/testing/queue.fake'
import { owner } from '#application/testing/user.fixture'

export interface ChatHarnessOptions {
  /** Replaces the KV chat repository, to fail or script one of its calls. */
  readonly chats?: Layer.Layer<ChatRepository, never, KeyValueStore.KeyValueStore>
}

/** The chat services and use cases on the memory store, over the recording and yielding fakes. */
export const makeChatHarness = (options: ChatHarnessOptions = {}) => {
  const queue = recordQueue()
  const messages = interleaveMessages()
  const layer = Layer.mergeAll(
    ChatService.layer,
    AttachmentService.layer,
    SendMessageUseCase.layer,
    DeleteChatUseCase.layer,
  ).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        options.chats ?? ChatRepositoryKv,
        messages.layer,
        AttachmentRepositoryYielding,
        AttachmentStoreKv,
      ),
    ),
    Layer.provide(queue.layer),
    Layer.provide(TestCrypto.layer('chat-service').pipe(Layer.provide(BunCrypto.layer))),
    Layer.provide(KeyValueStore.layerMemory),
  )
  return { sent: queue.sent, interleaving: messages.interleaving, layer }
}

export type ChatHarnessServices = Layer.Success<ReturnType<typeof makeChatHarness>['layer']>

export interface ChatArranged {
  /** A chat of `owner`, created at the clock's start. */
  readonly chat: Chat
  readonly sent: ReadonlyArray<SentJob>
  readonly interleaving: Interleaving
  readonly chats: ChatService['Service']
  readonly attachments: AttachmentService['Service']
  readonly sendMessage: SendMessageUseCase['Service']
  readonly deleteChat: DeleteChatUseCase['Service']
}

/** Runs `body` on a fresh harness, with a chat of `owner` and the services under test. */
export const withChat = <E>(
  body: (arranged: ChatArranged) => Effect.Effect<void, E, ChatHarnessServices>,
  options?: ChatHarnessOptions,
) => {
  const { sent, interleaving, layer } = makeChatHarness(options)
  return Effect.gen(function* () {
    const chats = yield* ChatService
    const attachments = yield* AttachmentService
    const sendMessage = yield* SendMessageUseCase
    const deleteChat = yield* DeleteChatUseCase
    const chat = yield* chats.create(owner)
    yield* body({ chat, sent, interleaving, chats, attachments, sendMessage, deleteChat })
  }).pipe(Effect.provide(layer))
}

export const upload = (userId: UserId, name: string) =>
  Effect.flatMap(AttachmentService, (attachments) =>
    attachments.upload(userId, {
      fileName: FileName.make(name),
      mediaType: MediaType.make('image/png'),
      content: Stream.make(png),
    }),
  )

/** Completes an assistant message as the worker would, freeing its chat for the next send. */
export const settle = (message: Message) =>
  Effect.gen(function* () {
    const messages = yield* MessageRepository
    const at = yield* DateTime.now

    const prepared = yield* prepareMessage(message, at)
    const completed = yield* completeMessage(prepared, { text: 'Sure.', at })
    yield* messages.update(completed)
  })

export const idsOf = (attachments: ReadonlyArray<Attachment>) =>
  Arr.map(attachments, (attachment) => attachment.id)

export const selectChat = (chatId: ChatId) =>
  Effect.flatMap(ChatRepository, (chats) => chats.selectById(chatId))

export const selectMessages = (chatId: ChatId) =>
  Effect.flatMap(MessageRepository, (messages) => messages.selectByChat(chatId))

export const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  Effect.flatMap(AttachmentRepository, (repository) => repository.selectByIds(idsOf(attachments)))
