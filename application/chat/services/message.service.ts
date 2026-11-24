import { Context, Effect, Layer, Schema, type Types } from 'effect'

import { encodeWhere, MessageRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'

import { MessageNotFoundError } from '#chat/domain/message.error'
import { Message } from '#chat/domain/message.model'

export type MessageCreate = Types.Simplify<Pick<Message, 'chatId' | 'userId' | 'text' | 'author'>>

/** A message by id in its chat, of the user `userId` names, so none reads another's. */
export type MessageGetOne = Types.Simplify<Pick<Message, 'id' | 'chatId' | 'userId'>>

export type MessageGetMany = Types.Simplify<Pick<Message, 'chatId'>>

export class MessageService extends Context.Service<
  MessageService,
  {
    readonly create: (fields: MessageCreate) => Effect.Effect<Message>
    readonly getOne: (where: MessageGetOne) => Effect.Effect<Message, MessageNotFoundError>
    /** The chat's messages in creation order. */
    readonly getMany: (where: MessageGetMany) => Effect.Effect<ReadonlyArray<Message>>
  }
>()('@app-template/application/chat/services/MessageService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageRepository

    const create = Effect.fn('MessageService.create')(function* (fields: MessageCreate) {
      const inserted = yield* Message.insert.makeEffect(fields)
      const row = yield* encodeWith(Message.insert)(inserted)

      yield* messages.insert(row)
      return new Message(inserted)
    }, Effect.orDie)

    const getOne = Effect.fn('MessageService.getOne')(
      (where: MessageGetOne) => messages.selectOne(encodeWhere(where)),
      Effect.flatMap(decodeWith(Schema.Option(Message))),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new MessageNotFoundError({ id: where.id })),
        ),
    )

    const getMany = Effect.fn('MessageService.getMany')(
      (where: MessageGetMany) => messages.selectMany(encodeWhere(where)),
      Effect.flatMap(decodeWith(Schema.Array(Message))),
    )

    return { create, getOne, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
