import { Context, Effect, Layer, Option, type Types } from 'effect'

import type { Chat, ChatNotFoundError } from '#chat/domain/chat.model'
import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import type { Message } from '#chat/domain/message.model'
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
     * The context of the chat `where` names: its messages in creation order, every one of an
     * uncut chat, those from the start its context stores of a cut one, with the latest summary
     * of the messages left out, none for an uncut chat.
     */
    readonly getOne: (where: ChatContextWhere) => Effect.Effect<
      {
        readonly summary: Option.Option<string>
        readonly messages: ReadonlyArray<Message>
      },
      ChatNotFoundError
    >
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

    const getOne = Effect.fn('ChatContextService.getOne')(function* ({
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

      return {
        summary: Option.map(chat.context, ({ latestSummary }) => latestSummary),
        messages: stored,
      }
    })

    const compact = Effect.fn('ChatContextService.compact')(function* (where: ChatContextWhere) {
      const context = yield* getOne(where)
      const cut = ChatContextTokenizer.cut(context.messages, assistant.contextTokensLimit)
      if (Option.isNone(cut)) return

      // The summary the context held goes with what is left, so the new one carries it over.
      const { left, startMessageId } = cut.value
      const latestSummary = yield* assistant.summarise(left, context.summary)
      yield* chats.update(
        { context: Option.some({ latestSummary, startMessageId }) },
        { id: where.chatId, userId: where.userId },
      )
    })

    return { getOne, compact }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer]),
  )
}
