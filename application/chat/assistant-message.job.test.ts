import { assert, describe, it } from '@effect/vitest'
import {
  Array as Arr,
  DateTime,
  Effect,
  Layer,
  Logger,
  Option,
  Record as Rec,
  Stream,
} from 'effect'
import { type AiError, LanguageModel, Prompt, type Response } from 'effect/ai'
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
  ChatId,
  ChatRepository,
  Message,
  MessageFailure,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { AttachmentRepositoryKv, AttachmentStoreKv } from '@app-template/infrastructure/attachment'
import { ChatRepositoryKv, MessageRepositoryKv } from '@app-template/infrastructure/chat'
import { QueueClient } from '@app-template/queue'

import { AssistantMessageJob } from '#application/chat/assistant-message.job'

const owner = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000020')
const replyId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')
const historyId = (n: number) => MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`)
const photoId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000040')
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
const epoch = DateTime.makeUnsafe(0)

type Part = Response.StreamPartEncoded

const layerJob = (options: {
  readonly model: Layer.Layer<LanguageModel.LanguageModel>
  readonly messages: typeof MessageRepositoryKv
  readonly logger: Layer.Layer<never>
}) =>
  Layer.mergeAll(
    AssistantMessageJob.layer,
    ChatRepositoryKv,
    options.messages,
    AttachmentRepositoryKv,
    AttachmentStoreKv,
    options.model,
    options.logger,
  ).pipe(Layer.provideMerge(QueueClient.layerMemory), Layer.provide(KeyValueStore.layerMemory))

/** The job over memory adapters, recording its message writes, its prompts and its logs. */
const makeHarness = (stream: Stream.Stream<Part, AiError.AiError>) => {
  const writes: Array<Message> = []
  const prompts: Array<Prompt.Prompt> = []
  const logs: Array<readonly [level: string, message: unknown]> = []
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
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.die('generateText is not used by the reply'),
      streamText: (options) => {
        prompts.push(options.prompt)
        return stream
      },
    }),
  )
  const logger = Logger.layer([
    Logger.make<unknown, void>(({ logLevel, message }) => {
      logs.push([logLevel, Array.isArray(message) ? message[0] : message])
    }),
  ])
  return { writes, prompts, logs, layer: layerJob({ model, messages, logger }) }
}

const delta = (text: string): Part => ({ type: 'text-delta', id: 'reply', delta: text })

// Three deltas 120 ms apart: the default 300 ms snapshot sees the first two.
const threeDeltas = Stream.make(delta('Hel'), delta('lo, '), delta('world')).pipe(
  Stream.tap(() => Effect.sleep('120 millis')),
)

const queuedReply = buildAssistantMessage({ id: replyId, chatId, createdAt: epoch })

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
  yield* store.insert(photoId, png)
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

const selectChat = Effect.flatMap(ChatRepository, (chats) => chats.selectById(chatId)).pipe(
  Effect.map(Option.getOrThrow),
)

// One second at a time, so a retry is due whether its delay started before or after an advance.
const startWorker = Layer.build(AssistantMessageJob.worker).pipe(
  Effect.andThen(Effect.repeat(TestClock.adjust('1 second'), { times: 59 })),
  Effect.scoped,
)

const enqueue = (reply: Message) => Effect.flatMap(AssistantMessageJob, (job) => job.enqueue(reply))

const runWorker = (reply: Message) => Effect.andThen(enqueue(reply), startWorker)

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

describe('AssistantMessageJob.worker', () => {
  it.effect('prepares, generates in throttled snapshots, then completes and bumps the chat', () => {
    const { writes, layer } = makeHarness(threeDeltas)
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat())

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
      const { prompts, layer } = makeHarness(threeDeltas)
      return Effect.gen(function* () {
        yield* arrangePhoto

        yield* runWorker(yield* arrangeChat(queuedReply, history))

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
    const { prompts, layer } = makeHarness(threeDeltas)
    return Effect.gen(function* () {
      yield* (yield* AttachmentRepository).insert(photo)

      yield* runWorker(yield* arrangeChat(queuedReply, [user(1, 'What is this?', [photoId])]))

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
      const { writes, prompts, logs, layer } = makeHarness(threeDeltas)
      return Effect.gen(function* () {
        yield* enqueue(yield* arrangeChat())
        yield* deletions[deleted]

        yield* startWorker

        assert.deepStrictEqual(writes, [])
        assert.deepStrictEqual(prompts, [])
        assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('ends without a write when the reply is already settled on take', () => {
    const { writes, prompts, logs, layer } = makeHarness(threeDeltas)
    return Effect.gen(function* () {
      yield* runWorker(yield* arrangeChat(asCompleted(queuedReply, 'Done.')))

      assert.deepStrictEqual(writes, [])
      assert.deepStrictEqual(prompts, [])
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide(layer))
  })

  it.effect('keeps a rename made while the reply streams when it bumps the chat', () => {
    const { layer } = makeHarness(threeDeltas)
    return Effect.gen(function* () {
      const chats = yield* ChatRepository
      const reply = yield* arrangeChat()

      yield* Effect.gen(function* () {
        yield* Layer.build(AssistantMessageJob.worker)
        yield* enqueue(reply)
        yield* TestClock.adjust('200 millis')
        yield* chats.update(new Chat({ ...(yield* selectChat), title: Option.some('Trip') }))
        yield* TestClock.adjust('1 second')
      }).pipe(Effect.scoped)

      const chat = yield* selectChat
      assert.deepStrictEqual(
        [chat.title, DateTime.toEpochMillis(chat.updatedAt)],
        [Option.some('Trip'), 360],
      )
    }).pipe(Effect.provide(layer))
  })
})
