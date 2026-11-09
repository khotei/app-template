import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Exit, Fiber, Layer, Option, Stream } from 'effect'
import { TestClock } from 'effect/testing'

import {
  AssistantFailedError,
  AssistantRefusedError,
  AssistantReply,
  Attachment,
  AttachmentId,
  buildAssistantMessage,
  buildAttachment,
  buildRun,
  encodeAttachment,
  FileName,
  FileSize,
  GenerateAssistantMessage,
  MediaType,
  Message,
  type MessageId,
  Run,
} from '@app-template/application/chat'
import {
  type AssistantCallHold,
  assistantMessageAt,
  chatId,
  deleteChat,
  firstMessage,
  holdAssistantCall,
  insertMessage,
  insertRun,
  owner,
  queuedRun,
  recordAssistant,
  replyProvenance,
  selectMessages,
  selectRun,
  updateRun,
  userMessageAt,
} from '@app-template/application/chat/testing'
import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'
import { epoch, png, recordLogs } from '@app-template/packages/testing'

import { AssistantMessageTest } from '#testing/use-cases/chat.test-layer'
import { GenerateAssistantMessageUseCase } from '#use-cases/chat/generate-assistant-message.use-case'

const at = (millis: number) => DateTime.makeUnsafe(millis)

const sure = new AssistantReply({ text: 'Sure.' })

// The use case asks for the reply after its `generating` write.
const heldReply = (held: AssistantCallHold) => held.hold.pipe(Effect.as(sure))

const whatIsThis = userMessageAt(1, 'What is this?')
const aPhoto = assistantMessageAt(2, 'A photo.')
const andAgain = userMessageAt(3, 'And again?')
const attachmentsOnly = userMessageAt(4, '')

const history = [whatIsThis, aPhoto, andAgain, attachmentsOnly]

/** The queued Run of the history's last message. */
const lastRun = buildRun({
  id: queuedRun.id,
  chatId,
  userMessage: attachmentsOnly,
  provenance: replyProvenance,
  createdAt: attachmentsOnly.createdAt,
})

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

/** Stores the messages, then `run` over the one it answers. */
const insertWith = (messages: ReadonlyArray<Message>, run: Run) =>
  Effect.forEach(messages, insertMessage, { discard: true }).pipe(Effect.andThen(insertRun(run)))

const insertQueued = insertWith([firstMessage], queuedRun)

const insertAttachment = (attachment: Attachment, bytes: 'stored' | 'lost' = 'stored') =>
  Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const files = yield* FileRepository
    const row = yield* encodeAttachment(attachment)

    yield* attachments.insert(row)
    if (bytes === 'lost') return
    yield* files.insert({ ...attachment, content: Stream.make(png) })
  })

const doneElsewhere = new Run({ ...queuedRun, status: 'done' })

const job = new GenerateAssistantMessage({ chatId, runId: queuedRun.id })

const generate = GenerateAssistantMessageUseCase.use((useCase) => useCase.generate(job))

const selectQueuedRun = selectRun(queuedRun.id).pipe(Effect.map(Option.getOrThrow))

