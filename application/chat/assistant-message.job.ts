import {
  Array as Arr,
  Cause,
  Context,
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

import { AttachmentRepository, AttachmentStore } from '@app-template/domain/attachment'
import {
  type ChatId,
  ChatRepository,
  completeMessage,
  failMessage,
  generateMessage,
  isActiveMessage,
  Message,
  type MessageId,
  MessageRepository,
  type MessageStageInvalidError,
  prepareMessage,
} from '@app-template/domain/chat'
import {
  assistantMessageQueue,
  buildChatPrompt,
  type ChatTurn,
  GenerateAssistantMessage,
  streamAssistantText,
} from '@app-template/infrastructure/chat'
import { type AttemptInfo, QueueClient, worker } from '@app-template/queue'

import { touchChat } from '#application/chat/touch-chat'

/** How often a streaming reply's accumulated text is written to its message, at most. */
export const SnapshotInterval = Context.Reference<Duration.Duration>(
  '@app-template/application/chat/SnapshotInterval',
  { defaultValue: () => Duration.millis(300) },
)

const readTurn = Effect.fnUntraced(function* (message: Message) {
  const attachments = yield* AttachmentRepository
  const store = yield* AttachmentStore

  const found = yield* attachments.selectByIds(message.attachmentIds)
  const files = yield* Effect.forEach(found, (attachment) =>
    Effect.map(
      store.select(attachment.id),
      Option.map((bytes) => ({ attachment, bytes })),
    ),
  )

  return { message, files: Arr.getSomes(files) } satisfies ChatTurn
})

const readHistory = Effect.fnUntraced(function* (chatId: ChatId) {
  const messages = yield* MessageRepository
  const completed = Arr.filter(
    yield* messages.selectByChat(chatId),
    (message) => message.stage === 'completed',
  )
  return yield* Effect.forEach(completed, readTurn)
})

const streamSnapshots = Effect.fnUntraced(function* <E, R>(
  generating: Message,
  deltas: Stream.Stream<string, E, R>,
) {
  const messages = yield* MessageRepository
  const interval = yield* SnapshotInterval
  const text = yield* Ref.make(generating.text)
  const written = yield* Ref.make(generating.text)

  const snapshot = Effect.gen(function* () {
    const current = yield* Ref.get(text)
    const last = yield* Ref.get(written)
    if (Equal.equals(current, last)) return

    const at = yield* DateTime.now
    yield* messages.update(new Message({ ...generating, text: current, updatedAt: at }))
    yield* Ref.set(written, current)
  })

  yield* Effect.raceFirst(
    Stream.runForEach(deltas, (delta) => Ref.update(text, (accumulated) => accumulated + delta)),
    // A write interrupted mid-flight could land after the final one, so a snapshot runs whole.
    Effect.repeat(Effect.uninterruptible(snapshot), Schedule.spaced(interval)),
  )

  return yield* Ref.get(text)
})

const alreadySettled = Effect.logInfo('assistant reply skipped: already settled')

const chatDeleted = Effect.logInfo('assistant reply skipped: chat deleted')

const writeSettled = Effect.fnUntraced(function* (settled: Message) {
  const chats = yield* ChatRepository
  const messages = yield* MessageRepository
  yield* messages.update(settled)
  yield* touchChat(chats, { chatId: settled.chatId, at: settled.updatedAt })
})

type ReplyError = AiError.AiError | MessageStageInvalidError

type ReplyServices =
  | AttachmentRepository
  | AttachmentStore
  | ChatRepository
  | MessageRepository
  | LanguageModel.LanguageModel

const reply = Effect.fnUntraced(function* (
  taken: Message,
): Effect.fn.Return<void, ReplyError, ReplyServices> {
  const messages = yield* MessageRepository

  // Refused only for a terminal message: the reply was written before this take's lock expired.
  const takenAt = yield* DateTime.now
  const entry = yield* Effect.option(prepareMessage(taken, takenAt))
  if (Option.isNone(entry)) return yield* alreadySettled
  const prepared = entry.value
  yield* messages.update(prepared)

  const history = yield* readHistory(prepared.chatId)
  const generatingAt = yield* DateTime.now
  const generating = yield* generateMessage(prepared, generatingAt)
  yield* messages.update(generating)

  const text = yield* streamSnapshots(generating, streamAssistantText(buildChatPrompt(history)))
  const completedAt = yield* DateTime.now
  const completed = yield* completeMessage(generating, { text, at: completedAt })
  yield* writeSettled(completed)
})

const findReply = Effect.fnUntraced(function* (
  job: GenerateAssistantMessage,
): Effect.fn.Return<Option.Option<Message>, never, ChatRepository | MessageRepository> {
  const chats = yield* ChatRepository
  const messages = yield* MessageRepository

  const chat = yield* chats.selectById(job.chatId)
  if (Option.isNone(chat)) return Option.none()
  return yield* messages.selectById(job.messageId)
})

const failReply = Effect.fnUntraced(function* (
  messageId: MessageId,
  cause: Cause.Cause<unknown>,
): Effect.fn.Return<void, MessageStageInvalidError, ChatRepository | MessageRepository> {
  const messages = yield* MessageRepository

  const stored = yield* messages.selectById(messageId)
  const active = Option.filter(stored, isActiveMessage)
  if (Option.isNone(active)) return

  const failedAt = yield* DateTime.now
  const failed = yield* failMessage(active.value, {
    reason: 'ReplyFailed',
    cause: Cause.pretty(cause),
    at: failedAt,
  })
  yield* writeSettled(failed)
})

const findAndReply = Effect.fnUntraced(function* (
  job: GenerateAssistantMessage,
): Effect.fn.Return<void, ReplyError, ReplyServices> {
  const message = yield* findReply(job)
  if (Option.isNone(message)) return yield* chatDeleted
  yield* reply(message.value)
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

  static readonly worker = worker(assistantMessageQueue, handle)
}
