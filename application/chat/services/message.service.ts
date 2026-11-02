import { Context, Effect, Layer, type Types } from 'effect'

import type { UserId } from '@app-template/identity-contract'
import { MessageRepository } from '@app-template/kernel/data'

import { MessageNotFoundError } from '#domain/message.error'
import type { Message } from '#domain/message.model'
import { decodeMessage } from '#services/chat.mapper'

/** The message of the user's chat; one of another user's chat reads as absent. */
export type MessageWhere = Types.Simplify<
  Pick<Message, 'id' | 'chatId'> & { readonly userId: UserId }
>

export class MessageService extends Context.Service<
  MessageService,
  {
    readonly getOne: (where: MessageWhere) => Effect.Effect<Message, MessageNotFoundError>
  }
>()('@app-template/chat/services/MessageService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageRepository

    const getOne = Effect.fn('MessageService.getOne')((where: MessageWhere) =>
      messages
        .selectOne(where)
        .pipe(
          Effect.flatMap(decodeMessage),
          Effect.flatMap(Effect.fromOption(() => new MessageNotFoundError({ id: where.id }))),
        ),
    )

    return { getOne }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
