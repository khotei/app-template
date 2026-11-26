import { Array as Arr, Cause, Context, Effect, Layer, Option, Struct } from 'effect'

import { Transaction } from '@app-template/packages/db'

import type { Chat } from '#chat/domain/chat.model'
import { ChatContextPolicy } from '#chat/domain/chat-context-policy'
import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import type { Message } from '#chat/domain/message.model'
import type { MessageId } from '#chat/domain/message.util'
import {
  activeRunStatuses,
  type Run,
  type RunNotFoundError,
  type RunStartedError,
} from '#chat/domain/run.model'
import { RunMove } from '#chat/domain/run-move'
import { RunPolicy } from '#chat/domain/run-policy'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'
import { RunService } from '#chat/services/run.service'

/** The assistant's failures, named through it, as a service imports no part of the kernel. */
type MessageAssistantError = Effect.Error<ReturnType<MessageAssistant['Service']['reply']>>

/** Replies to a user's message through its active Run. */
export class ReplyChatService extends Context.Service<
  ReplyChatService,
  {
    /**
     * Replies to the user's message `userMessageId` through its active Run, which ends `done`
     * with the assistant's message, or `failed` with the full text of what ended it, an interrupt
     * and `RunStartedError`, for a Run some worker started, included. A message with no active
     * Run fails `RunNotFoundError`, unwritten.
     */
    readonly reply: (
      userMessageId: MessageId,
    ) => Effect.Effect<void, RunNotFoundError | RunStartedError | MessageAssistantError>
  }
>()('@app-template/application/chat/services/ReplyChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService
    const runs = yield* RunService
    const transaction = yield* Transaction
    const assistant = yield* MessageAssistant

    // Fails `run` with what ended its work; a Run settled meanwhile makes that write die.
    const failUnanswered = (run: Run) =>
      Effect.fnUntraced(function* <E>(cause: Cause.Cause<E>) {
        return yield* runs.update(run, yield* RunMove.fail(run, cause))
      })

    // One transaction, open across the model's call: the reply is written first, as the Run names
    // it, and a Run another worker settled meanwhile dies on its update, taking the reply back.
    const answer = Effect.fnUntraced(function* (started: Run) {
      const chat = yield* chats.getOne({ id: started.chatId, userId: started.userId })
      const history = yield* messages.getMany({
        chatId: chat.id,
        ...Option.match(chat.context, {
          onNone: () => ({}),
          onSome: ({ startMessageId }) => ({ id: { from: startMessageId } }),
        }),
      })
      const generated = yield* assistant.reply(
        ChatContextTokenizer.withContext(chat.context, history),
      )
      const message = yield* messages.create({
        ...Struct.pick(started, ['chatId', 'userId']),
        text: generated.text,
        author: 'assistant',
      })
      yield* runs.update(started, yield* RunMove.complete(started, message.id, generated.usage))

      return {
        chat,
        sent: Arr.append(history, message),
        tokensSize: ChatContextTokenizer.tokensSize(generated.usage),
      }
    }, transaction.run)

    // Cuts a context over its limit, once the reply is committed: the summary's call is long, and
    // one that ends badly must cost no reply. The summary and the context's start are one write, so
    // a summary that fails leaves the context uncut, for the chat's next reply to cut.
    const cutOverLimit = Effect.fnUntraced(
      function* ({
        chat,
        sent,
        tokensSize,
      }: {
        readonly chat: Chat
        readonly sent: ReadonlyArray<Message>
        readonly tokensSize: number
      }) {
        const tokensLimit = assistant.contextTokensLimit
        if (!ChatContextPolicy.isOverLimit(tokensSize, tokensLimit)) return

        const kept = ChatContextTokenizer.compact({ messages: sent, tokensSize }, tokensLimit)
        const left = Arr.dropRight(sent, kept.length)
        const start = Arr.head(kept)
        if (Arr.isReadonlyArrayEmpty(left) || Option.isNone(start)) return

        const latestSummary = yield* assistant.summarise(
          ChatContextTokenizer.withContext(chat.context, left),
        )
        yield* chats.update(
          { context: Option.some({ latestSummary, startMessageId: start.value.id }) },
          { id: chat.id, userId: chat.userId },
        )
      },
      Effect.tapErrorTag('LlmError', (error) =>
        Effect.logWarning('context not cut', Cause.fail(error)),
      ),
      Effect.catchTag('LlmError', () => Effect.void),
    )

    // Uninterruptible but for the answer: an interrupt that lands while the Run starts waits for
    // the answer, so the Run it started is always there to fail and never stays `generating`; the
    // answer is interruptible, so the worker can still stop during the model's call, and so is the
    // cut after it, whose Run is done by then.
    const reply = Effect.fn('ReplyChatService.reply')(
      function* (userMessageId: MessageId) {
        const active = yield* runs.getOne({ userMessageId, status: activeRunStatuses })
        // A Run some worker started was left by a worker that died, so it fails as it is read.
        const queued = yield* RunPolicy.ensureUnstarted(active).pipe(
          Effect.onError(failUnanswered(active)),
        )
        const started = yield* runs.update(queued, yield* RunMove.start(queued))

        const replied = yield* Effect.interruptible(answer(started)).pipe(
          Effect.onError(failUnanswered(started)),
        )

        yield* Effect.interruptible(cutOverLimit(replied))
      },
      // A Run's chat is there while the Run is, so a chat not found is a defect.
      Effect.catchTag('ChatNotFoundError', Effect.die),
      Effect.uninterruptible,
    )

    return { reply }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer, RunService.layer]),
  )
}
