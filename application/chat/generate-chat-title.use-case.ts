import { Context, Effect, Layer, Option } from 'effect'

import { Assistant, ChatService, MessageRepository } from '@app-template/domain/chat'
import type { GenerateChatTitle } from '@app-template/infrastructure/chat'

type TitleSkip = 'chatDeleted' | 'deletedOrTitled' | 'nothingToTitle'

const titleSkipLogs = {
  chatDeleted: Effect.logInfo('chat title skipped: chat deleted'),
  deletedOrTitled: Effect.logInfo('chat title skipped: chat deleted or titled'),
  nothingToTitle: Effect.logInfo('chat title skipped: nothing to title'),
} as const satisfies Record<TitleSkip, Effect.Effect<void>>

export class GenerateChatTitleUseCase extends Context.Service<
  GenerateChatTitleUseCase,
  {
    /** Titles the chat its first message opened; a chat gone or titled meanwhile is logged and skipped. */
    readonly generate: (job: GenerateChatTitle) => Effect.Effect<void>
  }
>()('@app-template/application/chat/GenerateChatTitleUseCase', {
  make: Effect.gen(function* () {
    const assistant = yield* Assistant
    const chatService = yield* ChatService
    const messages = yield* MessageRepository

    const generate = Effect.fn('GenerateChatTitleUseCase.generate')(function* (
      job: GenerateChatTitle,
    ) {
      // The cascade takes the first message with its chat, so a missing one means a deleted chat.
      const first = yield* messages.selectOne({ id: job.messageId })
      if (Option.isNone(first)) return yield* titleSkipLogs.chatDeleted

      const title = yield* assistant.suggestTitle(first.value.text)
      if (Option.isNone(title)) return yield* titleSkipLogs.nothingToTitle

      // Only an untitled chat takes the title, so a rename by the user always wins.
      yield* chatService
        .rename({ id: job.chatId, title: Option.none() }, title.value)
        .pipe(Effect.catchTag('ChatNotFoundError', () => titleSkipLogs.deletedOrTitled))
    })

    return { generate }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(ChatService.layer))
}
