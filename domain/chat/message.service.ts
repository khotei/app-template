import { Context, Crypto, type DateTime, Effect, Layer, Predicate } from 'effect'

import { ChatBusyError } from '#domain/chat/chat.error'
import { type ChatId, MessageId } from '#domain/chat/chat.id'
import type { SendableChat } from '#domain/chat/chat.service'
import {
  MessageMovedError,
  MessageNotFoundError,
  type MessageStageInvalidError,
} from '#domain/chat/message.error'
import {
  buildAssistantMessage,
  buildUserMessage,
  completeMessage,
  failMessage,
  generateMessage,
  type Message,
  type MessageCompletion,
  type MessageDetail,
  type MessageFailureInput,
  prepareMessage,
} from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import type { MessageStage } from '#domain/chat/message-stage.model'
import type { UserId } from '#domain/user/user.id'

export class MessageService extends Context.Service<
  MessageService,
  {
    readonly get: (
      userId: UserId,
      chatId: ChatId,
      messageId: MessageId,
    ) => Effect.Effect<MessageDetail, MessageNotFoundError>
    readonly addUserMessage: (sendable: SendableChat) => Effect.Effect<Message>
    readonly addAssistantMessage: (sendable: SendableChat) => Effect.Effect<Message, ChatBusyError>
    /** Each stage move writes only while the stored message is still at `message.stage`. */
    readonly prepare: (
      message: Message,
      at: DateTime.Utc,
    ) => Effect.Effect<Message, MessageStageInvalidError | MessageMovedError>
    readonly generate: (
      message: Message,
      at: DateTime.Utc,
    ) => Effect.Effect<Message, MessageStageInvalidError | MessageMovedError>
    readonly complete: (
      message: Message,
      settled: MessageCompletion,
    ) => Effect.Effect<Message, MessageStageInvalidError | MessageMovedError>
    readonly fail: (
      message: Message,
      failure: MessageFailureInput,
    ) => Effect.Effect<Message, MessageStageInvalidError | MessageMovedError>
  }
>()('@app-template/domain/chat/MessageService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageRepository
    const crypto = yield* Crypto.Crypto
    const randomMessageId = crypto.randomUUIDv7().pipe(Effect.orDie, Effect.map(MessageId.make))

    const write = Effect.fnUntraced(function* (moved: Message, expected: MessageStage) {
      yield* messages
        .update(moved, { stage: expected })
        .pipe(
          Effect.filterOrFail(
            Predicate.isTruthy,
            () => new MessageMovedError({ id: moved.id, expected }),
          ),
        )
      return moved
    })

    const get = Effect.fn('MessageService.get')(function* (
      userId: UserId,
      chatId: ChatId,
      messageId: MessageId,
    ) {
      const found = yield* messages.selectDetail({ id: messageId, chatId, userId })
      return yield* Effect.fromOption(found, () => new MessageNotFoundError({ id: messageId }))
    })

    const addUserMessage = Effect.fn('MessageService.addUserMessage')(function* (
      sendable: SendableChat,
    ) {
      const id = yield* randomMessageId
      const message = buildUserMessage({
        id,
        chatId: sendable.chatId,
        text: sendable.input.text,
        createdAt: sendable.at,
      })

      yield* messages.insert(message)
      return message
    })

    const addAssistantMessage = Effect.fn('MessageService.addAssistantMessage')(function* (
      sendable: SendableChat,
    ) {
      const id = yield* randomMessageId
      const message = buildAssistantMessage({
        id,
        chatId: sendable.chatId,
        createdAt: sendable.at,
      })

      yield* messages
        .insert(message)
        .pipe(
          Effect.filterOrFail(Predicate.isTruthy, () => new ChatBusyError({ id: sendable.chatId })),
        )

      return message
    })

    const prepare = Effect.fn('MessageService.prepare')((message: Message, at: DateTime.Utc) =>
      prepareMessage(message, at).pipe(Effect.flatMap((moved) => write(moved, message.stage))),
    )

    const generate = Effect.fn('MessageService.generate')((message: Message, at: DateTime.Utc) =>
      generateMessage(message, at).pipe(Effect.flatMap((moved) => write(moved, message.stage))),
    )

    const complete = Effect.fn('MessageService.complete')(
      (message: Message, settled: MessageCompletion) =>
        completeMessage(message, settled).pipe(
          Effect.flatMap((moved) => write(moved, message.stage)),
        ),
    )

    const fail = Effect.fn('MessageService.fail')(
      (message: Message, failure: MessageFailureInput) =>
        failMessage(message, failure).pipe(Effect.flatMap((moved) => write(moved, message.stage))),
    )

    return { get, addUserMessage, addAssistantMessage, prepare, generate, complete, fail }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
