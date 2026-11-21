import { Context, DateTime, Effect, Layer, Schema, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { MessageRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith, idGenerator } from '@app-template/packages/schema'

import { MessageNotFoundError } from '#chat/domain/message.error'
import { Message, MessageFields } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'

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
    const generateId = yield* idGenerator

    const create = Effect.fn('MessageService.create')(function* (
      fields: Pick<Message, 'chatId' | 'text' | 'author'>,
    ) {
      const id = yield* generateId(MessageId)
      const createdAt = yield* DateTime.now
      const message = new Message({ ...fields, id, createdAt })
      const row = yield* encodeWith(MessageFields)(message)

      yield* messages.insert(row)
      return message
    })

    const getOne = Effect.fn('MessageService.getOne')((where: MessageWhere) =>
      messages
        .selectOne(where)
        .pipe(
          Effect.flatMap(decodeWith(Schema.Option(Message))),
          Effect.flatMap(Effect.fromOption(() => new MessageNotFoundError({ id: where.id }))),
        ),
    )

    const getMany = Effect.fn('MessageService.getMany')(
      (where: Types.Simplify<Pick<Message, 'chatId'>>) =>
        messages.selectMany(where).pipe(Effect.flatMap(decodeWith(Schema.Array(Message)))),
    )

    return { create, getOne, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
