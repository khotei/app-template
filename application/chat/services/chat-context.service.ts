import { Context, Effect, Layer, Option, type Types } from 'effect'

import type { Chat, ChatNotFoundError } from '#chat/domain/chat.model'
import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import type { ContextMessage, Message } from '#chat/domain/message.model'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'

/** The chat `chatId` names, of the user `userId` names, so none reads another's context. */
export type ChatContextWhere = Types.Simplify<Pick<Message, 'chatId'> & Pick<Chat, 'userId'>>

/** Reads a chat's context, what its reply sends the model. */
export class ChatContextService extends Context.Service<
  ChatContextService,
  {
    /**
     * The context of the chat `where` names, as a reply sends it: every message of an uncut
     * chat; of a cut one, those from the start its context stores, opened by a message that holds
     * its latest summary.
     */
    readonly getMessages: (
      where: ChatContextWhere,
    ) => Effect.Effect<ReadonlyArray<Message | ContextMessage>, ChatNotFoundError>
  }
>()('@app-template/application/chat/services/ChatContextService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService

    const getMessages = Effect.fn('ChatContextService.getMessages')(function* ({
      chatId,
      userId,
    }: ChatContextWhere) {
      const chat = yield* chats.getOne({ id: chatId, userId })

      const stored = yield* messages.getMany({
        chatId: chat.id,
        ...Option.match(chat.context, {
          onNone: () => ({}),
          onSome: ({ startMessageId }) => ({ id: { from: startMessageId } }),
        }),
      })

      return ChatContextTokenizer.withContext(chat.context, stored)
    })

    return { getMessages }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer]),
  )
}
