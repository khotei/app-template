import {
  Array as Arr,
  Cause,
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  String as Str,
  Stream,
} from 'effect'

import { type Attachment, AttachmentBucket } from '@app-template/domain/attachment'
import {
  Assistant,
  type AssistantTurn,
  type ChatId,
  ChatRepository,
  isActiveMessage,
  type Message,
  type MessageDetail,
  type MessageId,
  type MessageMovedError,
  MessageRepository,
  MessageService,
  type MessageStageInvalidError,
} from '@app-template/domain/chat'
import type { GenerateAssistantMessage } from '@app-template/infrastructure/chat'
import { Transaction } from '@app-template/infrastructure/db'

const snapshotInterval = Duration.millis(300)

type ReplySkip = 'chatDeleted' | 'alreadySettled'

const replySkipLogs = {
  chatDeleted: Effect.logInfo('assistant reply skipped: chat deleted'),
  alreadySettled: Effect.logInfo('assistant reply skipped: already settled'),
} as const satisfies Record<ReplySkip, Effect.Effect<void>>

const skipped = (why: ReplySkip) => Effect.as(replySkipLogs[why], Option.none<Message>())

const isCompletedTurn = ({ message }: MessageDetail) => message.stage === 'completed'

/** A terminal write of the reply, through `MessageService`. */
type SettlingWrite = Effect.Effect<Message, MessageStageInvalidError | MessageMovedError>

export class GenerateAssistantMessageUseCase extends Context.Service<
  GenerateAssistantMessageUseCase,
  {
    /** Prepares, generates with snapshots and completes the message; a moved message is skipped. */
    readonly generate: (
      job: GenerateAssistantMessage,
    ) => Effect.Effect<void, MessageStageInvalidError>
    /**
     * Fails the message while it is active, with `cause` kept out of the user's sight, and
     * answers the failed message; a missing or settled one is logged, skipped and answers none.
     */
    readonly fail: (
      messageId: MessageId,
      cause: Cause.Cause<unknown>,
    ) => Effect.Effect<Option.Option<Message>, MessageStageInvalidError>
  }
>()('@app-template/application/chat/GenerateAssistantMessageUseCase', {
  make: Effect.gen(function* () {
    const assistant = yield* Assistant
    const bucket = yield* AttachmentBucket
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
    const messageService = yield* MessageService
    const transaction = yield* Transaction

    const readFile = (attachment: Attachment) =>
      bucket.select(attachment.id).pipe(Effect.map(Option.map((bytes) => ({ attachment, bytes }))))

    const readTurn = ({ message, attachments }: MessageDetail) =>
      Effect.forEach(attachments, readFile).pipe(
        Effect.map((files): AssistantTurn => ({ message, files: Arr.getSomes(files) })),
      )

    const readHistory = (chatId: ChatId) =>
      messages
        .selectByChat(chatId)
        .pipe(Effect.map(Arr.filter(isCompletedTurn)), Effect.flatMap(Effect.forEach(readTurn)))

    const writeSnapshot = Effect.fnUntraced(function* (generating: Message, text: string) {
      const at = yield* DateTime.now
      yield* messageService.snapshot(generating, text, at)
    })

    // Writes the latest text per interval; the stored text seeds the scan, so the first interval
    // opens with the stream.
    const streamReply = (generating: Message, history: ReadonlyArray<AssistantTurn>) =>
      assistant.streamText(history).pipe(
        Stream.scan(() => generating.text, Str.concat),
        Stream.groupedWithin(Number.POSITIVE_INFINITY, snapshotInterval),
        Stream.filter(Arr.isArrayNonEmpty),
        Stream.map(Arr.lastNonEmpty),
        Stream.filter((text) => text !== generating.text),
        Stream.tap((text) => writeSnapshot(generating, text)),
        Stream.runLast,
        Effect.map(Option.getOrElse(() => generating.text)),
      )

    const settle = Effect.fnUntraced(function* (write: SettlingWrite) {
      const settled = yield* write
      // A rule-free write: a chat deleted meanwhile took its messages, so nothing is left to move.
      yield* chats.update({ updatedAt: settled.updatedAt }, { id: settled.chatId })
      return settled
    }, transaction.run)

    const reply = Effect.fnUntraced(function* (taken: Message) {
      const preparedAt = yield* DateTime.now
      const prepared = yield* messageService.prepare(taken, preparedAt)

      const history = yield* readHistory(prepared.chatId)
      const generatingAt = yield* DateTime.now
      const generating = yield* messageService.generate(prepared, generatingAt)

      const text = yield* streamReply(generating, history)
      const completedAt = yield* DateTime.now
      yield* settle(messageService.complete(generating, { text, at: completedAt }))
    })

    const generate = Effect.fn('GenerateAssistantMessageUseCase.generate')(function* (
      job: GenerateAssistantMessage,
    ) {
      // The cascade takes the message with its chat, so a missing one means a deleted chat.
      const stored = yield* messages.selectOne({ id: job.messageId, chatId: job.chatId })
      if (Option.isNone(stored)) return yield* replySkipLogs.chatDeleted
      if (!isActiveMessage(stored.value)) return yield* replySkipLogs.alreadySettled

      yield* reply(stored.value).pipe(
        Effect.catchTag('MessageMovedError', () => replySkipLogs.alreadySettled),
      )
    })

    const fail = Effect.fn('GenerateAssistantMessageUseCase.fail')(function* (
      messageId: MessageId,
      cause: Cause.Cause<unknown>,
    ) {
      const stored = yield* messages.selectOne({ id: messageId })
      if (Option.isNone(stored)) return yield* skipped('chatDeleted')
      if (!isActiveMessage(stored.value)) return yield* skipped('alreadySettled')

      const failedAt = yield* DateTime.now
      const failed = messageService.fail(stored.value, {
        reason: 'ReplyFailed',
        cause: Cause.pretty(cause),
        at: failedAt,
      })
      return yield* settle(failed).pipe(
        Effect.asSome,
        Effect.catchTag('MessageMovedError', () => skipped('alreadySettled')),
      )
    })

    return { generate, fail }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(MessageService.layer))
}
