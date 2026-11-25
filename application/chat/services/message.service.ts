import { Context, Effect, Layer, type Types } from 'effect'

import { encodeWhere, MessageRepository } from '@app-template/kernel/data'

import { MessageNotFoundError } from '#chat/domain/message.error'
import { Message } from '#chat/domain/message.model'

/** A message by id in its chat, of the user `userId` names, so none reads another's. */
export type MessageWhere = Types.Simplify<Pick<Message, 'id' | 'chatId' | 'userId'>>

export class MessageService extends Context.Service<
  MessageService,
  {
    readonly create: (fields: typeof Message.jsonCreate.Type) => Effect.Effect<Message>
    readonly getOne: (where: MessageWhere) => Effect.Effect<Message, MessageNotFoundError>
    /** The chat's messages in creation order. */
    readonly getMany: (
      where: Types.Simplify<Pick<MessageWhere, 'chatId'>>,
    ) => Effect.Effect<ReadonlyArray<Message>>
  }
>()('@app-template/application/chat/services/MessageService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageRepository

    const create = Effect.fn('MessageService.create')(function* (
      fields: typeof Message.jsonCreate.Type,
    ) {
      const { set, row } = yield* Message.makeInsert(fields)

      yield* messages.insert(row)
      return new Message(set)
    }, Effect.orDie)

    const getOne = Effect.fn('MessageService.getOne')(
      (where: MessageWhere) => messages.selectOne(encodeWhere(where)),
      Effect.flatMap(Message.decodeOne),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new MessageNotFoundError({ id: where.id })),
        ),
    )

    const getMany = Effect.fn('MessageService.getMany')(
      (where: Types.Simplify<Pick<MessageWhere, 'chatId'>>) =>
        messages.selectMany(encodeWhere(where)),
      Effect.flatMap(Message.decodeMany),
    )

    return { create, getOne, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
