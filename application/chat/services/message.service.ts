import { Context, Effect, Layer, Schema, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { MessageRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'

import { MessageNotFoundError } from '#chat/domain/message.error'
import { Message, MessageFields } from '#chat/domain/message.model'

/** A message by id in a chat of the user `userId` names, so none reads another's. */
export type MessageWhere = Types.Simplify<
  Pick<Message, 'id'> & { readonly userId: UserId } & Partial<Pick<Message, 'chatId'>>
>

export class MessageService extends Context.Service<
  MessageService,
  {
    readonly create: (fields: Pick<Message, 'chatId' | 'text' | 'author'>) => Effect.Effect<Message>
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
      fields: Pick<Message, 'chatId' | 'text' | 'author'>,
    ) {
      const message = yield* Message.makeEffect(fields)
      const row = yield* encodeWith(MessageFields)(message)

      yield* messages.insert(row)
      return message
    }, Effect.orDie)

    const getOne = Effect.fn('MessageService.getOne')(
      (where: MessageWhere) => messages.selectOne(where),
      Effect.flatMap(decodeWith(Schema.Option(Message))),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new MessageNotFoundError({ id: where.id })),
        ),
    )

    const getMany = Effect.fn('MessageService.getMany')(
      messages.selectMany,
      Effect.flatMap(decodeWith(Schema.Array(Message))),
    )

    return { create, getOne, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
