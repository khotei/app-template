import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Exit, Fiber, Layer, Option, Stream } from 'effect'
import { TestClock } from 'effect/testing'

import { AssistantMessageTest, selectChat } from '@app-template/application/testing'
import {
  buildAssistantMessage,
  Chat,
  ChatRepository,
  Message,
  MessageRepository,
} from '@app-template/domain/chat'
import {
  type AssistantCallHold,
  chat,
  chatId,
  epoch,
  holdAssistantCall,
  messageId,
  recordAssistant,
} from '@app-template/domain/testing'
import {
  assistantMessageDeadLetterQueue,
  assistantMessageQueue,
  GenerateAssistantMessage,
} from '@app-template/infrastructure/chat'
import type { AttemptInfo } from '@app-template/queue'
import { recordLogs } from '@app-template/testing'

import { handle, handleDeadLettered } from '#worker/chat/assistant-message.handler'

const at = (millis: number) => DateTime.makeUnsafe(millis)

const queuedReply = buildAssistantMessage({ id: messageId, chatId, createdAt: epoch })

const completedReply = new Message({ ...queuedReply, stage: 'completed', text: 'Done.' })

const providerExploded = new Error('provider exploded')

const explodingAtOnce = Stream.die(providerExploded)

// A delta at 120 ms, which the 300 ms snapshot writes, then the provider dies at 520 ms.
const explodingMidway = Stream.make('Hel').pipe(
  Stream.tap(() => Effect.sleep('120 millis')),
  Stream.concat(Stream.fromEffect(Effect.sleep('400 millis')).pipe(Stream.drain)),
  Stream.concat(Stream.die(providerExploded)),
)

// The use case asks for the stream after its `generating` write.
const heldDeltas = (held: AssistantCallHold, deltas: Stream.Stream<string> = Stream.empty) =>
  Stream.fromEffect(held.hold).pipe(Stream.drain, Stream.concat(deltas))

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

const job = new GenerateAssistantMessage({ chatId, messageId })

const insertReply = (reply: Message) => MessageRepository.use((messages) => messages.insert(reply))

const selectReply = MessageRepository.use((messages) => messages.selectOne({ id: messageId }))

const deleteChat = ChatRepository.use((chats) => chats.delete(chatId))

const assertFailed = (failed: Message, cause: string) => {
  const error = Option.getOrThrow(failed.error)
  assert.strictEqual(failed.stage, 'failed')
  assert.strictEqual(error.reason, 'ReplyFailed')
  assert.include(error.cause, cause)
}

describe('AssistantMessageHandler', () => {
  it.effect('handle leaves the reply active when an earlier attempt fails', () => {
    const assistant = recordAssistant({ streamText: explodingAtOnce })
    return Effect.gen(function* () {
      yield* insertReply(queuedReply)

      const exit = yield* Effect.exit(handle(job, attemptInfo(1)))

      assert.isTrue(Exit.isFailure(exit))
      assertEquals(
        yield* selectReply,
        Option.some(new Message({ ...queuedReply, stage: 'generating' })),
      )
      assertEquals(yield* selectChat(chatId), Option.some(chat))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('handle fails the reply with the cause when the last attempt fails', () => {
    const assistant = recordAssistant({ streamText: explodingAtOnce })
    return Effect.gen(function* () {
      yield* insertReply(queuedReply)

      const exit = yield* Effect.exit(handle(job, attemptInfo(maxAttempts)))

      assert.isTrue(Exit.isFailure(exit))
      const failed = Option.getOrThrow(yield* selectReply)
      assertFailed(failed, 'provider exploded')
      assertEquals(
        yield* selectChat(chatId),
        Option.some(new Chat({ ...chat, updatedAt: failed.updatedAt })),
      )
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('handle fails the reply when its worker is interrupted during the last attempt', () => {
    const held = holdAssistantCall()
    const assistant = recordAssistant({ streamText: heldDeltas(held) })
    return Effect.gen(function* () {
      yield* insertReply(queuedReply)

      const running = yield* Effect.forkChild(handle(job, attemptInfo(maxAttempts)))
      yield* held.asked
      yield* Fiber.interrupt(running)

      const failed = Option.getOrThrow(yield* selectReply)
      assertFailed(failed, 'interrupt')
      assertEquals(
        yield* selectChat(chatId),
        Option.some(new Chat({ ...chat, updatedAt: failed.updatedAt })),
      )
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect("handle keeps the last snapshot's text on the reply it fails", () => {
    const held = holdAssistantCall()
    const assistant = recordAssistant({ streamText: heldDeltas(held, explodingMidway) })
    return Effect.gen(function* () {
      yield* insertReply(queuedReply)

      const running = yield* Effect.forkChild(handle(job, attemptInfo(maxAttempts)))
      yield* held.asked
      yield* held.release
      yield* TestClock.adjust('520 millis')
      yield* Fiber.join(running).pipe(Effect.exit)

      const failed = Option.getOrThrow(yield* selectReply)
      assertFailed(failed, 'provider exploded')
      assert.strictEqual(failed.text, 'Hel')
      assertEquals(failed.updatedAt, at(520))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect(
    'handleDeadLettered fails an active reply with the attempts in its cause and logs an error',
    () => {
      const assistant = recordAssistant({})
      const { logs, layer: logger } = recordLogs()
      return Effect.gen(function* () {
        yield* insertReply(new Message({ ...queuedReply, stage: 'generating', text: 'Hel' }))

        yield* handleDeadLettered(job, deadLetterInfo)

        const failed = Option.getOrThrow(yield* selectReply)
        assertFailed(
          failed,
          `dead-lettered after ${maxAttempts + 1} attempts on assistant-message-dlq`,
        )
        assert.strictEqual(failed.text, 'Hel')
        assertEquals(yield* assistant.calls, [])
        assert.deepStrictEqual(logs, [['Error', 'assistant reply dead-lettered']])
      }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
    },
  )

  it.effect('handleDeadLettered skips a settled reply without the error log', () => {
    const assistant = recordAssistant({})
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertReply(completedReply)

      yield* handleDeadLettered(job, deadLetterInfo)

      assertEquals(yield* selectReply, Option.some(completedReply))
      assertEquals(yield* selectChat(chatId), Option.some(chat))
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect('handleDeadLettered logs chat deleted and writes nothing for a deleted chat', () => {
    const assistant = recordAssistant({})
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertReply(queuedReply)
      yield* deleteChat

      yield* handleDeadLettered(job, deadLetterInfo)

      assertEquals(yield* selectReply, Option.none())
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })
})
