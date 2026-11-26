import { Context, Effect, Layer, Option, type Types } from 'effect'

import { AtLeast } from '@app-template/kernel/data'

import type { Chat, ChatNotFoundError } from '#chat/domain/chat.model'
import { ChatContext } from '#chat/domain/chat-context.model'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'

/** The chat whose context is read or stored, of the user `userId` names. */
export type ContextWhere = Types.Simplify<Pick<Chat, 'id' | 'userId'>>

/** Where a context starts, which is all of it a chat keeps. */
type ContextStart = Types.Simplify<Pick<ChatContext, 'startMessageId'>>

/** A chat's context: what its reply sends the model, and where the chat keeps it. */
export class ContextChatService extends Context.Service<
  ContextChatService,
  {
    /** The chat's context as its next reply sends it: its messages from the start it holds. */
    readonly getOne: (where: ContextWhere) => Effect.Effect<ChatContext, ChatNotFoundError>
    /** Stores where `context` starts, for the chat's next replies to read from. */
    readonly update: (
      where: ContextWhere,
      context: ContextStart,
    ) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/application/chat/services/ContextChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService

    const getOne = Effect.fn('ContextChatService.getOne')(function* (where: ContextWhere) {
      const chat = yield* chats.getOne(where)
      const startMessageId = Option.map(chat.context, (context) => context.startMessageId)
      const sent = yield* messages.getMany({
        chatId: chat.id,
        ...Option.match(startMessageId, {
          onNone: () => ({}),
          onSome: (id) => ({ id: new AtLeast(id) }),
        }),
      })

      return new ChatContext({ startMessageId, messages: sent })
    })

    const update = Effect.fn('ContextChatService.update')(
      (where: ContextWhere, { startMessageId }: ContextStart) =>
        chats.update(
          { context: Option.map(startMessageId, (id) => ({ startMessageId: id })) },
          where,
        ),
    )

    return { getOne, update }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer]),
  )
}
