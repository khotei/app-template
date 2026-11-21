import { Context, Effect, Layer } from 'effect'

import { Transaction } from '@app-template/packages/db'

import type { MessageId } from '#chat/domain/message.util'
import type { ActiveRunNotFoundError, RunStartedError } from '#chat/domain/run.error'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { MessageService } from '#chat/services/message.service'
import { MoveRunService } from '#chat/services/move-run.service'

/** The assistant's failures, named through it, as a service imports no part of the kernel. */
type MessageAssistantError = Effect.Error<ReturnType<MessageAssistant['Service']['reply']>>

/** Replies to a user's message through its active Run. */
export class ReplyChatService extends Context.Service<
  ReplyChatService,
  {
    /**
     * Replies to the user's message `messageId` through its active Run, which ends `done` with the
     * assistant's message, or `failed` with the full text of what ended it, an interrupt and
     * `RunStartedError`, for a Run some worker started, included. A message with no active Run
     * fails `ActiveRunNotFoundError`, unwritten.
     */
    readonly reply: (
      messageId: MessageId,
    ) => Effect.Effect<
      void,
      ActiveRunNotFoundError | RunStartedError | MessageAssistantError,
      MessageAssistant
    >
  }
>()('@app-template/application/chat/services/ReplyChatService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageService
    const moves = yield* MoveRunService
    const transaction = yield* Transaction

    const reply = Effect.fn('ReplyChatService.reply')(
      function* (messageId: MessageId) {
        const assistant = yield* MessageAssistant

        const started = yield* moves.start(messageId)
        const history = yield* messages.getMany({ chatId: started.chatId })
        const generated = yield* assistant.reply(history)
        // The reply first, as the Run names it; a Run another worker settled meanwhile dies on
        // its update, and the transaction takes the reply back.
        yield* messages
          .create({ chatId: started.chatId, text: generated.text, author: 'assistant' })
          .pipe(
            Effect.flatMap((message) => moves.complete(started, message)),
            transaction.run,
          )
      },
      // Any failure fails the message's active Run as it stands, `start`'s included, read again
      // by the message, as the tail never sees the Run the body read; none active has nothing to
      // fail.
      (replied, messageId) =>
        replied.pipe(
          Effect.onError((cause) =>
            moves
              .failActive(messageId, cause)
              .pipe(Effect.catchTag('ActiveRunNotFoundError', () => Effect.void)),
          ),
        ),
    )

    return { reply }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
