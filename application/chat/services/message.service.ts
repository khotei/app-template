import { Context, Effect, Layer, Schema, type Types } from 'effect'

import { MessageRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'

import { MessageNotFoundError } from '#chat/domain/message.error'
import { Message } from '#chat/domain/message.model'

/** A message by id in its chat, of the user `userId` names, so none reads another's. */
export type MessageWhere = Types.Simplify<Pick<Message, 'id' | 'chatId' | 'userId'>>

export class MessageService extends Context.Service<
  MessageService,
  {
    readonly create: (
      fields: Pick<Message, 'chatId' | 'userId' | 'text' | 'author'>,
    ) => Effect.Effect<Message>
    readonly getOne: (where: MessageWhere) => Effect.Effect<Message, MessageNotFoundError>
    /** The chat's messages in creation order. */
    readonly getMany: (
      where: Types.Simplify<Pick<Message, 'chatId'>>,
    ) => Effect.Effect<ReadonlyArray<Message>>
  }
>()('@app-template/application/chat/services/MessageService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageRepository

    const create = Effect.fn('MessageService.create')(function* (
      fields: Pick<Message, 'chatId' | 'userId' | 'text' | 'author'>,
    ) {
      const inserted = yield* Message.insert.makeEffect(fields)
      const row = yield* encodeWith(Message.insert)(inserted)

      yield* messages.insert(row)
      return new Message(inserted)
    }, Effect.orDie)

    const getOne = Effect.fn('MessageService.getOne')(
      ({ id, chatId, userId }: MessageWhere) => messages.selectOne({ id, chatId, userId }),
      Effect.flatMap(decodeWith(Schema.Option(Message))),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new MessageNotFoundError({ id: where.id })),
        ),
    )

    const getMany = Effect.fn('MessageService.getMany')(
      ({ chatId }: Types.Simplify<Pick<Message, 'chatId'>>) => messages.selectMany({ chatId }),
      Effect.flatMap(decodeWith(Schema.Array(Message))),
    )

    return { create, getOne, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
