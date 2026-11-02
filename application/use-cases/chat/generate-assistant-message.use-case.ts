import {
  Array as Arr,
  Cause,
  Context,
  Data,
  DateTime,
  Effect,
  flow,
  Layer,
  Option,
  type Types,
} from 'effect'

import {
  Assistant,
  type AssistantReply,
  type Attachment,
  buildReplyFailure,
  type ChatId,
  type ChatStatusInvalidError,
  completeMessage,
  decodeChat,
  decodeMessage,
  decodeMessages,
  encodeMessage,
  failChat,
  failMessage,
  type GenerateAssistantMessage,
  generateMessage,
  type HistoryMessage,
  idleChat,
  isActiveMessage,
  type Message,
  type MessageFailure,
  type MessageId,
  type MessageStatus,
  type MessageStatusInvalidError,
  prepareMessage,
} from '@app-template/application/chat'
import { ChatRepository, FileRepository, MessageRepository } from '@app-template/kernel/data'
import { Transaction } from '@app-template/packages/db'

type ReplySkip = 'chatDeleted' | 'alreadySettled'

const replySkipLogs = {
  chatDeleted: Effect.logInfo('assistant reply skipped: chat deleted'),
  alreadySettled: Effect.logInfo('assistant reply skipped: already settled'),
} as const satisfies Record<ReplySkip, Effect.Effect<void>>

class ReplySkipped extends Data.TaggedError('ReplySkipped')<{ readonly why: ReplySkip }> {}

export class GenerateAssistantMessageUseCase extends Context.Service<
  GenerateAssistantMessageUseCase,
  {
    /**
     * Prepares, generates and completes the message with the reply, or fails it and its chat
     * with the reason the assistant's error maps to; a settled message is skipped.
     */
    readonly generate: (
      job: GenerateAssistantMessage,
    ) => Effect.Effect<void, MessageStatusInvalidError | ChatStatusInvalidError>
    /**
     * Fails the message while it is active, with `cause` kept out of the user's sight, and
     * answers the failed message; a missing or settled one is logged, skipped and answers none.
     */
    readonly fail: (
      messageId: MessageId,
      cause: Cause.Cause<unknown>,
    ) => Effect.Effect<Option.Option<Message>, MessageStatusInvalidError | ChatStatusInvalidError>
  }
>()('@app-template/application/use-cases/chat/GenerateAssistantMessageUseCase', {
  make: Effect.gen(function* () {
    const assistant = yield* Assistant
    const files = yield* FileRepository
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
    const transaction = yield* Transaction

    const readBytes = (attachment: Attachment) =>
      files
        .selectOne({ id: attachment.id })
        .pipe(Effect.map(Option.map((bytes) => ({ attachment, bytes }))))

    const readHistoryMessage = (message: Message) =>
      Effect.forEach(message.attachments, readBytes).pipe(
        Effect.map((found): HistoryMessage => ({ message, attachments: Arr.getSomes(found) })),
      )

    const readHistory = (chatId: ChatId) =>
      messages
        .selectMany({ chatId, status: ['done'] })
        .pipe(Effect.flatMap(decodeMessages), Effect.flatMap(Effect.forEach(readHistoryMessage)))

    const updateMessage = (message: Message, from: MessageStatus) =>
      encodeMessage(message).pipe(
        Effect.flatMap((row) => messages.update(row, { id: message.id, status: [from] })),
      )

    /** Writes the settled message with its chat's end, `idleChat` or `failChat`, in one transaction. */
    const settleWith = (end: typeof idleChat) =>
      Effect.fnUntraced(function* (settled: Message, from: MessageStatus) {
        yield* updateMessage(settled, from)
        // The message's write held, so the foreign key still keeps its chat.
        const chat = yield* chats
          .selectOne({ id: settled.chatId })
          .pipe(Effect.flatMap(decodeChat), Effect.flatMap(flow(Effect.fromOption, Effect.orDie)))
        const ended = yield* end(chat)
        yield* chats.update({ status: ended.status }, { id: chat.id, status: chat.status })
        return settled
      }, transaction.run)

    const settleCompleted = Effect.fnUntraced(function* (
      generating: Message,
      { text }: AssistantReply,
    ) {
      const completedAt = yield* DateTime.now
      const completed = yield* completeMessage(generating, { text, at: completedAt })
      return yield* settleWith(idleChat)(completed, generating.status)
    })

    const settleFailed = Effect.fnUntraced(function* (
      active: Message,
      { reason, cause }: Types.Simplify<Pick<MessageFailure, 'reason' | 'cause'>>,
    ) {
      const failedAt = yield* DateTime.now
      const failed = yield* failMessage(active, { reason, cause, at: failedAt })
      return yield* settleWith(failChat)(failed, active.status)
    })

    const reply = Effect.fnUntraced(function* (taken: Message) {
      const preparedAt = yield* DateTime.now
      const prepared = yield* prepareMessage(taken, preparedAt)
      yield* updateMessage(prepared, taken.status)

      const history = yield* readHistory(prepared.chatId)
      const generatingAt = yield* DateTime.now
      const generating = yield* generateMessage(prepared, generatingAt)
      yield* updateMessage(generating, prepared.status)

      yield* assistant.reply(history).pipe(
        Effect.matchEffect({
          onSuccess: (answer) => settleCompleted(generating, answer),
          onFailure: (error) => settleFailed(generating, buildReplyFailure(error)),
        }),
      )
    })

    // The cascade takes the message with its chat, so a missing one means a deleted chat.
    const selectActive = (id: MessageId) =>
      messages.selectOne({ id }).pipe(
        Effect.flatMap(decodeMessage),
        Effect.flatMap(Effect.fromOption(() => new ReplySkipped({ why: 'chatDeleted' }))),
        Effect.filterOrFail(isActiveMessage, () => new ReplySkipped({ why: 'alreadySettled' })),
      )

    const generate = Effect.fn('GenerateAssistantMessageUseCase.generate')(
      (job: GenerateAssistantMessage) => selectActive(job.messageId).pipe(Effect.flatMap(reply)),
      Effect.catchTag('ReplySkipped', ({ why }) => replySkipLogs[why]),
    )

    const fail = Effect.fn('GenerateAssistantMessageUseCase.fail')(
      function* (messageId: MessageId, cause: Cause.Cause<unknown>) {
        const active = yield* selectActive(messageId)
        return yield* settleFailed(active, {
          reason: 'ReplyFailed',
          cause: Cause.pretty(cause),
        }).pipe(Effect.asSome)
      },
      Effect.catchTag('ReplySkipped', ({ why }) =>
        replySkipLogs[why].pipe(Effect.as(Option.none<Message>())),
      ),
    )

    return { generate, fail }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
