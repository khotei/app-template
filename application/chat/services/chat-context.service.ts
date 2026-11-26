import { Context, Effect, Layer, Option, type Types } from 'effect'

import type { Chat, ChatNotFoundError } from '#chat/domain/chat.model'
import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import type { ContextMessage, Message } from '#chat/domain/message.model'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'

/** The assistant's failures, named through it, as a service imports no part of the kernel. */
type MessageAssistantError = Effect.Error<ReturnType<MessageAssistant['Service']['summarise']>>

/** The chat `chatId` names, of the user `userId` names, so none reads another's context. */
export type ChatContextWhere = Types.Simplify<Pick<Message, 'chatId'> & Pick<Chat, 'userId'>>

/** Reads a chat's context, what its reply sends the model, and cuts one over its limit. */
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
    /**
     * Compacts the context of the chat `where` names, read after the reply that left it over its
     * limit: the messages the cut leaves out are summarised, and the summary is stored with the
     * context's new start. A summary that fails is the assistant's failure, the context left as
     * it was.
     */
    readonly compact: (
      where: ChatContextWhere,
    ) => Effect.Effect<void, ChatNotFoundError | MessageAssistantError>
  }
>()('@app-template/application/chat/services/ChatContextService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService
    const assistant = yield* MessageAssistant

    // The messages a reply of `chat` sends: all of an uncut chat, those from its context's start.
    const getStoredMessages = ({ id, context }: Chat) =>
      messages.getMany({
        chatId: id,
        ...Option.match(context, {
          onNone: () => ({}),
          onSome: ({ startMessageId }) => ({ id: { from: startMessageId } }),
        }),
      })

    const getMessages = Effect.fn('ChatContextService.getMessages')(function* ({
      chatId,
      userId,
    }: ChatContextWhere) {
      const chat = yield* chats.getOne({ id: chatId, userId })
      const stored = yield* getStoredMessages(chat)

      return ChatContextTokenizer.withContext(chat.context, stored)
    })

    const compact = Effect.fn('ChatContextService.compact')(function* ({
      chatId,
      userId,
    }: ChatContextWhere) {
      const chat = yield* chats.getOne({ id: chatId, userId })
      const stored = yield* getStoredMessages(chat)
      const cut = ChatContextTokenizer.cut(stored, assistant.contextTokensLimit)
      if (Option.isNone(cut)) return

      // What is left opens with the summary the context held, so the new one carries it over.
      const { left, startMessageId } = cut.value
      const latestSummary = yield* assistant.summarise(
        ChatContextTokenizer.withContext(chat.context, left),
      )
      yield* chats.update(
        { context: Option.some({ latestSummary, startMessageId }) },
        { id: chatId, userId },
      )
    })

    return { getMessages, compact }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer]),
  )
}
