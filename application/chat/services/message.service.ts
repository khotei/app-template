import { Context, Effect, Layer, type Types } from 'effect'

import { MessageRepository, ServiceWhere, type WhereValue } from '@app-template/kernel/data'
import { RowCodec } from '@app-template/packages/schema'

import { Message, MessageNotFoundError } from '#chat/domain/message.model'

/** A message by id in its chat, of the user `userId` names, so none reads another's. */
export type MessageWhere = Types.Simplify<Pick<Message, 'id' | 'chatId' | 'userId'>>

/** A chat's messages, those `id` names when given: one, a list or a range of ids. */
export type MessageManyWhere = {
  readonly chatId: Message['chatId']
  readonly id?: WhereValue<Message['id']>
}

export class MessageService extends Context.Service<
  MessageService,
  {
    readonly create: (fields: typeof Message.jsonCreate.Type) => Effect.Effect<Message>
    readonly getOne: (where: MessageWhere) => Effect.Effect<Message, MessageNotFoundError>
    /** The chat's messages `where` finds, in creation order. */
    readonly getMany: (where: MessageManyWhere) => Effect.Effect<ReadonlyArray<Message>>
  }
>()('@app-template/application/chat/services/MessageService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageRepository

    const create = Effect.fn('MessageService.create')(function* (
      fields: typeof Message.jsonCreate.Type,
    ) {
      const { set, row } = yield* RowCodec.makeInsert(Message)(fields)

      yield* messages.insert(row)
      return new Message(set)
    })

    const getOne = Effect.fn('MessageService.getOne')(
      (where: MessageWhere) => messages.selectOne(ServiceWhere.encode(where)),
      Effect.flatMap(RowCodec.decodeOne(Message)),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new MessageNotFoundError({ id: where.id })),
        ),
    )

    const getMany = Effect.fn('MessageService.getMany')(
      (where: MessageManyWhere) => messages.selectMany(ServiceWhere.encode(where)),
      Effect.flatMap(RowCodec.decodeMany(Message)),
    )

    return { create, getOne, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
