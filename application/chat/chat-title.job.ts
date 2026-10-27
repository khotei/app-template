import { Context, Effect, Layer, Option } from 'effect'

import { type Message, MessageRepository } from '@app-template/domain/chat'
import {
  chatTitleDeadLetterQueue,
  chatTitleQueue,
  GenerateChatTitle,
  suggestChatTitle,
} from '@app-template/infrastructure/chat'
import { QueueClient, worker } from '@app-template/queue'

import { ChatService } from '#application/chat/chat.service'

type TitleSkip = 'chatDeleted' | 'alreadyTitled' | 'nothingToTitle'

const titleSkipLogs = {
  chatDeleted: Effect.logInfo('chat title skipped: chat deleted'),
  alreadyTitled: Effect.logInfo('chat title skipped: already titled'),
  nothingToTitle: Effect.logInfo('chat title skipped: nothing to title'),
} as const satisfies Record<TitleSkip, Effect.Effect<void>>

const handle = Effect.fn('ChatTitleJob.handle')(function* (job: GenerateChatTitle) {
  const chatService = yield* ChatService
  const messages = yield* MessageRepository

  // The cascade takes the first message with its chat, so a missing one means a deleted chat.
  const first = yield* messages.selectById(job.messageId)
  if (Option.isNone(first)) return yield* titleSkipLogs.chatDeleted

  const title = yield* suggestChatTitle(first.value.text)
  if (Option.isNone(title)) return yield* titleSkipLogs.nothingToTitle

  yield* chatService.updateTitle(job.chatId, title.value).pipe(
    Effect.catchTags({
      ChatNotFoundError: () => titleSkipLogs.chatDeleted,
      ChatTitledError: () => titleSkipLogs.alreadyTitled,
    }),
  )
})

const handleDeadLettered = Effect.fn('ChatTitleJob.handleDeadLettered')(() =>
  Effect.logError('chat title dead-lettered'),
)

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

  static readonly handle = handle

  static readonly worker = worker(chatTitleQueue, handle).pipe(Layer.provide(ChatService.layer))

  static readonly handleDeadLettered = handleDeadLettered

  static readonly deadLetterWorker = worker(chatTitleDeadLetterQueue, handleDeadLettered)
}
