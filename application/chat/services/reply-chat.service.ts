import { Array as Arr, Cause, Context, Effect, Layer, Option, Struct } from 'effect'

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
import { ContextChatService, type ContextWhere } from '#chat/services/context-chat.service'
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
    // it, and a Run another worker settled meanwhile dies on its update, taking the reply back.
    const answer = Effect.fnUntraced(function* (started: Run, chat: ContextWhere) {
      const context = yield* contexts.getOne(chat)
      const generated = yield* assistant.reply(context)
      const message = yield* messages.create({
        ...Struct.pick(started, ['chatId', 'userId']),
        text: generated.text,
        author: 'assistant',
      })
      yield* runs.update(started, yield* RunMove.complete(started, message.id, generated.usage))

      return {
        context: new ChatContext({ ...context, messages: Arr.append(context.messages, message) }),
        tokensSize: ChatContextState.tokensSize(generated.usage),
      }
    }, transaction.run)

    // Cuts a context past its share of the limit, once the reply is committed: the summary's call
    // is long, and one that ends badly must cost no reply. The start and the summary are one write.
    const cutOversized = Effect.fnUntraced(function* (
      chat: ContextWhere,
      { context, tokensSize }: { readonly context: ChatContext; readonly tokensSize: number },
    ) {
      const tokensLimit = assistant.contextTokensLimit
      if (!ChatContextState.isOversized(tokensSize, tokensLimit)) return

      const cut = ChatContextState.cut(context, { tokensSize, tokensLimit })
      const left = ChatContextState.leftOut(context, cut)
      if (Arr.isReadonlyArrayEmpty(left.messages)) return

      // A summary that fails never holds the cut back: a context never cut outgrows its model.
      const summary = yield* assistant.summarise(left).pipe(
        Effect.map(Option.some),
        Effect.tapError((error) =>
          Effect.logWarning('context cut with no new summary', Cause.fail(error)),
        ),
        Effect.orElseSucceed(() => context.summary),
      )
      yield* contexts.update(chat, new ChatContext({ ...cut, summary }))
    })

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

        const chat = { id: started.chatId, userId: started.userId }
        const replied = yield* Effect.interruptible(answer(started, chat)).pipe(
          Effect.onError(failUnanswered(started)),
        )

        yield* Effect.interruptible(cutOversized(chat, replied))
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
