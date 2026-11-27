import { Context, Effect, Layer, Option } from 'effect'

import { ChatNotFoundError } from '#chat/domain/chat.model'
import { ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'
import { ChatService } from '#chat/services/chat.service'
import { MessageService, type MessageWhere } from '#chat/services/message.service'

/** The assistant's failures, named through it, as a service imports no part of the kernel. */
type ChatAssistantError = Effect.Error<ReturnType<ChatAssistant['Service']['proposeTitle']>>

/** Titles an untitled chat from its first message. */
export class TitleChatService extends Context.Service<
  TitleChatService,
  {
    /**
     * Titles the user's chat from its first message, which `where` names by its id, chat and user
     * as the event does, while the chat is untitled; a chat titled or gone, its message with it,
     * fails `ChatNotFoundError`.
     */
    readonly title: (
      where: MessageWhere,
    ) => Effect.Effect<void, ChatNotFoundError | ChatAssistantError>
  }
>()('@app-template/application/chat/services/TitleChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService
    const assistant = yield* ChatAssistant

    const title = Effect.fn('TitleChatService.title')(
      function* (where: MessageWhere) {
        const first = yield* messages.getOne(where)
        const proposed = yield* assistant.proposeTitle(first.text)

        // Only the user's untitled chat takes the title, so a rename by the user always wins.
        yield* chats.update(
          { title: Option.some(proposed) },
          { id: where.chatId, userId: where.userId, title: Option.none() },
        )
      },
      // The event follows its message's commit, and a message leaves only with its chat, so a
      // message gone means its chat is.
      (titled, where) =>
        Effect.catchTag(titled, 'MessageNotFoundError', () =>
          Effect.fail(new ChatNotFoundError({ id: where.chatId })),
        ),
    )

    return { title }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer]),
  )
}
