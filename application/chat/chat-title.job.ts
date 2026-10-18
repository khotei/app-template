import { Context, Effect, Layer, Option, Predicate, Result } from 'effect'

import {
  Chat,
  type ChatId,
  ChatRepository,
  isTitledChat,
  type Message,
  MessageRepository,
} from '@app-template/domain/chat'
import {
  chatTitleQueue,
  GenerateChatTitle,
  suggestChatTitle,
} from '@app-template/infrastructure/chat'
import { QueueClient, worker } from '@app-template/queue'

type ChatLookupSkip = 'chatDeleted' | 'alreadyTitled'

type TitleSkip = ChatLookupSkip | 'firstMessageMissing' | 'nothingToTitle'

const titleSkipLogs = {
  chatDeleted: Effect.logInfo('chat title skipped: chat deleted'),
  alreadyTitled: Effect.logInfo('chat title skipped: already titled'),
  firstMessageMissing: Effect.logInfo('chat title skipped: first message missing'),
  nothingToTitle: Effect.logInfo('chat title skipped: nothing to title'),
} as const satisfies Record<TitleSkip, Effect.Effect<void>>

const findUntitledChat = Effect.fnUntraced(function* (chatId: ChatId) {
  const chats = yield* ChatRepository
  return Result.fromOption(
    yield* chats.selectById(chatId),
    (): ChatLookupSkip => 'chatDeleted',
  ).pipe(Result.filterOrFail(Predicate.not(isTitledChat), (): ChatLookupSkip => 'alreadyTitled'))
})

const handle = Effect.fn('ChatTitleJob.handle')(function* (job: GenerateChatTitle) {
  const chats = yield* ChatRepository
  const messages = yield* MessageRepository
  const untitledAtTake = yield* findUntitledChat(job.chatId)
  if (Result.isFailure(untitledAtTake)) return yield* titleSkipLogs[untitledAtTake.failure]
  const first = yield* messages.selectById(job.messageId)
  if (Option.isNone(first)) return yield* titleSkipLogs.firstMessageMissing
  const title = yield* suggestChatTitle(first.value.text)
  if (Option.isNone(title)) return yield* titleSkipLogs.nothingToTitle
  // Re-read right before the write, so a rename made while the model answered wins.
  const untitledBeforeWrite = yield* findUntitledChat(job.chatId)
  if (Result.isFailure(untitledBeforeWrite)) {
    return yield* titleSkipLogs[untitledBeforeWrite.failure]
  }
  yield* chats.update(new Chat({ ...untitledBeforeWrite.success, title }))
})

export class ChatTitleJob extends Context.Service<
  ChatTitleJob,
  {
    /** Queues the title of the chat this first user message opens. */
    readonly enqueue: (first: Message) => Effect.Effect<void>
  }
>()('@app-template/application/chat/ChatTitleJob') {
  static readonly layer = Layer.effect(
    this,
    Effect.map(QueueClient, (client) =>
      this.of({
        enqueue: Effect.fn('ChatTitleJob.enqueue')((first: Message) =>
          client
            .send(
              chatTitleQueue,
              new GenerateChatTitle({ chatId: first.chatId, messageId: first.id }),
            )
            .pipe(Effect.orDie),
        ),
      }),
    ),
  )

  static readonly worker = worker(chatTitleQueue, handle)
}
