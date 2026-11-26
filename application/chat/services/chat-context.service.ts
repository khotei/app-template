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
     * The messages of the context of the chat `where` names, in creation order: every message of
     * an uncut chat, those from the start its context stores of a cut one.
     */
    readonly getMessages: (
      where: ChatContextWhere,
    ) => Effect.Effect<ReadonlyArray<Message>, ChatNotFoundError>
    /** The latest summary of the messages its context leaves out, none for an uncut chat. */
    readonly getSummary: (
      where: ChatContextWhere,
    ) => Effect.Effect<Option.Option<string>, ChatNotFoundError>
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
    const getContextMessages = ({ id, context }: Chat) =>
      messages.getMany({
        chatId: id,
        ...Option.match(context, {
          onNone: () => ({}),
          onSome: ({ startMessageId }) => ({ id: { from: startMessageId } }),
        }),
      })

    const getMessages = Effect.fn('ChatContextService.getMessages')(
      ({ chatId, userId }: ChatContextWhere) => chats.getOne({ id: chatId, userId }),
      Effect.flatMap(getContextMessages),
    )

    const getSummary = Effect.fn('ChatContextService.getSummary')(
      ({ chatId, userId }: ChatContextWhere) => chats.getOne({ id: chatId, userId }),
      Effect.map(({ context }) => Option.map(context, ({ latestSummary }) => latestSummary)),
    )

    const compact = Effect.fn('ChatContextService.compact')(function* ({
      chatId,
      userId,
    }: ChatContextWhere) {
      const chat = yield* chats.getOne({ id: chatId, userId })
      const context = yield* getContextMessages(chat)
      const cut = ChatContextTokenizer.cut(context, assistant.contextTokensLimit)
      if (Option.isNone(cut)) return

      // The summary the context held goes with what is left, so the new one carries it over.
      const { left, startMessageId } = cut.value
      const latestSummary = yield* assistant.summarise(
        left,
        Option.map(chat.context, (held) => held.latestSummary),
      )
      yield* chats.update(
        { context: Option.some({ latestSummary, startMessageId }) },
        { id: chatId, userId },
      )
    })

    return { getMessages, getSummary, compact }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer]),
  )
}
