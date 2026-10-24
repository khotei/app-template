import { BunCrypto } from '@effect/platform-bun'
import { Array as Arr, DateTime, Effect, Layer, Stream } from 'effect'
import { TestClock, TestCrypto } from 'effect/testing'

import { AwsConfigOwnBucket } from '@app-template/aws/testing'
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
import {
  buildUser,
  Credential,
  SecretHash,
  type UserId,
  UserRepository,
} from '@app-template/domain/user'
import { AttachmentStoreS3 } from '@app-template/infrastructure/attachment'
import { ChatRepositoryPg } from '@app-template/infrastructure/chat'
import { Db } from '@app-template/infrastructure/db'
import { UserPg } from '@app-template/infrastructure/user'
import { recordQueue, type SentJob } from '@app-template/queue/testing'
import { mapIds, PgClientTest, png } from '@app-template/testing'

import { AttachmentService } from '#application/attachment/attachment.service'
import { ChatService } from '#application/chat/chat.service'
import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import {
  AttachmentRepositoryYielding,
  type Interleaving,
  interleaveMessages,
} from '#application/testing/chat.fake'
import { epoch, sentAt } from '#application/testing/chat.fixture'
import { owner, stranger } from '#application/testing/user.fixture'

/** Gives each user a credential of its own, since a credential's hash is a primary key. */
const insertUser = (id: UserId) =>
  Effect.flatMap(UserRepository, (users) =>
    users.insert(
      buildUser({ id, createdAt: epoch }),
      new Credential({ kind: 'secret', hash: SecretHash.make(id.replaceAll('-', '').repeat(2)) }),
    ),
  )

/** `Db` on a fresh test database where `owner` and `stranger` exist, so their rows can refer to them. */
export const DbWithUsers = Layer.effectDiscard(
  Effect.forEach([owner, stranger], insertUser, { discard: true }),
).pipe(
  Layer.provideMerge(UserPg),
  Layer.provideMerge(Db.layer.pipe(Layer.provideMerge(PgClientTest))),
)

/** The S3 attachment store on a bucket of the test's own, over the suite's MiniStack clients. */
export const AttachmentStoreOwnBucket = AttachmentStoreS3.pipe(
  Layer.provideMerge(AwsConfigOwnBucket),
)

export interface ChatHarnessOptions {
  /** Replaces the Postgres chat repository, to fail or script one of its calls. */
  readonly chats?: Layer.Layer<ChatRepository, never, Db>
}

/**
 * The chat services and use cases on a fresh test database and a bucket of their own, over the
 * recording and yielding fakes.
 */
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
        options.chats ?? ChatRepositoryPg,
        messages.layer,
        AttachmentRepositoryYielding,
        AttachmentStoreOwnBucket,
      ),
    ),
    Layer.provideMerge(DbWithUsers),
    Layer.provide(queue.layer),
    Layer.provide(TestCrypto.layer('chat-service').pipe(Layer.provide(BunCrypto.layer))),
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
    const sendMessage = yield* SendMessageUseCase
    const deleteChat = yield* DeleteChatUseCase
    const chat = yield* chats.create(owner)
    yield* body({ chat, sent, interleaving, chats, sendMessage, deleteChat })
  }).pipe(Effect.provide(layer))
}

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
    yield* messages.update(completed)
  })

/** Starts the `TestClock` at `sentAt`, past the fixtures' `epoch`, so a moved `updatedAt` shows. */
export const startClockAtSend = TestClock.setTime(DateTime.toEpochMillis(sentAt))

export const selectChat = (chatId: ChatId) =>
  Effect.flatMap(ChatRepository, (chats) => chats.selectById(chatId))

export const selectMessages = (chatId: ChatId) =>
  Effect.flatMap(MessageRepository, (messages) => messages.selectByChat(chatId))

export const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  Effect.flatMap(AttachmentRepository, (repository) => repository.selectByIds(mapIds(attachments)))
