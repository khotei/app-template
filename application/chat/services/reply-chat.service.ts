import { Array as Arr, type Cause, Context, Effect, Layer, Option, Struct } from 'effect'

import { Transaction } from '@app-template/packages/db'

import { ChatContext } from '#chat/domain/chat-context.model'
import { ChatContextState } from '#chat/domain/chat-context-state'
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
import { ContextChatService } from '#chat/services/context-chat.service'
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
    const contexts = yield* ContextChatService
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
    // it, and a Run another worker settled meanwhile dies on its update, taking the reply and the
    // chat's usage back. A Run's chat is there while the Run is, so a chat not found is a defect.
    const answer = Effect.fnUntraced(function* (started: Run) {
      const chat = { id: started.chatId, userId: started.userId }
      const context = yield* contexts.getOne(chat).pipe(Effect.orDie)
      const generated = yield* assistant.reply(context)
      const message = yield* messages.create({
        ...Struct.pick(started, ['chatId', 'userId']),
        text: generated.text,
        author: 'assistant',
      })
      yield* runs.update(started, yield* RunMove.complete(started, message.id, generated.usage))

      const replied = new ChatContext({
        ...context,
        messages: Arr.append(context.messages, message),
      })
      const next = ChatContextState.findContext(
        replied,
        ChatContextState.tokensSize(generated.usage),
        assistant.contextTokensLimit,
      ).pipe(Option.getOrElse(() => replied))
      yield* contexts.update(chat, { context: next, usage: generated.usage }).pipe(Effect.orDie)
    }, transaction.run)

    // Uninterruptible but for the answer: an interrupt that lands while the Run starts waits for
    // the answer, so the Run it started is always there to fail and never stays `generating`; the
    // answer alone is interruptible, so the worker can still stop during the model's call.
    const reply = Effect.fn('ReplyChatService.reply')(function* (userMessageId: MessageId) {
      const active = yield* runs.getOne({ userMessageId, status: activeRunStatuses })
      // A Run some worker started was left by a worker that died, so it fails as it is read.
      const queued = yield* RunPolicy.ensureUnstarted(active).pipe(
        Effect.onError(failUnanswered(active)),
      )
      const started = yield* runs.update(queued, yield* RunMove.start(queued))

      yield* Effect.interruptible(answer(started)).pipe(Effect.onError(failUnanswered(started)))
    }, Effect.uninterruptible)

    return { reply }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ContextChatService.layer, MessageService.layer, RunService.layer]),
  )
}
