import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Exit, Fiber, Layer, Option, Schema } from 'effect'

import {
  type Assistant,
  AssistantReply,
  assistantMessageQueue,
  buildAssistantMessage,
  Chat,
  GenerateAssistantMessage,
  Message,
} from '@app-template/application/chat'
import {
  chat,
  chatId,
  holdAssistantCall,
  insertMessage,
  messageId,
  queuedChat,
  recordAssistant,
  replyProvenance,
  selectChat,
  selectMessage,
} from '@app-template/application/chat/testing'
import { AssistantMessageTest } from '@app-template/application/use-cases/testing'
import type { AttemptInfo } from '@app-template/packages/queue-2'
import { epoch } from '@app-template/packages/testing'

import { AssistantMessageHandler } from '#worker/chat/assistant-message.handler'

const queuedReply = buildAssistantMessage({ id: messageId, chatId, createdAt: epoch })

const completedReply = new Message({ ...queuedReply, status: 'done', text: 'Done.' })

const providerExploded = new Error('provider exploded')

const exploding = Effect.die(providerExploded)

const { maxAttempts } = assistantMessageQueue

const attemptInfo = (attempt: number): AttemptInfo => ({
  attempt,
  maxAttempts,
  isLastAttempt: attempt >= maxAttempts,
})

/** The handler over the reply use case's memory layers and the test's `Assistant`. */
function layerHandlerTest(assistant: Layer.Layer<Assistant>) {
  return AssistantMessageHandler.layer.pipe(
    Layer.provideMerge(AssistantMessageTest),
    Layer.provide(assistant),
  )
}

const job = new GenerateAssistantMessage({
  chatId,
  messageId,
  provenance: Option.some(replyProvenance),
})

function assertFailed(failed: Message, cause: string) {
  const error = Option.getOrThrow(failed.error)
  assert.strictEqual(failed.status, 'failed')
  assert.strictEqual(error.reason, 'ReplyFailed')
  assert.include(error.cause, cause)
}

describe('AssistantMessageHandler', () => {
  it.effect('handle leaves the reply active when an earlier attempt fails', () => {
    const assistant = recordAssistant({ reply: exploding })
    return Effect.gen(function* () {
      const handler = yield* AssistantMessageHandler

      yield* insertMessage(queuedReply)

      const exit = yield* handler.handle(job, attemptInfo(1)).pipe(Effect.exit)

      assert.isTrue(Exit.isFailure(exit))
      assertEquals(
        yield* selectMessage(messageId),
        Option.some(new Message({ ...queuedReply, status: 'generating' })),
      )
      assertEquals(yield* selectChat(chatId), Option.some(queuedChat))
    }).pipe(Effect.provide(layerHandlerTest(assistant.layer)))
  })

  it.effect('handle settles the reply of a job queued before it carried provenance', () => {
    const assistant = recordAssistant({
      reply: Effect.succeed(new AssistantReply({ text: 'Done.' })),
    })
    return Effect.gen(function* () {
      const handler = yield* AssistantMessageHandler

      yield* insertMessage(queuedReply)
      const queuedBefore = yield* Schema.decodeUnknownEffect(
        Schema.toCodecJson(assistantMessageQueue.schema),
      )({ chatId, messageId })

      yield* handler.handle(queuedBefore, attemptInfo(1))

      assertEquals(yield* selectMessage(messageId), Option.some(completedReply))
    }).pipe(Effect.provide(layerHandlerTest(assistant.layer)))
  })

  it.effect('handle fails the reply with the cause and no text when the last attempt fails', () => {
    const assistant = recordAssistant({ reply: exploding })
    return Effect.gen(function* () {
      const handler = yield* AssistantMessageHandler

      yield* insertMessage(queuedReply)

      const exit = yield* handler.handle(job, attemptInfo(maxAttempts)).pipe(Effect.exit)

      assert.isTrue(Exit.isFailure(exit))
      const failed = Option.getOrThrow(yield* selectMessage(messageId))
      assertFailed(failed, 'provider exploded')
      assert.strictEqual(failed.text, '')
      assertEquals(yield* selectChat(chatId), Option.some(new Chat({ ...chat, status: 'failed' })))
    }).pipe(Effect.provide(layerHandlerTest(assistant.layer)))
  })

  it.effect('handle fails the reply when its worker is interrupted during the last attempt', () => {
    const held = holdAssistantCall()
    const assistant = recordAssistant({ reply: held.hold.pipe(Effect.andThen(Effect.never)) })
    return Effect.gen(function* () {
      const handler = yield* AssistantMessageHandler

      yield* insertMessage(queuedReply)

      const running = yield* handler.handle(job, attemptInfo(maxAttempts)).pipe(Effect.forkChild)
      yield* held.asked
      yield* Fiber.interrupt(running)

      const failed = Option.getOrThrow(yield* selectMessage(messageId))
      assertFailed(failed, 'interrupt')
      assertEquals(yield* selectChat(chatId), Option.some(new Chat({ ...chat, status: 'failed' })))
    }).pipe(Effect.provide(layerHandlerTest(assistant.layer)))
  })
})
