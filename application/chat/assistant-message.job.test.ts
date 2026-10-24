import { assert, describe, it } from '@effect/vitest'
import {
  Array as Arr,
  DateTime,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Record as Rec,
  Stream,
} from 'effect'
import { AiError, Prompt, type Response } from 'effect/ai'
import { TestClock } from 'effect/testing'

import {
  Attachment,
  AttachmentId,
  AttachmentRepository,
  AttachmentStore,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import {
  buildAssistantMessage,
  buildChat,
  buildUserMessage,
  Chat,
  type ChatId,
  ChatRepository,
  ChatTitle,
  Message,
  MessageFailure,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import {
  assistantMessageQueue,
  ChatRepositoryPg,
  GenerateAssistantMessage,
  MessageRepositoryPg,
} from '@app-template/infrastructure/chat'
import type { AttemptInfo } from '@app-template/queue'
import { describeOnMiniStack, png, recordLogs } from '@app-template/testing'

import { AssistantMessageJob } from '#application/chat/assistant-message.job'
import { chatId, epoch, messageId, sentAt } from '#application/testing/chat.fixture'
import {
  AttachmentStoreOwnBucket,
  DbWithUsers,
  startClockAtSend,
} from '#application/testing/chat.harness'
import {
  holdModelCall,
  type ModelCallHold,
  recordLanguageModel,
} from '#application/testing/language-model.fake'
import { owner } from '#application/testing/user.fixture'

const historyId = (n: number) => MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`)
const photoId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000040')
const sketchId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000041')

type Part = Response.StreamPartEncoded

/**
 * The repositories on a fresh test database; the attachment store on a bucket of the test's own.
 * Both halves name `DbWithUsers`, which one build makes once, so they share its database.
 */
const storesPg = {
  messages: MessageRepositoryPg.pipe(Layer.provide(DbWithUsers)),
  chatsAndAttachments: Layer.mergeAll(
    ChatRepositoryPg,
    AttachmentRepositoryPg,
    AttachmentStoreOwnBucket,
  ).pipe(Layer.provide(DbWithUsers)),
}

/**
 * The repositories in maps, so the `TestClock` can step the job: only the methods a reply that
 * reads no attachment calls.
 */
const makeStoresMemory = () => {
  const chats = new Map<ChatId, Chat>()
  const messages = new Map<MessageId, Message>()
  const putChat = (chat: Chat) =>
    Effect.sync(() => {
      chats.set(chat.id, chat)
    })
  const putMessage = (message: Message) =>
    Effect.sync(() => {
      messages.set(message.id, message)
    })
  return {
    messages: Layer.mock(MessageRepository, {
      insert: putMessage,
      update: putMessage,
      selectById: (id) => Effect.sync(() => Option.fromUndefinedOr(messages.get(id))),
      selectByChat: (chatId) =>
        Effect.sync(() =>
          Arr.filter([...messages.values()], (message) => message.chatId === chatId),
        ),
    }),
    chatsAndAttachments: Layer.mergeAll(
      Layer.mock(ChatRepository, {
        insert: putChat,
        update: putChat,
        selectById: (id) => Effect.sync(() => Option.fromUndefinedOr(chats.get(id))),
      }),
      Layer.mock(AttachmentRepository, {}),
      Layer.mock(AttachmentStore, {}),
    ),
  }
}

/** The job's services over `stores`, recording its message writes, its prompts and its logs. */
const makeAssistantMessageHarness = <E, R>(
  stream: Stream.Stream<Part, AiError.AiError>,
  stores: {
    readonly messages: Layer.Layer<MessageRepository, E, R>
    readonly chatsAndAttachments: Layer.Layer<
      ChatRepository | AttachmentRepository | AttachmentStore,
      E,
      R
    >
  },
) => {
  const writes: Array<Message> = []
  const messages = Layer.effect(
    MessageRepository,
    Effect.map(MessageRepository, (inner) =>
      MessageRepository.of({
        ...inner,
        update: (message) =>
          Effect.andThen(
            Effect.sync(() => writes.push(message)),
            inner.update(message),
          ),
      }),
    ),
  ).pipe(Layer.provide(stores.messages))
  const { prompts, layer: model } = recordLanguageModel({ streamText: stream })
  const { logs, layer: logger } = recordLogs()
  const layer = Layer.mergeAll(messages, stores.chatsAndAttachments, model, logger)
  return { writes, prompts, logs, layer }
}

const delta = (text: string): Part => ({ type: 'text-delta', id: 'reply', delta: text })

// At once: a test on Postgres never steps the clock, so no snapshot past the first pass lands.
const replyDeltas = Stream.make(delta('Hel'), delta('lo, '), delta('world'))

// Three deltas 120 ms apart: the default 300 ms snapshot sees the first two.
const threeDeltas = Stream.make(delta('Hel'), delta('lo, '), delta('world')).pipe(
  Stream.tap(() => Effect.sleep('120 millis')),
)

// The job asks for the stream after its `generating` write.
const heldDeltas = (held: ModelCallHold) =>
  Stream.fromEffect(held.hold).pipe(Stream.drain, Stream.concat(replyDeltas))

const lastAttempt = assistantMessageQueue.maxAttempts

const attempts = {
  'an attempt': 1,
  'the last attempt': lastAttempt,
} as const

const providerError = AiError.make({
  module: 'FakeProvider',
  method: 'streamText',
  reason: new AiError.UnknownError({ description: 'provider exploded' }),
})

const failingAtOnce = Stream.make(delta('Hel')).pipe(Stream.concat(Stream.fail(providerError)))

// A delta at 120 ms, which the 300 ms snapshot writes, then the provider fails at 520 ms.
const failingMidway = Stream.make(delta('Hel')).pipe(
  Stream.tap(() => Effect.sleep('120 millis')),
  Stream.concat(Stream.fromEffect(Effect.sleep('400 millis')).pipe(Stream.drain)),
  Stream.concat(Stream.fail(providerError)),
)

const queuedReply = buildAssistantMessage({ id: messageId, chatId, createdAt: epoch })

const asCompleted = (message: Message, text: string) =>
  new Message({ ...message, stage: 'completed', text })

const arrangeChat = (reply: Message = queuedReply, history: ReadonlyArray<Message> = []) =>
  Effect.gen(function* () {
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
    yield* chats.insert(buildChat({ id: chatId, userId: owner, createdAt: epoch }))
    yield* Effect.forEach(Arr.append(history, reply), messages.insert, { discard: true })
    return reply
  })

const buildImage = (
  id: AttachmentId,
  { name, boundTo }: { readonly name: string; readonly boundTo: MessageId },
) =>
  new Attachment({
    ...buildAttachment({
      id,
      userId: owner,
      fileName: FileName.make(name),
      mediaType: MediaType.make('image/png'),
      size: FileSize.make(png.length),
      createdAt: epoch,
    }),
    messageId: Option.some(boundTo),
  })

const photo = buildImage(photoId, { name: 'photo.png', boundTo: historyId(1) })

const sketch = buildImage(sketchId, { name: 'sketch.png', boundTo: historyId(5) })

const arrangeAttachment = (attachment: Attachment, bytes: 'stored' | 'lost' = 'stored') =>
  Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const store = yield* AttachmentStore

    yield* attachments.insert(attachment)
    if (bytes === 'lost') return
    yield* store.insert(attachment.id, Stream.make(png), attachment)
  })

// A second apart: messages sharing a `createdAt` come back in no defined order.
const sentAfter = (n: number) => DateTime.addDuration(epoch, Duration.seconds(n))

const user = (n: number, text: string, attachmentIds: ReadonlyArray<AttachmentId> = []) =>
  buildUserMessage({ id: historyId(n), chatId, text, attachmentIds, createdAt: sentAfter(n) })

const assistant = (n: number) =>
  buildAssistantMessage({ id: historyId(n), chatId, createdAt: sentAfter(n) })

const failure = new MessageFailure({ reason: 'ReplyFailed', message: 'Sorry.', cause: 'boom' })

const history = [
  user(1, 'What is this?', [photoId]),
  asCompleted(assistant(2), 'A photo.'),
  user(3, 'And again?'),
  new Message({ ...assistant(4), stage: 'failed', text: 'half', error: Option.some(failure) }),
  user(5, '', [sketchId]),
]

const selectReply = Effect.flatMap(MessageRepository, (messages) =>
  messages.selectById(messageId),
).pipe(Effect.map(Option.getOrThrow))

const selectChat = Effect.flatMap(ChatRepository, (chats) => chats.selectById(chatId)).pipe(
  Effect.map(Option.getOrThrow),
)

const buildAttemptInfo = (attempt: number): AttemptInfo => ({
  attempt,
  maxAttempts: assistantMessageQueue.maxAttempts,
  isLastAttempt: attempt >= assistantMessageQueue.maxAttempts,
})

const queuedJob = new GenerateAssistantMessage({ chatId, messageId })

const handleAttempt = (attempt: number) =>
  Effect.exit(AssistantMessageJob.handle(queuedJob, buildAttemptInfo(attempt)))

/** Runs the handler as `attempt` to its end, the `TestClock` moving its sleeps along. */
const runAttemptOnClock = (attempt: number) =>
  Effect.gen(function* () {
    const running = yield* Effect.forkChild(handleAttempt(attempt))
    yield* TestClock.adjust('1 minute')
    return yield* Fiber.join(running)
  })

const deletions = {
  'the chat': Effect.flatMap(ChatRepository, (chats) => chats.delete(chatId)),
  'the chat and its messages': Effect.all([
    Effect.flatMap(MessageRepository, (messages) => messages.deleteByChat(chatId)),
    Effect.flatMap(ChatRepository, (chats) => chats.delete(chatId)),
  ]),
} as const

const stagesOf = (writes: ReadonlyArray<Message>) =>
  Arr.dedupeAdjacent(Arr.map(writes, (message) => message.stage))

const snapshotsOf = (writes: ReadonlyArray<Message>) =>
  Arr.map(writes, (message) => [message.stage, message.text])

const timesOf = (writes: ReadonlyArray<Message>) =>
  Arr.map(writes, (message) => DateTime.toEpochMillis(message.updatedAt))

describeOnMiniStack('AssistantMessageJob.handle', (it) => {
  it.effect('prepares, generates, then completes the reply and bumps the chat', () => {
    const { writes, layer } = makeAssistantMessageHarness(replyDeltas, storesPg)
    return Effect.gen(function* () {
      yield* startClockAtSend
      yield* arrangeChat()

      yield* handleAttempt(1)

      assert.deepStrictEqual(stagesOf(writes), ['preparing', 'generating', 'completed'])
      const completed = yield* selectReply
      assert.strictEqual(completed.text, 'Hello, world')
      assert.deepStrictEqual([completed.updatedAt, (yield* selectChat).updatedAt], [sentAt, sentAt])
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    'prompts with every completed message in order, with a file part per attachment',
    () => {
      const { prompts, layer } = makeAssistantMessageHarness(replyDeltas, storesPg)
      return Effect.gen(function* () {
        yield* arrangeChat(queuedReply, history)
        yield* arrangeAttachment(photo)
        yield* arrangeAttachment(sketch)

        yield* handleAttempt(1)

        const file = (fileName: string) =>
          ({ type: 'file', mediaType: 'image/png', fileName, data: png }) as const
        const expected = Prompt.make([
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is this?' }, file('photo.png')],
          },
          { role: 'assistant', content: [{ type: 'text', text: 'A photo.' }] },
          { role: 'user', content: [{ type: 'text', text: 'And again?' }] },
          { role: 'user', content: [file('sketch.png')] },
        ])
        assert.deepStrictEqual(
          Arr.map(prompts, (prompt) => prompt.content),
          [expected.content],
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('prompts with the text alone when an attachment has lost its bytes', () => {
    const { prompts, layer } = makeAssistantMessageHarness(replyDeltas, storesPg)
    return Effect.gen(function* () {
      yield* arrangeChat(queuedReply, [user(1, 'What is this?', [photoId])])
      yield* arrangeAttachment(photo, 'lost')

      yield* handleAttempt(1)

      const expected = Prompt.make([
        { role: 'user', content: [{ type: 'text', text: 'What is this?' }] },
      ])
      assert.deepStrictEqual(
        Arr.map(prompts, (prompt) => prompt.content),
        [expected.content],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(Rec.keys(deletions))(
    'ends with a log line and no write when %s is deleted before the take',
    (deleted) => {
      const { writes, prompts, logs, layer } = makeAssistantMessageHarness(replyDeltas, storesPg)
      return Effect.gen(function* () {
        yield* arrangeChat()
        yield* deletions[deleted]

        yield* handleAttempt(1)

        assert.deepStrictEqual(writes, [])
        assert.deepStrictEqual(prompts, [])
        assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect.each(Rec.keys(attempts))(
    'ends without a write when the reply is already settled on %s',
    (attempt) => {
      const { writes, prompts, logs, layer } = makeAssistantMessageHarness(replyDeltas, storesPg)
      return Effect.gen(function* () {
        yield* arrangeChat(asCompleted(queuedReply, 'Done.'))

        yield* handleAttempt(attempts[attempt])

        assert.deepStrictEqual(writes, [])
        assert.deepStrictEqual(prompts, [])
        assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('keeps a rename made while the reply streams when it bumps the chat', () => {
    const held = holdModelCall()
    const { writes, layer } = makeAssistantMessageHarness(heldDeltas(held), storesPg)
    return Effect.gen(function* () {
      const chats = yield* ChatRepository
      yield* startClockAtSend
      yield* arrangeChat()

      const running = yield* Effect.forkChild(handleAttempt(1))
      yield* held.asked
      assert.deepStrictEqual(snapshotsOf(writes), [
        ['preparing', ''],
        ['generating', ''],
      ])
      yield* chats.update(
        new Chat({ ...(yield* selectChat), title: Option.some(ChatTitle.make('Trip')) }),
      )
      yield* held.release
      yield* Fiber.join(running)

      const chat = yield* selectChat
      assert.deepStrictEqual(
        [chat.title, chat.updatedAt],
        [Option.some(ChatTitle.make('Trip')), sentAt],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect('fails every attempt and, on the last, fails the message with its cause', () => {
    const { writes, prompts, logs, layer } = makeAssistantMessageHarness(failingAtOnce, storesPg)
    return Effect.gen(function* () {
      yield* startClockAtSend
      yield* arrangeChat()

      const exits = yield* Effect.forEach(Arr.range(1, lastAttempt), handleAttempt)

      assert.deepStrictEqual(Arr.map(exits, Exit.isSuccess), [false, false, false])
      const attempt = ['preparing', 'generating']
      assert.deepStrictEqual(stagesOf(writes), [...attempt, ...attempt, ...attempt, 'failed'])
      assert.strictEqual(prompts.length, 3)
      const failed = yield* selectReply
      const error = Option.getOrThrow(failed.error)
      assert.deepStrictEqual(
        [error.reason, error.message],
        ['ReplyFailed', 'The assistant could not reply. Please try again.'],
      )
      assert.include(error.cause, 'provider exploded')
      assert.deepStrictEqual([failed.updatedAt, (yield* selectChat).updatedAt], [sentAt, sentAt])
      assert.deepStrictEqual(logs, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect('fails the reply when its worker stops during the last attempt', () => {
    const held = holdModelCall()
    const { writes, layer } = makeAssistantMessageHarness(heldDeltas(held), storesPg)
    return Effect.gen(function* () {
      yield* startClockAtSend
      yield* arrangeChat()

      const running = yield* Effect.forkChild(handleAttempt(lastAttempt))
      yield* held.asked
      yield* Fiber.interrupt(running)

      assert.deepStrictEqual(snapshotsOf(writes), [
        ['preparing', ''],
        ['generating', ''],
        ['failed', ''],
      ])
      const failed = yield* selectReply
      assert.strictEqual(Option.getOrThrow(failed.error).reason, 'ReplyFailed')
      assert.deepStrictEqual([failed.updatedAt, (yield* selectChat).updatedAt], [sentAt, sentAt])
    }).pipe(Effect.provide(layer))
  })
})

describe('AssistantMessageJob.handle on the TestClock', () => {
  it.effect('writes a snapshot every 300 ms and completes and bumps the chat at the end', () => {
    const { writes, layer } = makeAssistantMessageHarness(threeDeltas, makeStoresMemory())
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* runAttemptOnClock(1)

      assert.deepStrictEqual(snapshotsOf(writes), [
        ['preparing', ''],
        ['generating', ''],
        ['generating', 'Hello, '],
        ['completed', 'Hello, world'],
      ])
      assert.deepStrictEqual(timesOf(writes), [0, 0, 300, 360])
      assert.strictEqual(DateTime.toEpochMillis((yield* selectChat).updatedAt), 360)
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    'fails the message with its last snapshot text and bumps the chat at that write',
    () => {
      const { writes, layer } = makeAssistantMessageHarness(failingMidway, makeStoresMemory())
      return Effect.gen(function* () {
        yield* arrangeChat()

        yield* Effect.forEach(Arr.range(1, lastAttempt), runAttemptOnClock)

        const attempt = [
          ['preparing', ''],
          ['generating', ''],
          ['generating', 'Hel'],
        ]
        assert.deepStrictEqual(snapshotsOf(writes), [
          ...attempt,
          ...attempt,
          ...attempt,
          ['failed', 'Hel'],
        ])
        // Each attempt starts a minute after the last.
        assert.deepStrictEqual(
          timesOf(writes),
          [0, 0, 300, 60_000, 60_000, 60_300, 120_000, 120_000, 120_300, 120_520],
        )
        const chat = yield* selectChat
        assert.strictEqual(DateTime.toEpochMillis(chat.updatedAt), 120_520)
      }).pipe(Effect.provide(layer))
    },
  )
})
