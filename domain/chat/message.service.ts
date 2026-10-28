import { Context, Crypto, type DateTime, Effect, Layer } from 'effect'

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
  type MessageDetail,
  type MessageFailure,
  prepareMessage,
  snapshotMessage,
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
    /** Writes the text so far, only while the stored message is still `generating`. */
    readonly snapshot: (
      message: Message,
      text: string,
      at: DateTime.Utc,
    ) => Effect.Effect<Message, MessageMovedError>
    readonly complete: (
      message: Message,
      settled: { readonly text: string; readonly at: DateTime.Utc },
    ) => Effect.Effect<Message, MessageStageInvalidError | MessageMovedError>
    readonly fail: (
      message: Message,
      failure: Pick<MessageFailure, 'reason' | 'cause'> & { readonly at: DateTime.Utc },
    ) => Effect.Effect<Message, MessageStageInvalidError | MessageMovedError>
  }
>()('@app-template/domain/chat/MessageService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageRepository
    const crypto = yield* Crypto.Crypto
    const randomMessageId = Effect.map(Effect.orDie(crypto.randomUUIDv7()), MessageId.make)

    const write = Effect.fnUntraced(function* (moved: Message, expected: MessageStage) {
      const written = yield* messages.update(moved, { stage: expected })
      if (!written) return yield* new MessageMovedError({ id: moved.id, expected })
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

      const inserted = yield* messages.insert(message)
      if (!inserted) return yield* new ChatBusyError({ id: sendable.chatId })
      return message
    })

    const prepare = Effect.fn('MessageService.prepare')(function* (
      message: Message,
      at: DateTime.Utc,
    ) {
      const prepared = yield* prepareMessage(message, at)
      return yield* write(prepared, message.stage)
    })

    const generate = Effect.fn('MessageService.generate')(function* (
      message: Message,
      at: DateTime.Utc,
    ) {
      const generating = yield* generateMessage(message, at)
      return yield* write(generating, message.stage)
    })

    const snapshot = Effect.fn('MessageService.snapshot')(
      (message: Message, text: string, at: DateTime.Utc) =>
        write(snapshotMessage(message, text, at), 'generating'),
    )

    const complete = Effect.fn('MessageService.complete')(function* (
      message: Message,
      settled: { readonly text: string; readonly at: DateTime.Utc },
    ) {
      const completed = yield* completeMessage(message, settled)
      return yield* write(completed, message.stage)
    })

    const fail = Effect.fn('MessageService.fail')(function* (
      message: Message,
      failure: Pick<MessageFailure, 'reason' | 'cause'> & { readonly at: DateTime.Utc },
    ) {
      const failed = yield* failMessage(message, failure)
      return yield* write(failed, message.stage)
    })

    return { get, addUserMessage, addAssistantMessage, prepare, generate, snapshot, complete, fail }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
