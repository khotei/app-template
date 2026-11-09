import {
  Array as Arr,
  Cause,
  Context,
  Data,
  DateTime,
  Effect,
  Exit,
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
  isStartedReply,
  type Message,
  type MessageFailure,
  type MessageId,
  type MessageStatus,
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
     * with the reason the assistant's error maps to, or with `ReplyFailed` on any other outcome,
     * an interrupt included; a settled message is skipped. A message some run already started
     * is failed unrun, as that run has died.
     */
    readonly generate: (job: GenerateAssistantMessage) => Effect.Effect<void>
  }
>()('@app-template/application/use-cases/chat/GenerateAssistantMessageUseCase', {
  make: Effect.gen(function* () {
    const assistant = yield* Assistant
    const files = yield* FileRepository
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
    const transaction = yield* Transaction

    const logMissingFile = (attachment: Attachment) =>
      Effect.logWarning('attachment skipped: file missing').pipe(
        Effect.annotateLogs({ attachmentId: attachment.id }),
      )

    const readBytes = (attachment: Attachment) =>
      files
        .download({ id: attachment.id })
        .pipe(
          Effect.tap(
            Option.match({ onNone: () => logMissingFile(attachment), onSome: () => Effect.void }),
          ),
          Effect.map(Option.map(({ blob }) => ({ attachment, bytes: blob }))),
        )

    const readHistoryMessage = (message: Message) =>
      Effect.forEach(message.attachments, readBytes).pipe(
        Effect.map((found): HistoryMessage => ({ message, attachments: Arr.getSomes(found) })),
      )

    const readHistory = (reply: Message) =>
      messages
        .selectMany({ chatId: reply.chatId, status: ['done'] })
        .pipe(
          Effect.flatMap(decodeMessages),
          Effect.flatMap(Effect.forEach(readHistoryMessage)),
          Effect.annotateLogs({ chatId: reply.chatId, messageId: reply.id }),
        )

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

      const history = yield* readHistory(prepared)
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

    const fail = Effect.fnUntraced(
      function* (messageId: MessageId, cause: Cause.Cause<unknown>) {
        const active = yield* selectActive(messageId)
        yield* settleFailed(active, { reason: 'ReplyFailed', cause: Cause.pretty(cause) })
      },
      Effect.catchTag('ReplySkipped', ({ why }) => replySkipLogs[why]),
    )

    const answer = Effect.fnUntraced(function* (active: Message) {
      if (isStartedReply(active)) {
        return yield* settleFailed(active, {
          reason: 'ReplyFailed',
          cause: 'the run that started the reply stopped before it ended',
        })
      }
      // An exit handler runs uninterruptibly, so a stopping worker waits for the `failed` write.
      yield* reply(active).pipe(
        Effect.onExit(
          Exit.match({
            onSuccess: () => Effect.void,
            onFailure: (cause) => fail(active.id, cause),
          }),
        ),
      )
    })

    const generate = Effect.fn('GenerateAssistantMessageUseCase.generate')(
      (job: GenerateAssistantMessage) => selectActive(job.messageId).pipe(Effect.flatMap(answer)),
      Effect.catchTag('ReplySkipped', ({ why }) => replySkipLogs[why]),
      // A status the model refused means another run moved the message first and settles it, so
      // the refusal is logged, never returned to the queue.
      Effect.catch((error) =>
        Effect.logWarning('assistant reply ended by a refused status', error),
      ),
    )

    return { generate }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
