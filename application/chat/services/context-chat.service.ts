import { Array as Arr, Context, Effect, identity, Layer, Option, type Types } from 'effect'

import { chatContextConfig } from '@app-template/kernel/config'

import type { Chat, ChatNotFoundError } from '#chat/domain/chat.model'
import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import type { ContextMessage, Message } from '#chat/domain/message.model'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'

/** The assistant's failures, named through it, as a service imports no part of the kernel that calls out. */
type MessageAssistantError = Effect.Error<ReturnType<MessageAssistant['Service']['summarise']>>

/** The chat `chatId` names, of the user `userId` names, so none reads another's context. */
export type ContextChatWhere = Types.Simplify<Pick<Message, 'chatId'> & Pick<Chat, 'userId'>>

/** Reads a chat's context, what its reply sends the model, and cuts one over its limit. */
export class ContextChatService extends Context.Service<
  ContextChatService,
  {
    /**
     * The context of the chat `where` names, as a reply sends it: every message of an uncut
     * chat; of a compacted one, those from the head its context stores, opened by a message that
     * holds what it compacted.
     */
    readonly getMessages: (
      where: ContextChatWhere,
    ) => Effect.Effect<ReadonlyArray<Message | ContextMessage>, ChatNotFoundError>
    /**
     * Compacts the context of the chat `where` names, whatever its size: the messages its split
     * drops are summarised, those that remain when it drops none, and the summary is stored with
     * the context's new head. A summary that fails is the assistant's failure, the context left
     * as it was.
     */
    readonly compact: (
      where: ContextChatWhere,
    ) => Effect.Effect<void, ChatNotFoundError | MessageAssistantError>
  }
>()('@app-template/application/chat/services/ContextChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService
    const assistant = yield* MessageAssistant
    const { chatContextTokensLimit } = yield* chatContextConfig

    // The messages a reply of `chat` sends: all of an uncompacted chat, those from its context's head.
    const getMessagesInContext = ({ id, context }: Chat) =>
      messages.getMany({
        chatId: id,
        ...Option.match(context, {
          onNone: () => ({}),
          onSome: ({ headMessageId }) => ({ id: { from: headMessageId } }),
        }),
      })

    const getMessages = Effect.fn('ContextChatService.getMessages')(function* ({
      chatId,
      userId,
    }: ContextChatWhere) {
      const chat = yield* chats.getOne({ id: chatId, userId })
      const stored = yield* getMessagesInContext(chat)

      return ChatContextTokenizer.withContext(chat.context, stored)
    })

    const compact = Effect.fn('ContextChatService.compact')(function* ({
      chatId,
      userId,
    }: ContextChatWhere) {
      const chat = yield* chats.getOne({ id: chatId, userId })
      const contextMessages = yield* getMessagesInContext(chat)
      const { dropped, remain } = ChatContextTokenizer.splitToCompact(
        contextMessages,
        chatContextTokensLimit,
      )
      if (!Arr.isReadonlyArrayNonEmpty(remain)) return

      // Nothing dropped: what remains is compacted, so a compaction asked for always writes one.
      const toCompact = Arr.match(dropped, { onEmpty: () => remain, onNonEmpty: identity })
      // Opened by what the context held compacted, so the new summary carries it over.
      const compacted = yield* assistant.summarise(
        ChatContextTokenizer.withContext(chat.context, toCompact),
      )
      yield* chats.update(
        { context: Option.some({ compacted, headMessageId: Arr.headNonEmpty(remain).id }) },
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
