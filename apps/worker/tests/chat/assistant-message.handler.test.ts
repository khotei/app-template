import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Exit, Fiber, Layer, Option, Struct } from 'effect'

import { AssistantMessageTest, selectChat } from '@app-template/application/testing'
import {
  buildAssistantMessage,
  Chat,
  ChatRepository,
  Message,
  MessageRepository,
} from '@app-template/domain/chat'
import {
  chat,
  chatId,
  epoch,
  holdAssistantCall,
  messageId,
  queuedChat,
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

const queuedReply = buildAssistantMessage({ id: messageId, chatId, createdAt: epoch })

const completedReply = new Message({ ...queuedReply, stage: 'completed', text: 'Done.' })

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

const job = new GenerateAssistantMessage({ chatId, messageId })

const insertReply = (reply: Message) => MessageRepository.use((messages) => messages.insert(reply))

const selectReply = MessageRepository.use((messages) =>
  messages.selectOne({ id: messageId }).pipe(Effect.map(Option.map(Struct.get('message')))),
)

const deleteChat = ChatRepository.use((chats) => chats.delete({ id: chatId }))

const assertFailed = (failed: Message, cause: string) => {
  const error = Option.getOrThrow(failed.error)
  assert.strictEqual(failed.stage, 'failed')
  assert.strictEqual(error.reason, 'ReplyFailed')
  assert.include(error.cause, cause)
}

describe('AssistantMessageHandler', () => {
  it.effect('handle leaves the reply active when an earlier attempt fails', () => {
    const assistant = recordAssistant({ reply: exploding })
    return Effect.gen(function* () {
      yield* insertReply(queuedReply)

      const exit = yield* handle(job, attemptInfo(1)).pipe(Effect.exit)

      assert.isTrue(Exit.isFailure(exit))
      assertEquals(
        yield* selectReply,
        Option.some(new Message({ ...queuedReply, stage: 'generating' })),
      )
      assertEquals(yield* selectChat(chatId), Option.some(queuedChat))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('handle fails the reply with the cause and no text when the last attempt fails', () => {
    const assistant = recordAssistant({ reply: exploding })
    return Effect.gen(function* () {
      yield* insertReply(queuedReply)

      const exit = yield* handle(job, attemptInfo(maxAttempts)).pipe(Effect.exit)

      assert.isTrue(Exit.isFailure(exit))
      const failed = Option.getOrThrow(yield* selectReply)
      assertFailed(failed, 'provider exploded')
      assert.strictEqual(failed.text, '')
      assertEquals(yield* selectChat(chatId), Option.some(new Chat({ ...chat, status: 'failed' })))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('handle fails the reply when its worker is interrupted during the last attempt', () => {
    const held = holdAssistantCall()
    const assistant = recordAssistant({ reply: held.hold.pipe(Effect.andThen(Effect.never)) })
    return Effect.gen(function* () {
      yield* insertReply(queuedReply)

      const running = yield* handle(job, attemptInfo(maxAttempts)).pipe(Effect.forkChild)
      yield* held.asked
      yield* Fiber.interrupt(running)

      const failed = Option.getOrThrow(yield* selectReply)
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
        yield* insertReply(new Message({ ...queuedReply, stage: 'generating' }))

        yield* handleDeadLettered(job, deadLetterInfo)

        const failed = Option.getOrThrow(yield* selectReply)
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
      yield* insertReply(completedReply)

      yield* handleDeadLettered(job, deadLetterInfo)

      assertEquals(yield* selectReply, Option.some(completedReply))
      assertEquals(yield* selectChat(chatId), Option.some(queuedChat))
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
