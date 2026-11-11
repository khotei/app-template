import { Context, Crypto, DateTime, Effect, Layer, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { MessageRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'

import { MessageId } from '#chat/domain/chat.id'
import { MessageNotFoundError } from '#chat/domain/message.error'
import { buildUserMessage, type Message } from '#chat/domain/message.model'
import { decodeMessage, decodeMessages, encodeMessage } from '#chat/services/message.mapper'

/** The message of the user's chat; one of another user's chat reads as absent. */
export type MessageWhere = Types.Simplify<
  Pick<Message, 'id' | 'chatId'> & { readonly userId: UserId }
>

export class MessageService extends Context.Service<
  MessageService,
  {
    /** Stores the user's message as sent, with no attachments: a bind adds them. */
    readonly create: (fields: Pick<Message, 'chatId' | 'text'>) => Effect.Effect<Message>
    readonly getOne: (where: MessageWhere) => Effect.Effect<Message, MessageNotFoundError>
    /** The messages of the user's chat in creation order; none for another user's chat. */
    readonly getMany: (
      where: Types.Simplify<Omit<MessageWhere, 'id'>>,
    ) => Effect.Effect<ReadonlyArray<Message>>
  }
>()('@app-template/application/chat/services/MessageService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageRepository
    const crypto = yield* Crypto.Crypto

    const create = Effect.fn('MessageService.create')(function* (
      fields: Pick<Message, 'chatId' | 'text'>,
    ) {
      const id = yield* generateId(crypto, MessageId.make)
      const createdAt = yield* DateTime.now
      const message = buildUserMessage({ ...fields, id, createdAt })
      const row = yield* encodeMessage(message)

      yield* messages.insert(row)
      return message
    })

    const getOne = Effect.fn('MessageService.getOne')((where: MessageWhere) =>
      messages
        .selectOne(where)
        .pipe(
          Effect.flatMap(decodeMessage),
          Effect.flatMap(Effect.fromOption(() => new MessageNotFoundError({ id: where.id }))),
        ),
    )

    const getMany = Effect.fn('MessageService.getMany')(
      (where: Types.Simplify<Omit<MessageWhere, 'id'>>) =>
        messages.selectMany(where).pipe(Effect.flatMap(decodeMessages)),
    )

    return { create, getOne, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
