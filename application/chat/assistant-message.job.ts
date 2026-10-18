import {
  Array as Arr,
  Context,
  DateTime,
  Duration,
  Effect,
  Equal,
  Layer,
  Option,
  Ref,
  Schedule,
  Stream,
} from 'effect'

import { AttachmentRepository, AttachmentStore } from '@app-template/domain/attachment'
import {
  Chat,
  type ChatId,
  ChatRepository,
  completeMessage,
  generateMessage,
  Message,
  MessageRepository,
  prepareMessage,
} from '@app-template/domain/chat'
import {
  assistantMessageQueue,
  buildChatPrompt,
  type ChatTurn,
  GenerateAssistantMessage,
  streamAssistantText,
} from '@app-template/infrastructure/chat'
import { QueueClient, worker } from '@app-template/queue'

/** How often a streaming reply's accumulated text is written to its message, at most. */
export const SnapshotInterval = Context.Reference<Duration.Duration>(
  '@app-template/application/chat/SnapshotInterval',
  { defaultValue: () => Duration.millis(300) },
)

const touchChat = Effect.fnUntraced(function* (chatId: ChatId, at: DateTime.Utc) {
  const chats = yield* ChatRepository
  // Re-read right before the write, so a rename made while the reply streamed survives.
  const chat = yield* chats.selectById(chatId)
  if (Option.isNone(chat)) return
  yield* chats.update(new Chat({ ...chat.value, updatedAt: at }))
})

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

const reply = Effect.fnUntraced(function* (taken: Message) {
  const messages = yield* MessageRepository
  // Refused only for a terminal message: the reply was written before this take's lock expired.
  const entry = yield* Effect.option(prepareMessage(taken, yield* DateTime.now))
  if (Option.isNone(entry)) return yield* alreadySettled
  const prepared = entry.value
  yield* messages.update(prepared)
  const prompt = buildChatPrompt(yield* readHistory(prepared.chatId))
  const generating = yield* generateMessage(prepared, yield* DateTime.now)
  yield* messages.update(generating)
  const text = yield* streamSnapshots(generating, streamAssistantText(prompt))
  const at = yield* DateTime.now
  yield* messages.update(yield* completeMessage(generating, text, at))
  yield* touchChat(prepared.chatId, at)
})

const findReply = Effect.fnUntraced(function* (job: GenerateAssistantMessage) {
  const chats = yield* ChatRepository
  const messages = yield* MessageRepository
  if (Option.isNone(yield* chats.selectById(job.chatId))) return Option.none()
  return yield* messages.selectById(job.messageId)
})

const handle = Effect.fn('AssistantMessageJob.handle')(function* (job: GenerateAssistantMessage) {
  const message = yield* findReply(job)
  if (Option.isNone(message)) return yield* chatDeleted
  yield* reply(message.value)
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
