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
import {
  buildUser,
  Credential,
  SecretHash,
  type UserId,
  UserRepository,
} from '@app-template/domain/user'
import { ChatRepositoryPg } from '@app-template/infrastructure/chat'
import { Db } from '@app-template/infrastructure/db'
import { UserPg } from '@app-template/infrastructure/user'
import { recordQueue, type SentJob } from '@app-template/queue/testing'
import { PgClientTest, png } from '@app-template/testing'

import { AttachmentService } from '#application/attachment/attachment.service'
import { ChatService } from '#application/chat/chat.service'
import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { AttachmentStoreMemory } from '#application/testing/attachment.fake'
import {
  AttachmentRepositoryYielding,
  type Interleaving,
  interleaveMessages,
} from '#application/testing/chat.fake'
import { chat, epoch } from '#application/testing/chat.fixture'
import { owner, stranger } from '#application/testing/user.fixture'

/** Gives each user a credential of its own, since a credential's hash is a primary key. */
const insertUser = (id: UserId) =>
  Effect.flatMap(UserRepository, (users) =>
    users.insert(
      buildUser({ id, createdAt: epoch }),
      new Credential({ kind: 'secret', hash: SecretHash.make(id.replaceAll('-', '').repeat(2)) }),
    ),
  )

/** `Db` on a fresh test database, dropped when the test ends. */
export const DbTest = Db.layer.pipe(Layer.provideMerge(PgClientTest))

/** `DbTest` where `owner` and `stranger` exist, so their rows can refer to them. */
export const DbWithUsers = Layer.effectDiscard(
  Effect.forEach([owner, stranger], insertUser, { discard: true }),
).pipe(Layer.provideMerge(UserPg), Layer.provideMerge(DbTest))

/** The handles of the fakes under `ChatTest`: the jobs sent, and a write armed for the next send. */
export class ChatFakes extends Context.Service<
  ChatFakes,
  { readonly sent: ReadonlyArray<SentJob>; readonly interleaving: Interleaving }
>()('@app-template/application/chat/ChatFakes') {
  static readonly layer = Layer.unwrap(
    Effect.sync(() => {
      const queue = recordQueue()
      const messages = interleaveMessages()
      return Layer.mergeAll(
        queue.layer,
        messages.layer,
        Layer.succeed(ChatFakes, { sent: queue.sent, interleaving: messages.interleaving }),
      )
    }),
  )
}

const insertChat = Layer.effectDiscard(
  Effect.flatMap(ChatRepository, (chats) => chats.insert(chat)),
)

/**
 * The chat services and use cases on a fresh test database where `chat` exists, over the memory
 * attachment store and the recording and yielding fakes; `chats` replaces the Postgres chat
 * repository.
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
      Layer.mergeAll(chats, AttachmentRepositoryYielding, AttachmentStoreMemory, ChatFakes.layer),
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
    yield* messages.update(completed)
  })

export const selectChat = (chatId: ChatId) =>
  Effect.flatMap(ChatRepository, (chats) => chats.selectById(chatId))

export const selectMessages = (chatId: ChatId) =>
  Effect.flatMap(MessageRepository, (messages) => messages.selectByChat(chatId))

export const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  Effect.flatMap(AttachmentRepository, (repository) =>
    repository.selectByIds(Arr.map(attachments, (attachment) => attachment.id)),
  )
