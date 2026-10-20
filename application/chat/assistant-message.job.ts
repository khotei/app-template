import {
  Array as Arr,
  Cause,
  Context,
  DateTime,
  Duration,
  Effect,
  Equal,
  Layer,
  Option,
  Predicate,
  Ref,
  Schedule,
  Stream,
} from 'effect'

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
  prepareMessage,
} from '@app-template/domain/chat'
import {
  assistantMessageQueue,
  buildChatPrompt,
  type ChatTurn,
  GenerateAssistantMessage,
  replyAttempts,
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
  const text = yield* Ref.make(generating.text)
  const written = yield* Ref.make(generating.text)
  const snapshot = Effect.gen(function* () {
    const current = yield* Ref.get(text)
    if (Equal.equals(current, yield* Ref.get(written))) return
    const at = yield* DateTime.now
    yield* messages.update(new Message({ ...generating, text: current, updatedAt: at }))
    yield* Ref.set(written, current)
  })
  yield* Effect.raceFirst(
    Stream.runForEach(deltas, (delta) => Ref.update(text, (accumulated) => accumulated + delta)),
    // A write interrupted mid-flight could land after the final one, so a snapshot runs whole.
    Effect.repeat(Effect.uninterruptible(snapshot), Schedule.spaced(yield* SnapshotInterval)),
  )
  return yield* Ref.get(text)
})

const alreadySettled = Effect.logInfo('assistant reply skipped: already settled')

const chatDeleted = Effect.logInfo('assistant reply skipped: chat deleted')

const writeSettled = Effect.fnUntraced(function* (settled: Message) {
  const messages = yield* MessageRepository
  yield* messages.update(settled)
  yield* touchChat(settled.chatId, settled.updatedAt)
})

const reply = Effect.fnUntraced(function* (taken: Message) {
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
  const completed = yield* completeMessage(generating, text, completedAt)
  yield* writeSettled(completed)
})

const findReply = Effect.fnUntraced(function* (job: GenerateAssistantMessage) {
  const chats = yield* ChatRepository
  const messages = yield* MessageRepository
  if (Option.isNone(yield* chats.selectById(job.chatId))) return Option.none()
  return yield* messages.selectById(job.messageId)
})

const failReply = Effect.fnUntraced(function* (message: Message, cause: string) {
  const failedAt = yield* DateTime.now
  const failed = yield* failMessage(message, 'ReplyFailed', cause, failedAt)
  yield* writeSettled(failed)
})

// `failStoredReply` re-reads the message: the one found on take has moved on by the time the
// last reply fails.
const failStoredReply = Effect.fnUntraced(function* (messageId: MessageId, cause: string) {
  const messages = yield* MessageRepository
  const active = Option.filter(yield* messages.selectById(messageId), isActiveMessage)
  if (Option.isSome(active)) yield* failReply(active.value, cause)
})

const unsettledCause =
  'The last reply attempt ended without settling the message: its worker stopped or the store failed.'

type AttemptRole = 'reply' | 'lastReply' | 'settle'

// The definition's final attempt only settles a reply the last one left active.
const roleOf = (info: AttemptInfo): AttemptRole => {
  if (info.isLastAttempt) return 'settle'
  return info.attempt === replyAttempts ? 'lastReply' : 'reply'
}

const attemptRoles = {
  reply,
  lastReply: (message: Message) =>
    reply(message).pipe(
      Effect.tapCauseIf(Predicate.not(Cause.hasInterruptsOnly), (cause) =>
        Effect.logError('assistant reply failed', cause),
      ),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : failStoredReply(message.id, Cause.pretty(cause)),
      ),
    ),
  settle: Effect.fnUntraced(function* (message: Message) {
    if (!isActiveMessage(message)) return yield* alreadySettled
    yield* Effect.logError('assistant reply left unsettled by the last reply attempt')
    yield* failReply(message, unsettledCause)
  }),
} as const satisfies Record<
  AttemptRole,
  (message: Message) => Effect.Effect<void, unknown, unknown>
>

const handle = Effect.fn('AssistantMessageJob.handle')(function* (
  job: GenerateAssistantMessage,
  info: AttemptInfo,
) {
  const message = yield* findReply(job)
  if (Option.isNone(message)) return yield* chatDeleted
  return yield* attemptRoles[roleOf(info)](message.value)
})

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

  static readonly worker = worker(assistantMessageQueue, handle)
}
