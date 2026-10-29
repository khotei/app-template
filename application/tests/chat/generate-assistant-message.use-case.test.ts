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

// Seven deltas 130 ms apart. An interval opens with the stream and then with the first delta
// after a snapshot: snapshots at 300 ms (two deltas) and 690 ms (five), the full text at 910 ms.
const sevenDeltas = Stream.make('One', ' two', ' three', ' four', ' five', ' six', ' seven').pipe(
  Stream.tap(() => Effect.sleep('130 millis')),
)

const snapshotAt = (text: string, millis: number) =>
  new Message({ ...queuedReply, stage: 'generating', text, updatedAt: at(millis) })

// The use case asks for the stream after its `generating` write.
const heldDeltas = (held: AssistantCallHold, deltas: Stream.Stream<string> = replyDeltas) =>
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

const selectReply = MessageRepository.use((messages) => messages.selectOne({ id: messageId }))

// Another writer's settle, landing in the rows behind the use case's back.
const settleElsewhere = MessageRows.use((rows) =>
  Ref.update(rows, HashMap.set(messageId, asCompleted(queuedReply, 'Done elsewhere.'))),
)

const deleteChat = ChatRepository.use((chats) => chats.delete(chatId))

const job = new GenerateAssistantMessage({ chatId, messageId })

const generate = GenerateAssistantMessageUseCase.use((useCase) => useCase.generate(job))

const fail = (cause: Cause.Cause<unknown>) =>
  GenerateAssistantMessageUseCase.use((useCase) => useCase.fail(messageId, cause))

describe('GenerateAssistantMessageUseCase', () => {
  it.effect(
    'generate moves the reply through preparing, generating, a snapshot at most every 300 ms and completed, and moves the chat to the completion',
    () => {
      const held = holdAssistantCall()
      const assistant = recordAssistant({ streamText: heldDeltas(held, sevenDeltas) })
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
        assertEquals(yield* selectReply, Option.some(snapshotAt('One two', 300)))
        yield* TestClock.adjust('390 millis')
        assertEquals(yield* selectReply, Option.some(snapshotAt('One two three four five', 690)))
        yield* TestClock.adjust('220 millis')
        yield* Fiber.join(running)

        assertEquals(
          yield* selectReply,
          Option.some(
            new Message({
              ...queuedReply,
              stage: 'completed',
              text: 'One two three four five six seven',
              updatedAt: at(910),
            }),
          ),
        )
        assertEquals(
          yield* selectChat(chatId),
          Option.some(new Chat({ ...chat, updatedAt: at(910) })),
        )
        assert.deepStrictEqual(logs, [])
      }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
    },
  )

  it.effect('generate interrupted mid-stream leaves the last snapshot as written', () => {
    const held = holdAssistantCall()
    const assistant = recordAssistant({ streamText: heldDeltas(held, sevenDeltas) })
    return Effect.gen(function* () {
      yield* insertMessages([queuedReply])

      const running = yield* Effect.forkChild(generate)
      yield* held.asked
      yield* held.release
      yield* TestClock.adjust('500 millis')
      yield* Fiber.interrupt(running)

      assertEquals(yield* selectReply, Option.some(snapshotAt('One two', 300)))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('generate fails with the stream and writes no text past the last snapshot', () => {
    const dying = sevenDeltas.pipe(Stream.take(3), Stream.concat(Stream.die('provider exploded')))
    const held = holdAssistantCall()
    const assistant = recordAssistant({ streamText: heldDeltas(held, dying) })
    return Effect.gen(function* () {
      yield* insertMessages([queuedReply])

      const running = yield* Effect.forkChild(generate)
      yield* held.asked
      yield* held.release
      yield* TestClock.adjust('500 millis')

      assert.isTrue(Exit.hasDies(yield* Fiber.await(running)))
      assertEquals(yield* selectReply, Option.some(snapshotAt('One two', 300)))
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

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
      }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
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

        const failed = Option.getOrThrow(yield* fail(Cause.die(new Error('provider exploded'))))

        assertEquals(yield* selectReply, Option.some(failed))
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
      assertEquals(yield* selectReply, Option.some(asCompleted(queuedReply, 'Done.')))
      assertEquals(yield* selectChat(chatId), Option.some(chat))
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })
})
