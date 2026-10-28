import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Cause, DateTime, Effect, Fiber, HashMap, Layer, Option, Ref, Stream } from 'effect'
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
  buildAssistantMessage,
  buildUserMessage,
  Chat,
  ChatRepository,
  Message,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import {
  type AssistantCallHold,
  chat,
  chatId,
  epoch,
  holdAssistantCall,
  MessageRows,
  messageId,
  owner,
  recordAssistant,
} from '@app-template/domain/testing'
import { GenerateAssistantMessage } from '@app-template/infrastructure/chat'
import { png, recordLogs } from '@app-template/testing'

import { GenerateAssistantMessageUseCase } from '#application/chat/generate-assistant-message.use-case'
import { AssistantMessageTest, selectChat } from '#application/testing/chat.test-layer'

const historyId = (n: number) => MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`)

const at = (millis: number) => DateTime.makeUnsafe(millis)

const queuedReply = buildAssistantMessage({ id: messageId, chatId, createdAt: epoch })

const asCompleted = (message: Message, text: string) =>
  new Message({ ...message, stage: 'completed', text })

const replyDeltas = Stream.make('Hel', 'lo, ', 'world')

// Three deltas 120 ms apart: the 300 ms snapshot sees the first two.
const threeDeltas = replyDeltas.pipe(Stream.tap(() => Effect.sleep('120 millis')))

// The use case asks for the stream after its `generating` write.
const heldDeltas = (held: AssistantCallHold, deltas = replyDeltas) =>
  Stream.fromEffect(held.hold).pipe(Stream.drain, Stream.concat(deltas))

// A second apart: messages sharing a `createdAt` come back in no defined order.
const user = (n: number, text: string) =>
  buildUserMessage({ id: historyId(n), chatId, text, createdAt: at(n * 1000) })

const assistant = (n: number) =>
  buildAssistantMessage({ id: historyId(n), chatId, createdAt: at(n * 1000) })

const whatIsThis = user(1, 'What is this?')
const aPhoto = asCompleted(assistant(2), 'A photo.')
const andAgain = user(3, 'And again?')
const halfReply = new Message({ ...assistant(4), stage: 'failed', text: 'half' })
const filesOnly = user(5, '')

const history = [whatIsThis, aPhoto, andAgain, halfReply, filesOnly]

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
  })

const photo = image('0192d4e0-7b3a-7c00-8000-000000000040', {
  name: 'photo.png',
  boundTo: whatIsThis.id,
})

const sketch = image('0192d4e0-7b3a-7c00-8000-000000000041', {
  name: 'sketch.png',
  boundTo: filesOnly.id,
})

const insertMessages = (messages: ReadonlyArray<Message>) =>
  Effect.flatMap(MessageRepository, (repository) =>
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

const selectReply = Effect.flatMap(MessageRepository, (messages) =>
  messages.selectOne({ id: messageId }),
)

// Another writer's settle, landing in the rows behind the use case's back.
const settleElsewhere = Effect.flatMap(MessageRows, (rows) =>
  Ref.update(rows, HashMap.set(messageId, asCompleted(queuedReply, 'Done elsewhere.'))),
)

const deleteChat = Effect.flatMap(ChatRepository, (chats) => chats.delete(chatId))

const job = new GenerateAssistantMessage({ chatId, messageId })

const generate = Effect.flatMap(GenerateAssistantMessageUseCase, (useCase) => useCase.generate(job))

const fail = (cause: Cause.Cause<unknown>) =>
  Effect.flatMap(GenerateAssistantMessageUseCase, (useCase) => useCase.fail(messageId, cause))

describe('GenerateAssistantMessageUseCase', () => {
  it.effect(
    'generate moves the reply through preparing, generating, a snapshot every 300 ms and completed, and moves the chat to the completion',
    () => {
      const held = holdAssistantCall()
      const assistant = recordAssistant({ streamText: heldDeltas(held, threeDeltas) })
      const { logs, layer: logger } = recordLogs()
      return Effect.gen(function* () {
        yield* insertMessages([queuedReply])

        const running = yield* Effect.forkChild(generate)
        yield* held.asked
        // `generate` writes only where the stored stage is `preparing`, so this row proves that write.
        assertEquals(
          yield* selectReply,
          Option.some(new Message({ ...queuedReply, stage: 'generating' })),
        )
        yield* held.release
        yield* TestClock.adjust('300 millis')
        assertEquals(
          yield* selectReply,
          Option.some(
            new Message({
              ...queuedReply,
              stage: 'generating',
              text: 'Hello, ',
              updatedAt: at(300),
            }),
          ),
        )
        yield* TestClock.adjust('60 millis')
        yield* Fiber.join(running)

        assertEquals(
          yield* selectReply,
          Option.some(
            new Message({
              ...queuedReply,
              stage: 'completed',
              text: 'Hello, world',
              updatedAt: at(360),
            }),
          ),
        )
        assertEquals(
          yield* selectChat(chatId),
          Option.some(new Chat({ ...chat, updatedAt: at(360) })),
        )
        assert.deepStrictEqual(logs, [])
      }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
    },
  )

  it.effect(
    'generate prompts with every completed message in order and the bytes of its attachments',
    () => {
      const assistant = recordAssistant({ streamText: replyDeltas })
      return Effect.gen(function* () {
        yield* insertMessages([...history, queuedReply])
        yield* insertAttachment(photo)
        yield* insertAttachment(sketch, 'lost')

        yield* generate

        assertEquals(yield* assistant.calls, [
          {
            method: 'streamText',
            history: [
              { message: whatIsThis, files: [{ attachment: photo, bytes: png }] },
              { message: aPhoto, files: [] },
              { message: andAgain, files: [] },
              { message: filesOnly, files: [] },
            ],
          },
        ])
      }).pipe(Effect.provide(AssistantMessageTest.pipe(Layer.provide(assistant.layer))))
    },
  )

  it.effect('generate skips a reply another writer settled while it streams', () => {
    const held = holdAssistantCall()
    const assistant = recordAssistant({ streamText: heldDeltas(held) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertMessages([queuedReply])

      const running = yield* Effect.forkChild(generate)
      yield* held.asked
      yield* settleElsewhere
      yield* held.release
      yield* Fiber.join(running)

      assertEquals(yield* selectReply, Option.some(asCompleted(queuedReply, 'Done elsewhere.')))
      assertEquals(yield* selectChat(chatId), Option.some(chat))
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect('generate skips a reply settled before it, without asking the assistant', () => {
    const assistant = recordAssistant({ streamText: replyDeltas })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertMessages([asCompleted(queuedReply, 'Done.')])

      yield* generate

      assertEquals(yield* selectReply, Option.some(asCompleted(queuedReply, 'Done.')))
      assertEquals(yield* assistant.calls, [])
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect('generate skips a deleted chat, without asking the assistant', () => {
    const assistant = recordAssistant({ streamText: replyDeltas })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertMessages([queuedReply])
      yield* deleteChat

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

        const written = yield* fail(Cause.die(new Error('provider exploded')))

        assert.isTrue(written)
        const failed = Option.getOrThrow(yield* selectReply)
        const error = Option.getOrThrow(failed.error)
        assert.strictEqual(failed.stage, 'failed')
        assert.deepStrictEqual(
          [error.reason, error.message],
          ['ReplyFailed', 'The assistant could not reply. Please try again.'],
        )
        assert.include(error.cause, 'provider exploded')
        assert.notInclude(error.message, 'provider exploded')
        assert.isTrue(DateTime.isGreaterThan(failed.updatedAt, epoch))
        assertEquals(
          yield* selectChat(chatId),
          Option.some(new Chat({ ...chat, updatedAt: failed.updatedAt })),
        )
      }).pipe(Effect.provide(AssistantMessageTest.pipe(Layer.provide(assistant.layer))))
    },
  )

  it.effect('fail leaves a settled reply and logs the skip', () => {
    const assistant = recordAssistant({})
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertMessages([asCompleted(queuedReply, 'Done.')])

      const written = yield* fail(Cause.die(new Error('provider exploded')))

      assert.isFalse(written)
      assertEquals(yield* selectReply, Option.some(asCompleted(queuedReply, 'Done.')))
      assertEquals(yield* selectChat(chatId), Option.some(chat))
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })
})
