import { Cause, Context, Effect, Layer, Option, type Types } from 'effect'

import type { Chat, ChatNotFoundError } from '#chat/domain/chat.model'
import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import type { ContextMessage, Message } from '#chat/domain/message.model'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'

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
     * Cuts the context of the chat `where` names, read after the reply that left it over its
     * limit: the messages the cut leaves out are summarised, and the summary is stored with the
     * context's new start. A summary that fails leaves the context as it was, with a warning,
     * for the chat's next reply.
     */
    readonly update: (where: ChatContextWhere) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/application/chat/services/ChatContextService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService
    const assistant = yield* MessageAssistant

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

    const update = Effect.fn('ChatContextService.update')(
      function* (where: ChatContextWhere) {
        const context = yield* getMessages(where)
        const cut = ChatContextTokenizer.cut(context, assistant.contextTokensLimit)
        if (Option.isNone(cut)) return

        // What is left opens with the summary the context held, so the new one carries it over.
        const { left, startMessageId } = cut.value
        const latestSummary = yield* assistant.summarise(left)
        yield* chats.update(
          { context: Option.some({ latestSummary, startMessageId }) },
          { id: where.chatId, userId: where.userId },
        )
      },
      Effect.tapErrorTag('LlmError', (error) =>
        Effect.logWarning('context not cut', Cause.fail(error)),
      ),
      Effect.catchTag('LlmError', () => Effect.void),
    )

    return { getMessages, update }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer]),
  )
}
