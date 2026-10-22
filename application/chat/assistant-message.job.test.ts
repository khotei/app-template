import { assert, describe, it, layer } from '@effect/vitest'
import {
  Array as Arr,
  DateTime,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Predicate,
  Record as Rec,
  Schedule,
  Stream,
} from 'effect'
import { AiError, Prompt, type Response } from 'effect/ai'
import { KeyValueStore } from 'effect/persistence'
import { TestClock } from 'effect/testing'

import {
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
  ChatRepository,
  ChatTitle,
  isActiveMessage,
  Message,
  MessageFailure,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import { AttachmentRepositoryKv, AttachmentStoreKv } from '@app-template/infrastructure/attachment'
import {
  assistantMessageQueue,
  ChatRepositoryKv,
  GenerateAssistantMessage,
  MessageRepositoryKv,
} from '@app-template/infrastructure/chat'
import type { AttemptInfo } from '@app-template/queue'
import { png, recordLogs } from '@app-template/testing'

import { AssistantMessageJob } from '#application/chat/assistant-message.job'
import { chatId, epoch, messageId } from '#application/testing/chat.fixture'
import { recordLanguageModel } from '#application/testing/language-model.fake'
import { QueueClientMiniStack } from '#application/testing/queue.harness'
import { owner } from '#application/testing/user.fixture'

const historyId = (n: number) => MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`)
const photoId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000040')

type Part = Response.StreamPartEncoded

/**
 * The job's services over memory adapters, recording its message writes, its prompts and its
 * logs.
 */
const makeAssistantMessageHarness = (stream: Stream.Stream<Part, AiError.AiError>) => {
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
  ).pipe(Layer.provide(MessageRepositoryKv))
  const { prompts, layer: model } = recordLanguageModel({ streamText: stream })
  const { logs, layer: logger } = recordLogs()
  const layer = Layer.mergeAll(
    ChatRepositoryKv,
    messages,
    AttachmentRepositoryKv,
    AttachmentStoreKv,
    model,
    logger,
  ).pipe(Layer.provide(KeyValueStore.layerMemory))
  return { writes, prompts, logs, layer }
}

const delta = (text: string): Part => ({ type: 'text-delta', id: 'reply', delta: text })

// Three deltas 120 ms apart: the default 300 ms snapshot sees the first two.
const threeDeltas = Stream.make(delta('Hel'), delta('lo, '), delta('world')).pipe(
  Stream.tap(() => Effect.sleep('120 millis')),
)

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

// A delta the snapshot writes, then the provider fails.
const failingMidway = Stream.make(delta('Hel')).pipe(
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

const photo = buildAttachment({
  id: photoId,
  userId: owner,
  fileName: FileName.make('photo.png'),
  mediaType: MediaType.make('image/png'),
  size: FileSize.make(png.length),
  createdAt: epoch,
})

const arrangePhoto = Effect.gen(function* () {
  const attachments = yield* AttachmentRepository
  const store = yield* AttachmentStore
  yield* attachments.insert(photo)
  yield* store.insert(photoId, Stream.make(png), photo)
})

const user = (n: number, text: string, attachmentIds: ReadonlyArray<AttachmentId> = []) =>
  buildUserMessage({ id: historyId(n), chatId, text, attachmentIds, createdAt: epoch })

const assistant = (n: number) =>
  buildAssistantMessage({ id: historyId(n), chatId, createdAt: epoch })

const failure = new MessageFailure({ reason: 'ReplyFailed', message: 'Sorry.', cause: 'boom' })

const history = [
  user(1, 'What is this?', [photoId]),
  asCompleted(assistant(2), 'A photo.'),
  user(3, 'And again?'),
  new Message({ ...assistant(4), stage: 'failed', text: 'half', error: Option.some(failure) }),
  user(5, '', [photoId]),
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

const startAttempt = (attempt: number) =>
  Effect.forkChild(Effect.exit(AssistantMessageJob.handle(queuedJob, buildAttemptInfo(attempt))))

/** Runs the handler as `attempt` to its end, the `TestClock` moving its sleeps along. */
const runAttempt = (attempt: number) =>
  Effect.gen(function* () {
    const running = yield* startAttempt(attempt)
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
  Arr.map(writes, (message) => [message.stage, message.text])

const timesOf = (writes: ReadonlyArray<Message>) =>
  Arr.map(writes, (message) => DateTime.toEpochMillis(message.updatedAt))

describe('AssistantMessageJob.handle', () => {
  it.effect('prepares, generates in throttled snapshots, then completes and bumps the chat', () => {
    const { writes, layer } = makeAssistantMessageHarness(threeDeltas)
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* runAttempt(1)

      assert.deepStrictEqual(stagesOf(writes), [
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
    'prompts with every completed message in order, with a file part per attachment',
    () => {
      const { prompts, layer } = makeAssistantMessageHarness(threeDeltas)
      return Effect.gen(function* () {
        yield* arrangePhoto
        yield* arrangeChat(queuedReply, history)

        yield* runAttempt(1)

        const photo = {
          type: 'file',
          mediaType: 'image/png',
          fileName: 'photo.png',
          data: png,
        } as const
        const expected = Prompt.make([
          { role: 'user', content: [{ type: 'text', text: 'What is this?' }, photo] },
          { role: 'assistant', content: [{ type: 'text', text: 'A photo.' }] },
          { role: 'user', content: [{ type: 'text', text: 'And again?' }] },
          { role: 'user', content: [photo] },
        ])
        assert.deepStrictEqual(
          Arr.map(prompts, (prompt) => prompt.content),
          [expected.content],
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('prompts with the text alone when an attachment has lost its bytes', () => {
    const { prompts, layer } = makeAssistantMessageHarness(threeDeltas)
    return Effect.gen(function* () {
      yield* (yield* AttachmentRepository).insert(photo)
      yield* arrangeChat(queuedReply, [user(1, 'What is this?', [photoId])])

      yield* runAttempt(1)

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
      const { writes, prompts, logs, layer } = makeAssistantMessageHarness(threeDeltas)
      return Effect.gen(function* () {
        yield* arrangeChat()
        yield* deletions[deleted]

        yield* runAttempt(1)

        assert.deepStrictEqual(writes, [])
        assert.deepStrictEqual(prompts, [])
        assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect.each(Rec.keys(attempts))(
    'ends without a write when the reply is already settled on %s',
    (attempt) => {
      const { writes, prompts, logs, layer } = makeAssistantMessageHarness(threeDeltas)
      return Effect.gen(function* () {
        yield* arrangeChat(asCompleted(queuedReply, 'Done.'))

        yield* runAttempt(attempts[attempt])

        assert.deepStrictEqual(writes, [])
        assert.deepStrictEqual(prompts, [])
        assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('keeps a rename made while the reply streams when it bumps the chat', () => {
    const { writes, layer } = makeAssistantMessageHarness(threeDeltas)
    return Effect.gen(function* () {
      const chats = yield* ChatRepository
      yield* arrangeChat()

      const running = yield* startAttempt(1)
      yield* TestClock.adjust('200 millis')
      assert.deepStrictEqual(stagesOf(writes), [
        ['preparing', ''],
        ['generating', ''],
      ])
      yield* chats.update(
        new Chat({ ...(yield* selectChat), title: Option.some(ChatTitle.make('Trip')) }),
      )
      yield* TestClock.adjust('1 minute')
      yield* Fiber.join(running)

      const chat = yield* selectChat
      assert.deepStrictEqual(
        [chat.title, DateTime.toEpochMillis(chat.updatedAt)],
        [Option.some(ChatTitle.make('Trip')), 360],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect('fails every attempt and, on the last, fails the message with its cause', () => {
    const { writes, prompts, logs, layer } = makeAssistantMessageHarness(failingMidway)
    return Effect.gen(function* () {
      yield* arrangeChat()

      const exits = yield* Effect.forEach(Arr.range(1, lastAttempt), runAttempt)

      assert.deepStrictEqual(Arr.map(exits, Exit.isSuccess), [false, false, false])
      const attempt = [
        ['preparing', ''],
        ['generating', ''],
        ['generating', 'Hel'],
      ]
      assert.deepStrictEqual(stagesOf(writes), [
        ...attempt,
        ...attempt,
        ...attempt,
        ['failed', 'Hel'],
      ])
      assert.strictEqual(prompts.length, 3)
      const failed = yield* selectReply
      const error = Option.getOrThrow(failed.error)
      assert.deepStrictEqual(
        [error.reason, error.message],
        ['ReplyFailed', 'The assistant could not reply. Please try again.'],
      )
      assert.include(error.cause, 'provider exploded')
      assert.deepStrictEqual((yield* selectChat).updatedAt, failed.updatedAt)
      assert.deepStrictEqual(logs, [])
    }).pipe(Effect.provide(layer))
  })

  it.effect('fails the reply when its worker stops during the last attempt', () => {
    const { writes, layer } = makeAssistantMessageHarness(threeDeltas)
    return Effect.gen(function* () {
      yield* arrangeChat()

      const running = yield* startAttempt(lastAttempt)
      yield* TestClock.adjust('200 millis')
      yield* Fiber.interrupt(running)

      assert.deepStrictEqual(stagesOf(writes), [
        ['preparing', ''],
        ['generating', ''],
        ['failed', ''],
      ])
      const failed = yield* selectReply
      assert.strictEqual(Option.getOrThrow(failed.error).reason, 'ReplyFailed')
      assert.deepStrictEqual((yield* selectChat).updatedAt, failed.updatedAt)
    }).pipe(Effect.provide(layer))
  })
})

const onSqs = makeAssistantMessageHarness(threeDeltas)

const layerOnSqs = Layer.mergeAll(AssistantMessageJob.layer, onSqs.layer).pipe(
  Layer.provideMerge(QueueClientMiniStack),
)

const selectSettledReply = Effect.repeat(selectReply, {
  until: Predicate.not(isActiveMessage),
  schedule: Schedule.spaced('50 millis'),
})

layer(layerOnSqs, { timeout: '60 seconds', excludeTestServices: true })(
  'AssistantMessageJob on SQS',
  (it) => {
    it.effect('the worker settles a reply enqueued on the queue', () =>
      Effect.gen(function* () {
        const reply = yield* arrangeChat()
        yield* Layer.build(AssistantMessageJob.worker)

        yield* (yield* AssistantMessageJob).enqueue(reply)

        const settled = yield* selectSettledReply
        assert.deepStrictEqual(stagesOf([settled]), [['completed', 'Hello, world']])
      }),
    )
  },
)
