import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import {
  Array as Arr,
  DateTime,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  pipe,
  Schema,
  Stream,
} from 'effect'
import { TestClock } from 'effect/testing'

import {
  AssistantReply,
  Attachment,
  AttachmentId,
  buildAttachment,
  buildMessage,
  buildRun,
  FileName,
  FileSize,
  GenerateAssistantMessage,
  MediaType,
  Message,
  MessageFields,
  type MessageId,
  Run,
  RunFields,
} from '@app-template/application/chat'
import {
  assistantMessageAt,
  type ChatRepositoryMocks,
  chatId,
  firstMessage,
  holdAssistantCall,
  layerChatTest,
  owner,
  queuedRun,
  recordMessageAssistant,
  userMessageAt,
} from '@app-template/application/chat/testing'
import {
  FileRepository,
  type MessageColumns,
  type RunEntitySet,
  type RunEntityWhere,
} from '@app-template/kernel/data'
import { LlmFailedError, LlmRefusedError } from '@app-template/kernel/llm/error'
import { decodeRowWith, encodeRowWith } from '@app-template/packages/db'
import { epoch, png, recordLogs } from '@app-template/packages/testing'

import { generateAssistantMessage } from '#use-cases/chat/generate-assistant-message.use-case'

const at = (millis: number) => DateTime.makeUnsafe(millis)

const sure = new AssistantReply({ text: 'Sure.' })

const whatIsThis = userMessageAt(1, 'What is this?')
const aPhoto = assistantMessageAt(2, 'A photo.')
const andAgain = userMessageAt(3, 'And again?')
const attachmentsOnly = userMessageAt(4, '')

