import {
  Array as Arr,
  Cause,
  Context,
  Data,
  DateTime,
  Duration,
  Effect,
  Equal,
  Exit,
  Layer,
  Option,
  Ref,
  Schedule,
  Stream,
} from 'effect'
import type { AiError, LanguageModel } from 'effect/ai'

import { AttachmentBucket } from '@app-template/domain/attachment'
import {
  type ChatId,
  ChatRepository,
  ChatService,
  completeMessage,
  failMessage,
  generateMessage,
  isActiveMessage,
  Message,
  type MessageDetail,
  type MessageId,
  MessageRepository,
  type MessageStageInvalidError,
  type MessageStageWhere,
  prepareMessage,
} from '@app-template/domain/chat'
import {
  assistantMessageDeadLetterQueue,
  assistantMessageQueue,
  buildChatPrompt,
  type ChatTurn,
  GenerateAssistantMessage,
  streamAssistantText,
} from '@app-template/infrastructure/chat'
import { type AttemptInfo, QueueClient, worker } from '@app-template/queue'

const snapshotInterval = Duration.millis(300)

const readTurn = Effect.fnUntraced(function* ({ message, attachments }: MessageDetail) {
  const bucket = yield* AttachmentBucket

  const files = yield* Effect.forEach(attachments, (attachment) =>
    Effect.map(
      bucket.select(attachment.id),
      Option.map((bytes) => ({ attachment, bytes })),
    ),
  )

  return { message, files: Arr.getSomes(files) } satisfies ChatTurn
})

const readHistory = Effect.fnUntraced(function* (chatId: ChatId) {
  const messages = yield* MessageRepository
  const stored = yield* messages.selectByChat(chatId)
  const completed = Arr.filter(stored, ({ message }) => message.stage === 'completed')
  return yield* Effect.forEach(completed, readTurn)
})

class MessageStageMovedError extends Data.TaggedError('MessageStageMovedError') {}

const writeStage = Effect.fnUntraced(function* (message: Message, where: MessageStageWhere) {
  const messages = yield* MessageRepository
  const updated = yield* messages.update(message, where)
  if (!updated) return yield* new MessageStageMovedError()
})

const streamSnapshots = Effect.fnUntraced(function* <E, R>(
  generating: Message,
  deltas: Stream.Stream<string, E, R>,
) {
  const text = yield* Ref.make(generating.text)
  const written = yield* Ref.make(generating.text)

  const snapshot = Effect.gen(function* () {
    const current = yield* Ref.get(text)
    const last = yield* Ref.get(written)
    if (Equal.equals(current, last)) return

    const at = yield* DateTime.now
    yield* writeStage(new Message({ ...generating, text: current, updatedAt: at }), {
      stage: generating.stage,
    })
    yield* Ref.set(written, current)
  })

  yield* Effect.raceFirst(
    Stream.runForEach(deltas, (delta) => Ref.update(text, (accumulated) => accumulated + delta)),
    // A write interrupted mid-flight could land after the final one, so a snapshot runs whole.
    Effect.repeat(Effect.uninterruptible(snapshot), Schedule.spaced(snapshotInterval)),
  )

  return yield* Ref.get(text)
})

const alreadySettled = Effect.logInfo('assistant reply skipped: already settled')

const chatDeleted = Effect.logInfo('assistant reply skipped: chat deleted')

const writeSettled = Effect.fnUntraced(function* (settled: Message, where: MessageStageWhere) {
  const chatService = yield* ChatService
  const written = yield* chatService.settleReply(settled, where)
  if (!written) return yield* new MessageStageMovedError()
})

type ReplyError = AiError.AiError | MessageStageInvalidError

type ReplyServices =
  | AttachmentBucket
  | ChatRepository
  | ChatService
  | MessageRepository
  | LanguageModel.LanguageModel

const reply = Effect.fnUntraced(function* (
  taken: Message,
): Effect.fn.Return<void, ReplyError | MessageStageMovedError, ReplyServices> {
  // Refused only for a terminal message: the reply was written before this take's lock expired.
  const takenAt = yield* DateTime.now
  const entry = yield* Effect.option(prepareMessage(taken, takenAt))
  if (Option.isNone(entry)) return yield* alreadySettled
  const prepared = entry.value
  yield* writeStage(prepared, { stage: taken.stage })

  const history = yield* readHistory(prepared.chatId)
  const generatingAt = yield* DateTime.now
  const generating = yield* generateMessage(prepared, generatingAt)
  yield* writeStage(generating, { stage: prepared.stage })

  const text = yield* streamSnapshots(generating, streamAssistantText(buildChatPrompt(history)))
  const completedAt = yield* DateTime.now
  const completed = yield* completeMessage(generating, { text, at: completedAt })
  yield* writeSettled(completed, { stage: generating.stage })
})

