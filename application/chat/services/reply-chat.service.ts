import { type Cause, Context, Effect, Layer, Struct, type Types } from 'effect'

import { chatContextConfig } from '@app-template/kernel/config'
import { Transaction } from '@app-template/packages/db'

import { ChatContextPolicy } from '#chat/domain/chat-context-policy'
import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import {
  activeRunStatuses,
  type Run,
  type RunNotFoundError,
  type RunStartedError,
} from '#chat/domain/run.model'
import { RunMove } from '#chat/domain/run-move'
import { RunPolicy } from '#chat/domain/run-policy'
import { type AssistantReply, MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { ContextChatService } from '#chat/services/context-chat.service'
import { MessageService } from '#chat/services/message.service'
import { RunService } from '#chat/services/run.service'

/**
 * The user message a reply answers, by its id, in the chat `chatId` names, of the user `userId`
 * names.
 */
export type ReplyChatWhere = Types.Simplify<Pick<Run, 'userMessageId' | 'chatId' | 'userId'>>

/** The assistant's failures, named through it, as a service imports no part of the kernel that calls out. */
type MessageAssistantError = Effect.Error<ReturnType<MessageAssistant['Service']['reply']>>

/** Replies to a user's message through its active Run. */
export class ReplyChatService extends Context.Service<
  ReplyChatService,
  {
    /**
     * Replies to the user's message `where` names through its active Run, which ends `done`
     * with the assistant's message, its chat's context cut first when the reply passes its limit,
     * or `failed` with the full text of what ended it, no reply stored: a summary that fails, an
     * interrupt and `RunStartedError`, for a Run some worker started, included. A message with no
     * active Run in that chat of that user fails `RunNotFoundError`, unwritten.
     */
    readonly reply: (
      where: ReplyChatWhere,
    ) => Effect.Effect<void, RunNotFoundError | RunStartedError | MessageAssistantError>
  }
>()('@app-template/application/chat/services/ReplyChatService', {
  make: Effect.gen(function* () {
    const contexts = yield* ContextChatService
    const messages = yield* MessageService
    const runs = yield* RunService
    const transaction = yield* Transaction
    const assistant = yield* MessageAssistant
    const { chatContextTokensLimit } = yield* chatContextConfig

    // Fails `run` with what ended its work; a Run settled meanwhile makes that write die.
    const failUnanswered = (run: Run) =>
      Effect.fnUntraced(function* <E>(cause: Cause.Cause<E>) {
        return yield* runs.update(run, yield* RunMove.fail(run, cause))
      })

    // Reads the job's active Run and starts it; a Run some worker started was left by a worker that
    // died, so it fails as it is read.
    const start = Effect.fnUntraced(function* (where: ReplyChatWhere) {
      const active = yield* runs.getOne({ ...where, status: activeRunStatuses })
      const queued = yield* RunPolicy.ensureUnstarted(active).pipe(
        Effect.onError(failUnanswered(active)),
      )

      return yield* runs.update(queued, yield* RunMove.start(queued))
    })

    const answer = Effect.fnUntraced(function* (started: Run) {
      const context = yield* contexts.getMessages(Struct.pick(started, ['chatId', 'userId']))

      return yield* assistant.reply(context)
    })

    // Before the reply is stored: a Run is done only with its chat's context cut.
    const compactOverLimit = (started: Run) =>
      Effect.fnUntraced(function* ({ usage }: AssistantReply) {
        const tokensSize = ChatContextTokenizer.usageTokensSize(usage)
        if (!ChatContextPolicy.isOverLimit(tokensSize, chatContextTokensLimit)) return

        yield* contexts.compact(Struct.pick(started, ['chatId', 'userId']))
      })

    // The reply first, as the Run names it; a Run another worker settled meanwhile dies on its
    // update, and the transaction takes the reply and the cut back.
    const complete = (started: Run) =>
      Effect.fnUntraced(function* ({ text, usage }: AssistantReply) {
        const message = yield* messages.create({
          ...Struct.pick(started, ['chatId', 'userId']),
          text,
          author: 'assistant',
        })
        yield* runs.update(started, yield* RunMove.complete(started, message.id, usage))
      })

    // One transaction, open across the model's calls, holds the answer, its cut and its store: the
    // cut context and the reply are written together or not at all.
    // Uninterruptible but for the answer, its cut and its store: an interrupt that lands while the
    // Run starts waits for them, so the Run it started is always there to fail and never stays
    // `generating`; they are interruptible, so the worker can still stop during the model's calls.
    const reply = Effect.fn('ReplyChatService.reply')(
      function* (where: ReplyChatWhere) {
        const started = yield* start(where)

        yield* answer(started).pipe(
          Effect.tap(compactOverLimit(started)),
          Effect.flatMap(complete(started)),
          transaction.run,
          Effect.interruptible,
          Effect.onError(failUnanswered(started)),
        )
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
    Layer.provide([ContextChatService.layer, MessageService.layer, RunService.layer]),
  )
}
