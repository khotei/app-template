import { Array as Arr, Context, Effect, Layer, Option } from 'effect'

import { Transaction } from '@app-template/packages/db'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import type { ChatId } from '#chat/domain/chat.util'
import type { MessageId } from '#chat/domain/message.util'
import type { ActiveRunNotFoundError, RunStartedError } from '#chat/domain/run.error'
import { ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'
import { MoveRunService } from '#chat/services/move-run.service'

/** Each assistant's failures, named through it, as a service imports no part of the kernel. */
type MessageAssistantError = Effect.Error<ReturnType<MessageAssistant['Service']['reply']>>
type ChatAssistantError = Effect.Error<ReturnType<ChatAssistant['Service']['suggestTitle']>>

/** Replies to what a chat was asked, one job at a time. */
export class ReplyChatService extends Context.Service<
  ReplyChatService,
  {
    /**
     * Replies to the user's message `messageId` through its active Run and settles that Run:
     * `done` with the assistant's message, or `failed` with the full text of what ended it, an
     * interrupt and `RunStartedError`, for a Run some worker started, included. A message with no
     * active Run fails `ActiveRunNotFoundError`, unwritten.
     */
    readonly replyMessage: (
      messageId: MessageId,
    ) => Effect.Effect<
      void,
      ActiveRunNotFoundError | RunStartedError | MessageAssistantError,
      MessageAssistant
    >
    /**
     * Replies with a title from its first message to the chat `chatId` while it is untitled; a
     * chat titled or gone fails `ChatNotFoundError`.
     */
    readonly replyTitle: (
      chatId: ChatId,
    ) => Effect.Effect<void, ChatNotFoundError | ChatAssistantError, ChatAssistant>
  }
>()('@app-template/application/chat/services/ReplyChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService
    const moves = yield* MoveRunService
    const transaction = yield* Transaction

    const replyMessage = Effect.fn('ReplyChatService.replyMessage')(
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
              .fail(messageId, cause)
              .pipe(Effect.catchTag('ActiveRunNotFoundError', () => Effect.void)),
          ),
        ),
    )

    const replyTitle = Effect.fn('ReplyChatService.replyTitle')(function* (chatId: ChatId) {
      const assistant = yield* ChatAssistant

      // The job follows its first message's commit, and a message leaves only with its chat, so
      // a chat with none is gone.
      const first = yield* messages
        .getMany({ chatId })
        .pipe(
          Effect.map(Arr.head),
          Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: chatId }))),
        )
      const title = yield* assistant.suggestTitle(first.text)

      // Only an untitled chat takes the title, so a rename by the user always wins.
      yield* chats.update({ title: Option.some(title) }, { id: chatId, title: Option.none() })
    })

    return { replyMessage, replyTitle }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