const findReply = Effect.fnUntraced(function* (
  job: GenerateAssistantMessage,
): Effect.fn.Return<Option.Option<Message>, never, ChatRepository | MessageRepository> {
  const chats = yield* ChatRepository
  const messages = yield* MessageRepository

  const chat = yield* chats.selectOne({ id: job.chatId })
  if (Option.isNone(chat)) return Option.none()
  return yield* messages.selectOne({ id: job.messageId })
})

const failActive = Effect.fnUntraced(function* (
  active: Message,
  cause: string,
): Effect.fn.Return<void, MessageStageInvalidError, ChatService> {
  const failedAt = yield* DateTime.now
  const failed = yield* failMessage(active, { reason: 'ReplyFailed', cause, at: failedAt })
  const settled = writeSettled(failed, { stage: active.stage })
  yield* Effect.catchTag(settled, 'MessageStageMovedError', () => alreadySettled)
})

const failReply = Effect.fnUntraced(function* (
  messageId: MessageId,
  cause: Cause.Cause<unknown>,
): Effect.fn.Return<void, MessageStageInvalidError, ChatService | MessageRepository> {
  const messages = yield* MessageRepository

  const stored = yield* messages.selectOne({ id: messageId })
  const active = Option.filter(stored, isActiveMessage)
  if (Option.isNone(active)) return

  yield* failActive(active.value, Cause.pretty(cause))
})

const findAndReply = Effect.fnUntraced(function* (
  job: GenerateAssistantMessage,
): Effect.fn.Return<void, ReplyError, ReplyServices> {
  const message = yield* findReply(job)
  if (Option.isNone(message)) return yield* chatDeleted
  const replied = reply(message.value)
  yield* Effect.catchTag(replied, 'MessageStageMovedError', () => alreadySettled)
})

const handle = Effect.fn('AssistantMessageJob.handle')(function* (
  job: GenerateAssistantMessage,
  info: AttemptInfo,
) {
  if (!info.isLastAttempt) return yield* findAndReply(job)
  // An exit handler runs uninterruptibly, so a stopping worker waits for the `failed` write.
  yield* Effect.onExit(findAndReply(job), (exit) =>
    Exit.isSuccess(exit) ? Effect.void : failReply(job.messageId, exit.cause),
  )
})

const handleDeadLettered = Effect.fn('AssistantMessageJob.handleDeadLettered')(function* (
  job: GenerateAssistantMessage,
  info: AttemptInfo,
) {
  const message = yield* findReply(job)
  if (Option.isNone(message)) return yield* chatDeleted
  const active = Option.filter(message, isActiveMessage)
  if (Option.isNone(active)) return yield* alreadySettled

  yield* Effect.logError('assistant reply dead-lettered')
  const cause = `dead-lettered after ${info.attempt} attempts on ${assistantMessageDeadLetterQueue.name}`
  yield* failActive(active.value, cause)
})

/** The last attempt fails the reply on any outcome but success, an interrupt included. */
export class AssistantMessageJob extends Context.Service<
  AssistantMessageJob,
  {
    /** Queues the reply that fills this assistant message. */
    readonly enqueue: (message: Message) => Effect.Effect<void>
  }
>()('@app-template/application/chat/AssistantMessageJob') {
  static readonly layer = Layer.effect(
    this,
    Effect.map(QueueClient, (client) =>
      this.of({
        enqueue: Effect.fn('AssistantMessageJob.enqueue')((message: Message) =>
          client
            .send(
              assistantMessageQueue,
              new GenerateAssistantMessage({ chatId: message.chatId, messageId: message.id }),
            )
            .pipe(Effect.orDie),
        ),
      }),
    ),
  )

  static readonly handle = handle

  static readonly worker = worker(assistantMessageQueue, handle).pipe(
    Layer.provide(ChatService.layer),
  )

  static readonly handleDeadLettered = handleDeadLettered

  static readonly deadLetterWorker = worker(
    assistantMessageDeadLetterQueue,
    handleDeadLettered,
  ).pipe(Layer.provide(ChatService.layer))
}
