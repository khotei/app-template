import { Array as Arr, Cause, Context, DateTime, Effect, Layer, Option, Struct } from 'effect'

import { type Attachment, AttachmentBucket } from '@app-template/domain/attachment'
import {
  Assistant,
  type AssistantTurn,
  type ChatId,
  ChatRepository,
  type ChatStatusInvalidError,
  completeMessage,
  failChat,
  failMessage,
  freeChat,
  generateMessage,
  isActiveMessage,
  type Message,
  type MessageDetail,
  type MessageId,
  MessageRepository,
  type MessageStageInvalidError,
  type MessageWhere,
  prepareMessage,
} from '@app-template/domain/chat'
import type { GenerateAssistantMessage } from '@app-template/infrastructure/chat'
import { Transaction } from '@app-template/infrastructure/db'

type ReplySkip = 'chatDeleted' | 'alreadySettled'

const replySkipLogs = {
  chatDeleted: Effect.logInfo('assistant reply skipped: chat deleted'),
  alreadySettled: Effect.logInfo('assistant reply skipped: already settled'),
} as const satisfies Record<ReplySkip, Effect.Effect<void>>

const skipped = (why: ReplySkip) => Effect.as(replySkipLogs[why], Option.none<Message>())

const isCompletedTurn = ({ message }: MessageDetail) => message.stage === 'completed'

export class GenerateAssistantMessageUseCase extends Context.Service<
  GenerateAssistantMessageUseCase,
  {
    /** Prepares, generates and completes the message with the reply; a settled message is skipped. */
    readonly generate: (
      job: GenerateAssistantMessage,
    ) => Effect.Effect<void, MessageStageInvalidError | ChatStatusInvalidError>
    /**
     * Fails the message while it is active, with `cause` kept out of the user's sight, and
     * answers the failed message; a missing or settled one is logged, skipped and answers none.
     */
    readonly fail: (
      messageId: MessageId,
      cause: Cause.Cause<unknown>,
    ) => Effect.Effect<Option.Option<Message>, MessageStageInvalidError | ChatStatusInvalidError>
  }
>()('@app-template/application/chat/GenerateAssistantMessageUseCase', {
  make: Effect.gen(function* () {
    const assistant = yield* Assistant
    const bucket = yield* AttachmentBucket
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
    const transaction = yield* Transaction

    const readFile = (attachment: Attachment) =>
      bucket.select(attachment.id).pipe(Effect.map(Option.map((bytes) => ({ attachment, bytes }))))

    const readTurn = ({ message, attachments }: MessageDetail) =>
      Effect.forEach(attachments, readFile).pipe(
        Effect.map((files): AssistantTurn => ({ message, files: Arr.getSomes(files) })),
      )

    const readHistory = (chatId: ChatId) =>
      messages
        .selectMany({ chatId: [chatId] })
        .pipe(Effect.map(Arr.filter(isCompletedTurn)), Effect.flatMap(Effect.forEach(readTurn)))

    /** Writes the settled message with its chat's end, `freeChat` or `failChat`, in one transaction. */
    const settleWith = (end: typeof freeChat) =>
      Effect.fnUntraced(function* (settled: Message, where: MessageWhere) {
        yield* messages.update(settled, where)
        // The message's write held, so the foreign key still keeps its chat.
        const chat = yield* chats
          .selectOne({ id: settled.chatId })
          .pipe(Effect.map(Option.getOrThrow))
        const ended = yield* end(chat)
        yield* chats.update({ status: ended.status }, { id: chat.id, status: chat.status })
        return settled
      }, transaction.run)

    const settleCompleted = settleWith(freeChat)

    const settleFailed = settleWith(failChat)

    const reply = Effect.fnUntraced(function* (taken: Message) {
      const preparedAt = yield* DateTime.now
      const prepared = yield* prepareMessage(taken, preparedAt)
      yield* messages.update(prepared, { stage: taken.stage })

      const history = yield* readHistory(prepared.chatId)
      const generatingAt = yield* DateTime.now
      const generating = yield* generateMessage(prepared, generatingAt)
      yield* messages.update(generating, { stage: prepared.stage })

      const { text } = yield* assistant.reply(history)
      const completedAt = yield* DateTime.now
      const completed = yield* completeMessage(generating, { text, at: completedAt })
      yield* settleCompleted(completed, { stage: generating.stage })
    })

    const generate = Effect.fn('GenerateAssistantMessageUseCase.generate')(function* (
      job: GenerateAssistantMessage,
    ) {
      // The cascade takes the message with its chat, so a missing one means a deleted chat.
      const stored = yield* messages
        .selectOne({ id: job.messageId, chatId: job.chatId })
        .pipe(Effect.map(Option.map(Struct.get('message'))))
      if (Option.isNone(stored)) return yield* replySkipLogs.chatDeleted
      if (!isActiveMessage(stored.value)) return yield* replySkipLogs.alreadySettled

      yield* reply(stored.value)
    })

    const fail = Effect.fn('GenerateAssistantMessageUseCase.fail')(function* (
      messageId: MessageId,
      cause: Cause.Cause<unknown>,
    ) {
      const stored = yield* messages
        .selectOne({ id: messageId })
        .pipe(Effect.map(Option.map(Struct.get('message'))))
      if (Option.isNone(stored)) return yield* skipped('chatDeleted')
      if (!isActiveMessage(stored.value)) return yield* skipped('alreadySettled')

      const failedAt = yield* DateTime.now
      const failed = yield* failMessage(stored.value, {
        reason: 'ReplyFailed',
        cause: Cause.pretty(cause),
        at: failedAt,
      })
      return yield* settleFailed(failed, { stage: stored.value.stage }).pipe(Effect.asSome)
    })

    return { generate, fail }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
