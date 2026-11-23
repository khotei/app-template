import { Context, Effect, Layer, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'

import { MessageNotFoundError } from '#chat/domain/message.error'
import { Message } from '#chat/domain/message.model'
import { MessageRepository } from '#chat/services/message.repository'

/** A message by id; `userId` limits it to the user's chats, which every api caller passes. */
export type MessageWhere = Types.Simplify<
  Pick<Message, 'id'> & Partial<Pick<Message, 'chatId'> & { readonly userId: UserId }>
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
      const row = yield* Message.insert.makeEffect(fields)

      yield* messages.insert(row)
      return new Message(row)
    }, Effect.orDie)

    const getOne = Effect.fn('MessageService.getOne')(
      (where: MessageWhere) => messages.selectOne(where),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new MessageNotFoundError({ id: where.id })),
        ),
    )

    const getMany = Effect.fn('MessageService.getMany')(messages.selectMany)

    return { create, getOne, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