/** The queued Run of `attachmentsOnly`, the history's last message. */
const lastRun = buildRun({
  id: queuedRun.id,
  chatId,
  userMessage: attachmentsOnly,
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

/** Stores the bytes of `attachment`, as its upload left them. */
const storeBytes = (attachment: Attachment) =>
  FileRepository.use((files) => files.insert({ ...attachment, content: Stream.make(png) }))

const elsewhereReply = assistantMessageAt(5, 'Done elsewhere.')

const doneElsewhere = new Run({
  ...queuedRun,
  status: 'done',
  assistantMessageId: Option.some(elsewhereReply.id),
  assistantMessage: Option.some(elsewhereReply),
})

/** A Run read that answers `reads` in turn, the last one from then on. */
const readsInTurn = (...reads: Arr.NonEmptyReadonlyArray<Run>) => {
  let turn = 0
  return () =>
    Effect.sync(() =>
      Arr.get(reads, turn++).pipe(Option.getOrElse(() => Arr.lastNonEmpty(reads))),
    ).pipe(
      Effect.flatMap((run) => encodeRowWith(Run)(run)),
      Effect.map(Option.some),
    )
}

/** The writes a reply makes, each as it was handed to its repository. */
interface Writes {
  readonly runs: Array<readonly [RunEntitySet, RunEntityWhere]>
  readonly messages: Array<MessageColumns>
}

const noWrites = (): Writes => ({ runs: [], messages: [] })

/** The reads of `run`'s chat holding `history`, every write kept in `writes`. */
const replyingTo = (
  writes: Writes,
  {
    runs,
    history = [firstMessage],
  }: { readonly runs: ReturnType<typeof readsInTurn>; readonly history?: ReadonlyArray<Message> },
): ChatRepositoryMocks => ({
  runs: {
    selectOne: runs,
    update: (...update) =>
      Effect.sync(() => {
        writes.runs.push(update)
      }),
  },
  messages: {
    selectMany: () => Effect.forEach(history, (message) => encodeRowWith(Message)(message)),
    insert: (row) =>
      Effect.sync(() => {
        writes.messages.push(row)
      }),
  },
})

/** Each Run write as the status its guard read, then the status it writes. */
const moves = (writes: Writes) =>
  Arr.map(writes.runs, ([set, where]) => `${where.status} → ${set.status}`)

/** The last Run write: its move, and its failure's reason when it fails the Run. */
const lastWrite = (writes: Writes) =>
  pipe(
    writes.runs,
    Arr.last,
    Option.map(([set, where]) => ({
      move: `${where.status} → ${set.status}`,
      reason: set.failure?.reason,
    })),
    Option.getOrThrow,
  )

const generate = generateAssistantMessage(new GenerateAssistantMessage({ runId: queuedRun.id }))

describe('generateAssistantMessage', () => {
  it.effect(
    "generate moves the Run through preparing and generating, then writes the assistant's message and done",
    () => {
      const held = holdAssistantCall()
      const slowReply = held.hold.pipe(Effect.andThen(Effect.sleep('1 second')), Effect.as(sure))
      const assistant = recordMessageAssistant(slowReply)
      const { logs, layer: logger } = recordLogs()
      const writes = noWrites()
      return Effect.gen(function* () {
        const running = yield* Effect.forkChild(generate)
        yield* held.asked
        const asked = moves(writes)
        yield* held.release
        yield* TestClock.adjust('500 millis')
        const halfway = moves(writes)
        yield* TestClock.adjust('500 millis')
        yield* Fiber.join(running)

        const generating = ['queued → preparing', 'preparing → generating']
        assert.deepStrictEqual(asked, generating)
        assert.deepStrictEqual(halfway, generating)
        const reply = yield* decodeRowWith(Schema.Array(MessageFields))(writes.messages).pipe(
          Effect.head,
        )
        const message = buildMessage({
          author: 'assistant',
          id: reply.id,
          chatId,
          text: 'Sure.',
          createdAt: at(1000),
        })
        assert.deepStrictEqual(writes.messages, [yield* encodeRowWith(MessageFields)(message)])
        const done = new Run({
          ...queuedRun,
          status: 'done',
          updatedAt: at(1000),
          assistantMessageId: Option.some(message.id),
          assistantMessage: Option.some(message),
        })
        assert.deepStrictEqual(writes.runs.at(-1), [
          yield* encodeRowWith(RunFields)(done),
          { id: queuedRun.id, status: ['generating'] },
        ])
        assert.deepStrictEqual(logs, [])
      }).pipe(
        Effect.provide([
          layerChatTest(replyingTo(writes, { runs: readsInTurn(queuedRun) })).pipe(
            Layer.provideMerge(assistant.layer),
          ),
          logger,
        ]),
      )
    },
  )

  it.effect('generate dies with the assistant and fails the Run it reads again first', () => {
    const assistant = recordMessageAssistant(Effect.die('provider exploded'))
    const { logs, layer: logger } = recordLogs('cause')
    const writes = noWrites()
    const generating = new Run({ ...queuedRun, status: 'generating' })
    return Effect.gen(function* () {
      const exit = yield* generate.pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assert.deepInclude(lastWrite(writes), { move: 'generating → failed', reason: 'ReplyFailed' })
      assert.include(String(logs[0]?.[2]), 'provider exploded')
    }).pipe(
      Effect.provide([
        layerChatTest(replyingTo(writes, { runs: readsInTurn(queuedRun, generating) })).pipe(
          Layer.provideMerge(assistant.layer),
        ),
        logger,
      ]),
    )
  })

  it.effect('generate interrupted while the assistant answers fails the Run it reads again', () => {
    const held = holdAssistantCall()
    const assistant = recordMessageAssistant(held.hold.pipe(Effect.as(sure)))
    const writes = noWrites()
    const generating = new Run({ ...queuedRun, status: 'generating' })
    return Effect.gen(function* () {
      const running = yield* Effect.forkChild(generate)
      yield* held.asked
      yield* Fiber.interrupt(running)

      assert.deepInclude(lastWrite(writes), { move: 'generating → failed', reason: 'ReplyFailed' })
    }).pipe(
      Effect.provide(
        layerChatTest(replyingTo(writes, { runs: readsInTurn(queuedRun, generating) })).pipe(
          Layer.provideMerge(assistant.layer),
        ),
      ),
    )
  })

  it.effect.each([{ status: 'preparing' }, { status: 'generating' }] as const)(
    'generate fails a $status Run a dead worker left, without asking the assistant',
    ({ status }) => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const writes = noWrites()
      return Effect.gen(function* () {
        yield* generate

        assert.deepStrictEqual(moves(writes), [`${status} → failed`])
        assert.strictEqual(lastWrite(writes).reason, 'ReplyFailed')
        assertEquals(yield* assistant.histories, [])
      }).pipe(
        Effect.provide(
          layerChatTest(
            replyingTo(writes, { runs: readsInTurn(new Run({ ...queuedRun, status })) }),
          ).pipe(Layer.provideMerge(assistant.layer)),
        ),
      )
    },
  )

  it.effect.each([
    {
      error: new LlmRefusedError({ cause: 'stop_reason refusal' }),
      reason: 'ReplyRefused',
    },
    { error: new LlmFailedError({ cause: '401 invalid x-api-key' }), reason: 'ReplyFailed' },
  ] as const)(
    "generate fails the Run with $reason after one call, logs the error's cause and writes no reply",
    ({ error, reason }) => {
      const assistant = recordMessageAssistant(Effect.fail(error))
      const { logs, layer: logger } = recordLogs('reason', 'cause')
      const writes = noWrites()
      return Effect.gen(function* () {
        yield* generate

        assert.deepStrictEqual(lastWrite(writes), { move: 'generating → failed', reason })
        assert.deepStrictEqual(logs, [['Warn', 'assistant reply failed', reason, error.cause]])
        assert.strictEqual((yield* assistant.histories).length, 1)
        assert.deepStrictEqual(writes.messages, [])
      }).pipe(
        Effect.provide([
          layerChatTest(replyingTo(writes, { runs: readsInTurn(queuedRun) })).pipe(
            Layer.provideMerge(assistant.layer),
          ),
          logger,
        ]),
      )
    },
  )

  it.effect(
    "generate prompts with the chat's messages in order and the bytes of their attachments",
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const withPhoto = new Message({ ...whatIsThis, attachments: [photo] })
      const withSketch = new Message({ ...attachmentsOnly, attachments: [sketch] })
      return Effect.gen(function* () {
        yield* Effect.forEach([photo, sketch], storeBytes)

        yield* generate

        assertEquals(yield* assistant.histories, [
          [
            { message: withPhoto, attachments: [{ attachment: photo, bytes: png }] },
            { message: aPhoto, attachments: [] },
            { message: andAgain, attachments: [] },
            { message: withSketch, attachments: [{ attachment: sketch, bytes: png }] },
          ],
        ])
      }).pipe(
        Effect.provide(
          layerChatTest(
            replyingTo(noWrites(), {
              runs: readsInTurn(lastRun),
              history: [withPhoto, aPhoto, andAgain, withSketch],
            }),
          ).pipe(Layer.provideMerge(assistant.layer)),
        ),
      )
    },
  )

  it.effect("generate prompts with the bytes a record's source holds", () => {
    const assistant = recordMessageAssistant(Effect.succeed(sure))
    const source = new Attachment({
      ...sketch,
      id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000042'),
      messageId: Option.none(),
      chatId: Option.none(),
    })
    const record = new Attachment({ ...sketch, sourceId: Option.some(source.id) })
    const withRecord = new Message({ ...attachmentsOnly, attachments: [record] })
    return Effect.gen(function* () {
      // A record stores no bytes under its own id.
      yield* storeBytes(source)

      yield* generate

      assertEquals(yield* assistant.histories, [
        [{ message: withRecord, attachments: [{ attachment: record, bytes: png }] }],
      ])
    }).pipe(
      Effect.provide(
        layerChatTest(
          replyingTo(noWrites(), { runs: readsInTurn(lastRun), history: [withRecord] }),
        ).pipe(Layer.provideMerge(assistant.layer)),
      ),
    )
  })

  it.effect(
    "generate prompts without an attachment whose bytes are gone and logs a warning with its, the chat's and the Run's ids",
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const { logs, layer: logger } = recordLogs('attachmentId', 'chatId', 'runId')
      const withSketch = new Message({ ...attachmentsOnly, attachments: [sketch] })
      return Effect.gen(function* () {
        yield* generate

        assertEquals(yield* assistant.histories, [[{ message: withSketch, attachments: [] }]])
        assert.deepStrictEqual(logs, [
          ['Warn', 'attachment skipped: file missing', sketch.id, chatId, queuedRun.id],
        ])
      }).pipe(
        Effect.provide([
          layerChatTest(
            replyingTo(noWrites(), { runs: readsInTurn(lastRun), history: [withSketch] }),
          ).pipe(Layer.provideMerge(assistant.layer)),
          logger,
        ]),
      )
    },
  )

  it.effect(
    'generate dies on a done write the store refuses, and skips the Run it then reads settled',
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const { logs, layer: logger } = recordLogs()
      const writes = noWrites()
      const mocks = replyingTo(writes, { runs: readsInTurn(queuedRun, doneElsewhere) })
      return Effect.gen(function* () {
        const exit = yield* generate.pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(moves(writes), ['queued → preparing', 'preparing → generating'])
        assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
      }).pipe(
        Effect.provide([
          layerChatTest({
            ...mocks,
            runs: {
              ...mocks.runs,
              update: (set, where) =>
                set.status === 'done'
                  ? Effect.die('no run was updated')
                  : Effect.sync(() => {
                      writes.runs.push([set, where])
                    }),
            },
          }).pipe(Layer.provideMerge(assistant.layer)),
          logger,
        ]),
      )
    },
  )

  it.effect('generate skips a Run settled before it, without asking the assistant', () => {
    const assistant = recordMessageAssistant(Effect.succeed(sure))
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* generate

      assertEquals(yield* assistant.histories, [])
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(
      Effect.provide([
        layerChatTest({ runs: { selectOne: readsInTurn(doneElsewhere) } }).pipe(
          Layer.provideMerge(assistant.layer),
        ),
        logger,
      ]),
    )
  })

  it.effect(
    'generate skips a Run the store finds none of, as for a deleted chat, without asking',
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sure))
      const { logs, layer: logger } = recordLogs()
      return Effect.gen(function* () {
        yield* generate

        assertEquals(yield* assistant.histories, [])
        assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
      }).pipe(
        Effect.provide([
          layerChatTest({ runs: { selectOne: () => Effect.succeedNone } }).pipe(
            Layer.provideMerge(assistant.layer),
          ),
          logger,
        ]),
      )
    },
  )
})
