import { Array as Arr, Context, Effect, Layer, Option } from 'effect'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import type { ChatId } from '#chat/domain/chat.util'
import { ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'

/** The assistant's failures, named through it, as a service imports no part of the kernel. */
type ChatAssistantError = Effect.Error<ReturnType<ChatAssistant['Service']['proposeTitle']>>

/** Titles an untitled chat from its first message. */
export class TitleChatService extends Context.Service<
  TitleChatService,
  {
    /**
     * Titles the chat `chatId` from its first message while it is untitled; a chat titled or
     * gone fails `ChatNotFoundError`.
     */
    readonly title: (
      chatId: ChatId,
    ) => Effect.Effect<void, ChatNotFoundError | ChatAssistantError, ChatAssistant>
  }
>()('@app-template/application/chat/services/TitleChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService

    const title = Effect.fn('TitleChatService.title')(function* (chatId: ChatId) {
      const assistant = yield* ChatAssistant

      // The job follows its first message's commit, and a message leaves only with its chat, so
      // a chat with none is gone.
      const first = yield* messages
        .getMany({ chatId })
        .pipe(
          Effect.map(Arr.head),
          Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: chatId }))),
        )
      const proposed = yield* assistant.proposeTitle(first.text)

      // Only an untitled chat takes the title, so a rename by the user always wins.
      yield* chats.update({ title: Option.some(proposed) }, { id: chatId, title: Option.none() })
    })

    return { title }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
