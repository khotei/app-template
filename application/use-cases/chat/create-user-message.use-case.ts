import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  pipe,
  Struct,
} from 'effect'

import {
  type AttachmentBoundError,
  AttachmentId,
  type AttachmentNotFoundError,
  assistantMessageQueue,
  bindAttachment,
  buildRun,
  buildUserMessage,
  type ChatBusyError,
  type ChatId,
  type ChatNotFoundError,
  ChatService,
  CurrentReplyProvenance,
  chatTitleQueue,
  encodeMessage,
  encodeRun,
  ensureAllStored,
  ensureChatNotBusy,
  ensureMessageInput,
  GenerateAssistantMessage,
  GenerateChatTitle,
  LiveAttachmentService,
  Message,
  MessageId,
  type MessageInput,
  type MessageInputInvalidError,
  type Run,
  RunId,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'
import {
  AttachmentRepository,
  FileRepository,
  MessageRepository,
  RunRepository,
} from '@app-template/kernel/data'
import { generateId, Transaction } from '@app-template/packages/db'
import { QueueSender } from '@app-template/packages/queue'

export class CreateUserMessageUseCase extends Context.Service<
  CreateUserMessageUseCase,
  {
    /**
     * Stores the user's message with its attachments bound and the queued Run that answers it,
     * then sends its jobs; a send SQS refuses dies, leaving the Run queued.
     */
    readonly create: (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) => Effect.Effect<
      Run,
      | MessageInputInvalidError
      | ChatNotFoundError
      | ChatBusyError
      | AttachmentNotFoundError
      | AttachmentBoundError
    >
  }
>()('@app-template/application/use-cases/chat/CreateUserMessageUseCase', {
  make: Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const files = yield* FileRepository
    const chatService = yield* ChatService
    const messages = yield* MessageRepository
    const runs = yield* RunRepository
    const liveAttachments = yield* LiveAttachmentService
    const queue = yield* QueueSender
    const transaction = yield* Transaction
    const crypto = yield* Crypto.Crypto
    const provenance = yield* CurrentReplyProvenance

    const store = Effect.fnUntraced(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      const chat = yield* chatService.getOne({ id: chatId, userId })
      yield* ensureMessageInput(input)
      yield* ensureChatNotBusy(chat)
      const live = yield* liveAttachments.getMany({ id: input.attachmentIds, userId })
      const storedIds = yield* files
        .selectMany({ id: Arr.map(live, Struct.get('id')) })
        .pipe(Effect.map(Arr.map((file) => AttachmentId.make(file.id))))
      const requested = yield* pipe(live, ensureAllStored(input.attachmentIds, storedIds))
      const isFirstMessage = yield* messages.selectOne({ chatId }).pipe(Effect.map(Option.isNone))
      const at = yield* DateTime.now
      const userMessageId = yield* generateId(crypto, MessageId.make)
      const userMessage = buildUserMessage({
        id: userMessageId,
        chatId,
        text: input.text,
        createdAt: at,
      })
      const bound = yield* Effect.forEach(requested, (attachment) =>
        bindAttachment(attachment, userMessage),
      )

      yield* encodeMessage(userMessage).pipe(Effect.flatMap(messages.insert))
      // The bind follows the insert, since its key to the message is not deferrable; a create
      // without files skips it, as the update would die on no rows.
      if (Arr.isReadonlyArrayNonEmpty(bound)) {
        const ids = Arr.map(bound, Struct.get('id'))
        // The files first: unbound bytes expire, so a crash must never leave a bound row over them.
        yield* files.update({ bound: true }, { id: ids })
        // `messageId: null` is the race's guard: a create that bound any of them since the read
        // leaves this write short of a row it names, so it dies and the create rolls back whole.
        yield* attachments.update(
          { messageId: userMessage.id, chatId },
          { id: ids, userId, messageId: null },
        )
      }
      const sent = new Message({ ...userMessage, attachments: bound })
      const runId = yield* generateId(crypto, RunId.make)
      const run = buildRun({ id: runId, chatId, userMessage: sent, provenance, createdAt: at })
      // A concurrent create that started a Run after the read leaves this insert short of its row
      // by the index on the active Run, so it dies: a lost race, rolled back whole.
      yield* encodeRun(run).pipe(Effect.flatMap(runs.insert))

      return { run, isFirstMessage }
    }, transaction.run)

    const create = Effect.fn('CreateUserMessageUseCase.create')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      const stored = yield* store(userId, chatId, input)
      yield* queue
        .send(assistantMessageQueue, new GenerateAssistantMessage({ chatId, runId: stored.run.id }))
        .pipe(Effect.orDie)
      if (stored.isFirstMessage) {
        yield* queue
          .send(
            chatTitleQueue,
            new GenerateChatTitle({ chatId, messageId: stored.run.userMessageId }),
          )
          .pipe(Effect.orDie)
      }

      return stored.run
    })

    return { create }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([ChatService.layer, LiveAttachmentService.layer]),
  )
}
