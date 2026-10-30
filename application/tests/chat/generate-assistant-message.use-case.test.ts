import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Cause, DateTime, Effect, Exit, Fiber, HashMap, Layer, Option, Ref, Stream } from 'effect'
import { TestClock } from 'effect/testing'

import {
  Attachment,
  AttachmentBucket,
  AttachmentId,
  AttachmentRepository,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import {
  AssistantReply,
  buildAssistantMessage,
  buildUserMessage,
  Chat,
  Message,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import {
  type AssistantCallHold,
  chat,
  chatId,
  deleteChat,
  epoch,
  holdAssistantCall,
  MessageRows,
  messageId,
  owner,
  queuedChat,
  recordAssistant,
  selectChat,
  selectMessage,
} from '@app-template/domain/testing'
import { GenerateAssistantMessage } from '@app-template/infrastructure/chat'
import { png, recordLogs } from '@app-template/testing'

import { GenerateAssistantMessageUseCase } from '#application/chat/generate-assistant-message.use-case'
import { AssistantMessageTest } from '#application/testing/chat.test-layer'

const historyId = (n: number) => MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`)

const at = (millis: number) => DateTime.makeUnsafe(millis)

const queuedReply = buildAssistantMessage({ id: messageId, chatId, createdAt: epoch })

const asCompleted = (message: Message, text: string) =>
  new Message({ ...message, status: 'done', text })

const sure = new AssistantReply({ text: 'Sure.' })

// The use case asks for the reply after its `generating` write.
const heldReply = (held: AssistantCallHold) => held.hold.pipe(Effect.as(sure))

// A second apart: messages sharing a `createdAt` come back in no defined order.
const user = (n: number, text: string) =>
  buildUserMessage({ id: historyId(n), chatId, text, createdAt: at(n * 1000) })

const assistant = (n: number) =>
  buildAssistantMessage({ id: historyId(n), chatId, createdAt: at(n * 1000) })

const whatIsThis = user(1, 'What is this?')
const aPhoto = asCompleted(assistant(2), 'A photo.')
const andAgain = user(3, 'And again?')
const halfReply = new Message({ ...assistant(4), status: 'failed', text: 'half' })
const attachmentsOnly = user(5, '')

const history = [whatIsThis, aPhoto, andAgain, halfReply, attachmentsOnly]

const image = (
  id: string,
  { name, boundTo }: { readonly name: string; readonly boundTo: MessageId },
) =>
  new Attachment({
    ...buildAttachment({
      id: AttachmentId.make(id),
      userId: owner,
      fileName: FileName.make(name),
      mediaType: MediaType.make('image/png'),
      size: FileSize.make(png.length),
      createdAt: epoch,
    }),
    messageId: Option.some(boundTo),
    chatId: Option.some(chatId),
  })

const photo = image('0192d4e0-7b3a-7c00-8000-000000000040', {
  name: 'photo.png',
  boundTo: whatIsThis.id,
})

const sketch = image('0192d4e0-7b3a-7c00-8000-000000000041', {
  name: 'sketch.png',
  boundTo: attachmentsOnly.id,
})

const insertMessages = (messages: ReadonlyArray<Message>) =>
  MessageRepository.use((repository) =>
    Effect.forEach(messages, repository.insert, { discard: true }),
  )

const insertAttachment = (attachment: Attachment, bytes: 'stored' | 'lost' = 'stored') =>
  Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const bucket = yield* AttachmentBucket

    yield* attachments.insert(attachment)
    if (bytes === 'lost') return
    yield* bucket.insert(attachment.id, Stream.make(png), attachment)
  })

// Another writer's settle, landing in the rows behind the use case's back.
const settleElsewhere = MessageRows.use((rows) =>
  Ref.update(rows, HashMap.set(messageId, asCompleted(queuedReply, 'Done elsewhere.'))),
)

const job = new GenerateAssistantMessage({ chatId, messageId })

const generate = GenerateAssistantMessageUseCase.use((useCase) => useCase.generate(job))

const fail = (cause: Cause.Cause<unknown>) =>
  GenerateAssistantMessageUseCase.use((useCase) => useCase.fail(messageId, cause))

describe('GenerateAssistantMessageUseCase', () => {
  it.effect(
    "generate moves the reply through preparing and generating with no text, then completes it with the reply's text in one write, and moves the chat to the completion",
    () => {
      const held = holdAssistantCall()
      const slowReply = held.hold.pipe(Effect.andThen(Effect.sleep('1 second')), Effect.as(sure))
      const assistant = recordAssistant({ reply: slowReply })
      const { logs, layer: logger } = recordLogs()
      return Effect.gen(function* () {
        yield* insertMessages([queuedReply])

        const running = yield* Effect.forkChild(generate)
        yield* held.asked
        // `generate` writes only where the stored status is `preparing`, so this row proves that write.
        const generating = new Message({ ...queuedReply, status: 'generating' })
        assertEquals(yield* selectMessage(messageId), Option.some(generating))
        yield* held.release
        yield* TestClock.adjust('500 millis')
        assertEquals(yield* selectMessage(messageId), Option.some(generating))
        yield* TestClock.adjust('500 millis')
        yield* Fiber.join(running)

        assertEquals(
          yield* selectMessage(messageId),
          Option.some(
            new Message({ ...queuedReply, status: 'done', text: 'Sure.', updatedAt: at(1000) }),
          ),
        )
        assertEquals(yield* selectChat(chatId), Option.some(chat))
        assert.deepStrictEqual(logs, [])
      }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
    },
  )

  it.effect('generate dies with the assistant and leaves the reply generating with no text', () => {
    const assistant = recordAssistant({ reply: Effect.die('provider exploded') })
    return Effect.gen(function* () {
      yield* insertMessages([queuedReply])

      const exit = yield* generate.pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertEquals(
        yield* selectMessage(messageId),
        Option.some(new Message({ ...queuedReply, status: 'generating' })),
      )
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect(
    'generate prompts with every completed message in order and the bytes of its attachments',
    () => {
      const assistant = recordAssistant({ reply: Effect.succeed(sure) })
      return Effect.gen(function* () {
        yield* insertMessages([...history, queuedReply])
        yield* insertAttachment(photo)
        yield* insertAttachment(sketch, 'lost')

        yield* generate

        assertEquals(yield* assistant.calls, [
          {
            method: 'reply',
            history: [
              {
                message: new Message({ ...whatIsThis, attachments: [photo] }),
                attachments: [{ attachment: photo, bytes: png }],
              },
              { message: aPhoto, attachments: [] },
              { message: andAgain, attachments: [] },
              {
                message: new Message({ ...attachmentsOnly, attachments: [sketch] }),
                attachments: [],
              },
            ],
          },
        ])
      }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
    },
  )

  it.effect('generate dies on a reply another writer settled while the assistant answers', () => {
    const held = holdAssistantCall()
    const assistant = recordAssistant({ reply: heldReply(held) })
    return Effect.gen(function* () {
      yield* insertMessages([queuedReply])

      const running = yield* generate.pipe(Effect.exit, Effect.forkChild)
      yield* held.asked
      yield* settleElsewhere
      yield* held.release
      const exit = yield* Fiber.join(running)

      assert.isTrue(Exit.hasDies(exit))
      assertEquals(
        yield* selectMessage(messageId),
        Option.some(asCompleted(queuedReply, 'Done elsewhere.')),
      )
      assertEquals(yield* selectChat(chatId), Option.some(queuedChat))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('generate skips a reply settled before it, without asking the assistant', () => {
    const assistant = recordAssistant({ reply: Effect.succeed(sure) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertMessages([asCompleted(queuedReply, 'Done.')])

      yield* generate

      assertEquals(yield* selectMessage(messageId), Option.some(asCompleted(queuedReply, 'Done.')))
      assertEquals(yield* assistant.calls, [])
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect('generate skips a deleted chat, without asking the assistant', () => {
    const assistant = recordAssistant({ reply: Effect.succeed(sure) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertMessages([queuedReply])
      yield* deleteChat(chatId)

      yield* generate

      assertEquals(yield* assistant.calls, [])
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.live(
    "fail fails an active reply with the reason, keeping the cause out of the user's message, and moves the chat",
    () => {
      const assistant = recordAssistant({})
      return Effect.gen(function* () {
        yield* insertMessages([queuedReply])

        const failed = Option.getOrThrow(yield* fail(Cause.die(new Error('provider exploded'))))

        assertEquals(yield* selectMessage(messageId), Option.some(failed))
        const error = Option.getOrThrow(failed.error)
        assert.strictEqual(failed.status, 'failed')
        assert.deepStrictEqual(
          [error.reason, error.message],
          ['ReplyFailed', 'The assistant could not reply. Please try again.'],
        )
        assert.include(error.cause, 'provider exploded')
        assert.notInclude(error.message, 'provider exploded')
        assert.isTrue(DateTime.isGreaterThan(failed.updatedAt, epoch))
        assertEquals(
          yield* selectChat(chatId),
          Option.some(new Chat({ ...chat, status: 'failed' })),
        )
      }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
    },
  )

  it.effect('fail leaves a settled reply and logs the skip', () => {
    const assistant = recordAssistant({})
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertMessages([asCompleted(queuedReply, 'Done.')])

      const failed = yield* fail(Cause.die(new Error('provider exploded')))

      assertEquals(failed, Option.none())
      assertEquals(yield* selectMessage(messageId), Option.some(asCompleted(queuedReply, 'Done.')))
      assertEquals(yield* selectChat(chatId), Option.some(queuedChat))
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })
})