describe('GenerateAssistantMessageUseCase', () => {
  it.effect(
    "generate moves the Run through preparing and generating, then completes it with the assistant's message in one write",
    () => {
      const held = holdAssistantCall()
      const slowReply = held.hold.pipe(Effect.andThen(Effect.sleep('1 second')), Effect.as(sure))
      const assistant = recordAssistant({ reply: slowReply })
      const { logs, layer: logger } = recordLogs()
      return Effect.gen(function* () {
        yield* insertQueued

        const running = yield* Effect.forkChild(generate)
        yield* held.asked
        // `generate` writes only where the stored status is `preparing`, so this row proves that write.
        const generating = new Run({ ...queuedRun, status: 'generating' })
        assertEquals(yield* selectQueuedRun, generating)
        yield* held.release
        yield* TestClock.adjust('500 millis')
        assertEquals(yield* selectQueuedRun, generating)
        yield* TestClock.adjust('500 millis')
        yield* Fiber.join(running)

        const done = yield* selectQueuedRun
        const reply = Option.getOrThrow(done.assistantMessage)
        assertEquals(
          done,
          new Run({
            ...queuedRun,
            status: 'done',
            updatedAt: at(1000),
            assistantMessage: Option.some(
              buildAssistantMessage({
                id: reply.id,
                chatId,
                runId: queuedRun.id,
                text: 'Sure.',
                createdAt: at(1000),
              }),
            ),
          }),
        )
        assertEquals(yield* selectMessages(chatId), [firstMessage, reply])
        assert.deepStrictEqual(logs, [])
      }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
    },
  )

  it.effect('generate dies with the assistant and fails the Run first', () => {
    const assistant = recordAssistant({ reply: Effect.die('provider exploded') })
    return Effect.gen(function* () {
      yield* insertQueued

      const exit = yield* generate.pipe(Effect.exit)
      const run = yield* selectQueuedRun

      assert.isTrue(Exit.hasDies(exit))
      assert.strictEqual(run.status, 'failed')
      assert.strictEqual(Option.getOrThrow(run.failure).reason, 'ReplyFailed')
      assert.include(Option.getOrThrow(run.failure).cause, 'provider exploded')
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect.each([{ status: 'preparing' }, { status: 'generating' }] as const)(
    'generate fails a $status Run a dead worker left, without asking the assistant',
    ({ status }) => {
      const assistant = recordAssistant({ reply: Effect.succeed(sure) })
      return Effect.gen(function* () {
        yield* insertWith([firstMessage], new Run({ ...queuedRun, status }))

        yield* generate
        const run = yield* selectQueuedRun

        assert.strictEqual(run.status, 'failed')
        assert.deepStrictEqual(
          Option.map(run.failure, ({ reason }) => reason),
          Option.some('ReplyFailed'),
        )
        assertEquals(yield* assistant.calls, [])
      }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
    },
  )

  it.effect.each([
    {
      error: new AssistantRefusedError({ cause: 'stop_reason refusal' }),
      reason: 'ReplyRefused',
    },
    { error: new AssistantFailedError({ cause: '401 invalid x-api-key' }), reason: 'ReplyFailed' },
  ] as const)(
    "generate fails the Run with $reason and the error's cause after one call, and writes no reply",
    ({ error, reason }) => {
      const assistant = recordAssistant({ reply: Effect.fail(error) })
      return Effect.gen(function* () {
        yield* insertQueued

        yield* generate

        const run = yield* selectQueuedRun
        assert.deepStrictEqual(
          {
            status: run.status,
            failure: run.failure.pipe(Option.map(({ reason, cause }) => ({ reason, cause }))),
          },
          { status: 'failed', failure: Option.some({ reason, cause: error.cause }) },
        )
        assert.strictEqual((yield* assistant.calls).length, 1)
        assertEquals(yield* selectMessages(chatId), [firstMessage])
      }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
    },
  )

  it.effect(
    "generate prompts with the chat's messages in order and the bytes of their attachments",
    () => {
      const assistant = recordAssistant({ reply: Effect.succeed(sure) })
      return Effect.gen(function* () {
        yield* insertWith(history, lastRun)
        yield* insertAttachment(photo)
        yield* insertAttachment(sketch)

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
                attachments: [{ attachment: sketch, bytes: png }],
              },
            ],
          },
        ])
      }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
    },
  )

  it.effect(
    "generate prompts without an attachment whose bytes are gone and logs a warning with its, the chat's and the Run's ids",
    () => {
      const assistant = recordAssistant({ reply: Effect.succeed(sure) })
      const { logs, layer: logger } = recordLogs('attachmentId', 'chatId', 'runId')
      return Effect.gen(function* () {
        yield* insertWith([attachmentsOnly], lastRun)
        yield* insertAttachment(sketch, 'lost')

        yield* generate

        assertEquals(yield* assistant.calls, [
          {
            method: 'reply',
            history: [
              {
                message: new Message({ ...attachmentsOnly, attachments: [sketch] }),
                attachments: [],
              },
            ],
          },
        ])
        assert.deepStrictEqual(logs, [
          ['Warn', 'attachment skipped: file missing', sketch.id, chatId, queuedRun.id],
        ])
      }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
    },
  )

  it.effect('generate dies on a Run another worker settled while the assistant answers', () => {
    const held = holdAssistantCall()
    const assistant = recordAssistant({ reply: heldReply(held) })
    return Effect.gen(function* () {
      yield* insertQueued

      const running = yield* generate.pipe(Effect.exit, Effect.forkChild)
      yield* held.asked
      yield* updateRun(doneElsewhere)
      yield* held.release
      const exit = yield* Fiber.join(running)

      assert.isTrue(Exit.hasDies(exit))
      assertEquals(yield* selectQueuedRun, doneElsewhere)
      assertEquals(yield* selectMessages(chatId), [firstMessage])
    }).pipe(Effect.provide(Layer.provide(AssistantMessageTest, assistant.layer)))
  })

  it.effect('generate skips a Run settled before it, without asking the assistant', () => {
    const assistant = recordAssistant({ reply: Effect.succeed(sure) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertWith([firstMessage], doneElsewhere)

      yield* generate

      assertEquals(yield* selectQueuedRun, doneElsewhere)
      assertEquals(yield* assistant.calls, [])
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect('generate skips a deleted chat, without asking the assistant', () => {
    const assistant = recordAssistant({ reply: Effect.succeed(sure) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertQueued
      yield* deleteChat(chatId)

      yield* generate

      assertEquals(yield* assistant.calls, [])
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
    }).pipe(Effect.provide([AssistantMessageTest.pipe(Layer.provide(assistant.layer)), logger]))
  })
})
