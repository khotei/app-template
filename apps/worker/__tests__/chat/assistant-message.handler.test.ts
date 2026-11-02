import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Exit, Fiber, Layer, Option, Schema } from 'effect'

import { AssistantReply, buildAssistantMessage, Chat, Message } from '@app-template/chat/domain'
import {
  assistantMessageDeadLetterQueue,
  assistantMessageQueue,
  GenerateAssistantMessage,
} from '@app-template/chat/services'
import {
  chat,
  chatId,
  deleteChat,
  holdAssistantCall,
  insertMessage,
  messageId,
  queuedChat,
  recordAssistant,
  replyProvenance,
  selectChat,
  selectMessage,
} from '@app-template/chat/testing'
import type { AttemptInfo } from '@app-template/queue'
import { epoch, recordLogs } from '@app-template/testing'
import { AssistantMessageTest } from '@app-template/use-cases/testing'

import { handle, handleDeadLettered } from '#worker/chat/assistant-message.handler'

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

const deadLetterInfo: AttemptInfo = {
  attempt: maxAttempts + 1,
  maxAttempts: assistantMessageDeadLetterQueue.maxAttempts,
  isLastAttempt: false,
}

const job = new GenerateAssistantMessage({
  chatId,
  messageId,
  provenance: Option.some(replyProvenance),
})

const assertFailed = (failed: Message, cause: string) => {
  const error = Option.getOrThrow(failed.error)
  assert.strictEqual(failed.status, 'failed')
  assert.strictEqual(error.reason, 'ReplyFailed')
  assert.include(error.cause, cause)
}

describe('AssistantMessageHandler', () => {
  it.effect('handle leaves the reply active when an earlier attempt fails', () => {
    const assistant = recordAssistant({ reply: exploding })
    return Effect.gen(function* () {
      yield* insertMessage(queuedReply)

      const exit = yield* handle(job, attemptInfo(1)).pipe(Effect.exit)

      assert.isTrue(Exit.isFailure(exit))
      assertEquals(
        yield* selectMessage(messageId),
        Option.some(new Message({ ...queuedReply, status: 'generating' })),
      )
      assertEquals(yield* selectChat(chatId), Option.some(queuedChat))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('handle settles the reply of a job queued before it carried provenance', () => {
    const assistant = recordAssistant({
      reply: Effect.succeed(new AssistantReply({ text: 'Done.' })),
    })
    return Effect.gen(function* () {
      yield* insertMessage(queuedReply)
      const queuedBefore = yield* Schema.decodeUnknownEffect(
        Schema.toCodecJson(assistantMessageQueue.schema),
      )({ chatId, messageId })

      yield* handle(queuedBefore, attemptInfo(1))

      assertEquals(yield* selectMessage(messageId), Option.some(completedReply))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('handle fails the reply with the cause and no text when the last attempt fails', () => {
    const assistant = recordAssistant({ reply: exploding })
    return Effect.gen(function* () {
      yield* insertMessage(queuedReply)

      const exit = yield* handle(job, attemptInfo(maxAttempts)).pipe(Effect.exit)

      assert.isTrue(Exit.isFailure(exit))
      const failed = Option.getOrThrow(yield* selectMessage(messageId))
      assertFailed(failed, 'provider exploded')
      assert.strictEqual(failed.text, '')
      assertEquals(yield* selectChat(chatId), Option.some(new Chat({ ...chat, status: 'failed' })))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('handle fails the reply when its worker is interrupted during the last attempt', () => {
    const held = holdAssistantCall()
    const assistant = recordAssistant({ reply: held.hold.pipe(Effect.andThen(Effect.never)) })
    return Effect.gen(function* () {
      yield* insertMessage(queuedReply)

      const running = yield* handle(job, attemptInfo(maxAttempts)).pipe(Effect.forkChild)
      yield* held.asked
      yield* Fiber.interrupt(running)

      const failed = Option.getOrThrow(yield* selectMessage(messageId))
      assertFailed(failed, 'interrupt')
      assertEquals(yield* selectChat(chatId), Option.some(new Chat({ ...chat, status: 'failed' })))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect(
    'handleDeadLettered fails an active reply with the attempts in its cause and logs an error',
    () => {
      const assistant = recordAssistant({})
      const { logs, layer: logger } = recordLogs()
      return Effect.gen(function* () {
        yield* insertMessage(new Message({ ...queuedReply, status: 'generating' }))

        yield* handleDeadLettered(job, deadLetterInfo)

        const failed = Option.getOrThrow(yield* selectMessage(messageId))
        assertFailed(
          failed,
          `dead-lettered after ${maxAttempts + 1} attempts on assistant-message-dlq`,
        )
        assertEquals(yield* assistant.calls, [])
        assert.deepStrictEqual(logs, [['Error', 'assistant reply dead-lettered']])
      }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
    },
  )

  it.effect('handleDeadLettered skips a settled reply without the error log', () => {
    const assistant = recordAssistant({})
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertMessage(completedReply)

      yield* handleDeadLettered(job, deadLetterInfo)

      assertEquals(yield* selectMessage(messageId), Option.some(completedReply))
      assertEquals(yield* selectChat(chatId), Option.some(queuedChat))
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect('handleDeadLettered logs chat deleted and writes nothing for a deleted chat', () => {
    const assistant = recordAssistant({})
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertMessage(queuedReply)
      yield* deleteChat(chatId)

      yield* handleDeadLettered(job, deadLetterInfo)

      assertEquals(yield* selectMessage(messageId), Option.none())
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })
})
