import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import {
  Array as Arr,
  DateTime,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
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
import {
  AttachmentStoreTest,
  chat,
  chatId,
  epoch,
  messageId,
  owner,
} from '@app-template/domain/testing'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import {
  assistantMessageDeadLetterQueue,
  assistantMessageQueue,
  ChatRepositoryPg,
  GenerateAssistantMessage,
  MessageRepositoryPg,
} from '@app-template/infrastructure/chat'
import type { AttemptInfo } from '@app-template/queue'
import { png, recordLogs } from '@app-template/testing'

import { AssistantMessageJob } from '#application/chat/assistant-message.job'
import { ChatService } from '#application/chat/chat.service'
import { DbWithUsersTest } from '#application/testing/db.test-layer'
import {
  holdModelCall,
  type ModelCallHold,
  recordLanguageModel,
} from '#application/testing/language-model.test-fake'

const historyId = (n: number) => MessageId.make(`0192d4e0-7b3a-7c00-8000-00000000005${n}`)
const photoId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000040')
const sketchId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000041')

type Part = Response.StreamPartEncoded

/**
 * The repositories on a fresh test database, the attachment store in memory. Both halves name
 * `DbWithUsersTest`, which one build makes once, so they share its database.
 */
const storesPg = {
  messages: MessageRepositoryPg.pipe(Layer.provide(DbWithUsersTest)),
  chatsAndAttachments: Layer.mergeAll(
    ChatRepositoryPg,
    AttachmentRepositoryPg,
    AttachmentStoreTest,
  ).pipe(Layer.provide(DbWithUsersTest)),
}

/**
 * The repositories in maps, so the `TestClock` can step the job: only the methods a reply that
 * reads no attachment calls.
 */
const makeStoresTest = () => {
  const chats = new Map<ChatId, Chat>()
  const messages = new Map<MessageId, Message>()
  const putChat = (chat: Chat) =>
    Effect.sync(() => {
      chats.set(chat.id, chat)
    })
  const putMessage = (message: Message) =>
    Effect.sync(() => {
      messages.set(message.id, message)
      return true
    })
  return {
    messages: Layer.mock(MessageRepository, {
      insert: putMessage,
      update: putMessage,
      selectById: (id) => Effect.sync(() => Option.fromUndefinedOr(messages.get(id))),
      selectByChat: (chatId) =>
        Effect.sync(() =>
          Arr.map(
            Arr.filter([...messages.values()], (message) => message.chatId === chatId),
            (message) => ({ message, attachments: [] }),
          ),
        ),
    }),
    chatsAndAttachments: Layer.mergeAll(
      Layer.mock(ChatRepository, {
        insert: putChat,
        update: (set, where) =>
          Effect.sync(() => {
            const chat = chats.get(where.id)
            if (chat) chats.set(where.id, new Chat({ ...chat, ...set }))
            return chat !== undefined
          }),
        selectById: (id) => Effect.sync(() => Option.fromUndefinedOr(chats.get(id))),
      }),
      Layer.mock(AttachmentRepository, {}),
      Layer.mock(AttachmentStore, {}),
    ),
  }
}

/** The job's services over `stores`, recording its message writes, its prompts and its logs. */
const recordAssistantMessage = <E, R>(
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
        update: (message, where) =>
          Effect.andThen(
            Effect.sync(() => writes.push(message)),
            inner.update(message, where),
          ),
      }),
    ),
  ).pipe(Layer.provide(stores.messages))
  const { prompts, layer: model } = recordLanguageModel({ streamText: stream })
  const { logs, layer: logger } = recordLogs()
  const layer = Layer.mergeAll(ChatService.layer, model, logger).pipe(
    Layer.provideMerge(Layer.merge(messages, stores.chatsAndAttachments)),
    Layer.provide(BunCrypto.layer),
  )
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

const attempts = [
  { name: 'an attempt', attempt: 1 },
  { name: 'the last attempt', attempt: lastAttempt },
] as const

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
    yield* chats.insert(chat)
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

const user = (n: number, text: string) =>
  buildUserMessage({ id: historyId(n), chatId, text, createdAt: sentAfter(n) })

const assistant = (n: number) =>
  buildAssistantMessage({ id: historyId(n), chatId, createdAt: sentAfter(n) })

const failure = new MessageFailure({ reason: 'ReplyFailed', message: 'Sorry.', cause: 'boom' })

const history = [
  user(1, 'What is this?'),
  asCompleted(assistant(2), 'A photo.'),
  user(3, 'And again?'),
  new Message({ ...assistant(4), stage: 'failed', text: 'half', error: Option.some(failure) }),
  user(5, ''),
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

const deleteChat = Effect.flatMap(ChatRepository, (chats) => chats.delete(chatId))

const stagesOf = (writes: ReadonlyArray<Message>) =>
  Arr.dedupeAdjacent(Arr.map(writes, (message) => message.stage))

const snapshotsOf = (writes: ReadonlyArray<Message>) =>
  Arr.map(writes, (message) => [message.stage, message.text])

const timesOf = (writes: ReadonlyArray<Message>) =>
  Arr.map(writes, (message) => DateTime.toEpochMillis(message.updatedAt))

describe('AssistantMessageJob.handle', () => {
  it.live('prepares, generates, then completes the reply and bumps the chat', () => {
    const { writes, layer } = recordAssistantMessage(replyDeltas, storesPg)
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* handleAttempt(1)

      assert.deepStrictEqual(stagesOf(writes), ['preparing', 'generating', 'completed'])
      const completed = yield* selectReply
      assert.strictEqual(completed.text, 'Hello, world')
      assert.isTrue(DateTime.isGreaterThan(completed.updatedAt, epoch))
      assertEquals((yield* selectChat).updatedAt, completed.updatedAt)
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    'prompts with every completed message in order, with a file part per attachment',
    () => {
      const { prompts, layer } = recordAssistantMessage(replyDeltas, storesPg)
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
    const { prompts, layer } = recordAssistantMessage(replyDeltas, storesPg)
    return Effect.gen(function* () {
      yield* arrangeChat(queuedReply, [user(1, 'What is this?')])
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

  it.effect('ends with a log line and no write when the chat is deleted before the take', () => {
    const { writes, prompts, logs, layer } = recordAssistantMessage(replyDeltas, storesPg)
    return Effect.gen(function* () {
      yield* arrangeChat()
      yield* deleteChat

      yield* handleAttempt(1)

      assert.deepStrictEqual(writes, [])
      assert.deepStrictEqual(prompts, [])
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(attempts)(
    'ends without a write when the reply is already settled on $name',
    ({ attempt }) => {
      const { writes, prompts, logs, layer } = recordAssistantMessage(replyDeltas, storesPg)
      return Effect.gen(function* () {
        yield* arrangeChat(asCompleted(queuedReply, 'Done.'))

        yield* handleAttempt(attempt)

        assert.deepStrictEqual(writes, [])
        assert.deepStrictEqual(prompts, [])
        assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.live('keeps a rename made while the reply streams when it bumps the chat', () => {
    const held = holdModelCall()
    const { writes, layer } = recordAssistantMessage(heldDeltas(held), storesPg)
    return Effect.gen(function* () {
      const chats = yield* ChatRepository
      yield* arrangeChat()

      const running = yield* Effect.forkChild(handleAttempt(1))
      yield* held.asked
      assert.deepStrictEqual(snapshotsOf(writes), [
        ['preparing', ''],
        ['generating', ''],
      ])
      yield* chats.update({ title: Option.some(ChatTitle.make('Trip')) }, { id: chatId })
      yield* held.release
      yield* Fiber.join(running)

      assertEquals(
        yield* selectChat,
        new Chat({
          ...chat,
          title: Option.some(ChatTitle.make('Trip')),
          updatedAt: (yield* selectReply).updatedAt,
        }),
      )
    }).pipe(Effect.provide(layer))
  })

  it.live(
    'stops with already settled when another writer settles the reply while it streams',
    () => {
      const held = holdModelCall()
      const { logs, layer } = recordAssistantMessage(heldDeltas(held), storesPg)
      return Effect.gen(function* () {
        const messages = yield* MessageRepository
        yield* arrangeChat()

        const running = yield* Effect.forkChild(handleAttempt(1))
        yield* held.asked
        const generating = yield* selectReply
        const settledElsewhere = asCompleted(generating, 'Done elsewhere.')
        yield* messages.update(settledElsewhere, { stage: 'generating' })
        yield* held.release
        const exit = yield* Fiber.join(running)

        assert.isTrue(Exit.isSuccess(exit))
        assertEquals(yield* selectReply, settledElsewhere)
        assertEquals(yield* selectChat, chat)
        assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.live('fails every attempt and, on the last, fails the message with its cause', () => {
    const { writes, prompts, logs, layer } = recordAssistantMessage(failingAtOnce, storesPg)
    return Effect.gen(function* () {
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
      assert.isTrue(DateTime.isGreaterThan(failed.updatedAt, epoch))
      assertEquals((yield* selectChat).updatedAt, failed.updatedAt)
      assert.deepStrictEqual(logs, [])
    }).pipe(Effect.provide(layer))
  })

  it.live('fails the reply when its worker stops during the last attempt', () => {
    const held = holdModelCall()
    const { writes, layer } = recordAssistantMessage(heldDeltas(held), storesPg)
    return Effect.gen(function* () {
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
      assert.isTrue(DateTime.isGreaterThan(failed.updatedAt, epoch))
      assertEquals((yield* selectChat).updatedAt, failed.updatedAt)
    }).pipe(Effect.provide(layer))
  })
})

const runDeadLettered = Effect.exit(
  AssistantMessageJob.handleDeadLettered(queuedJob, {
    attempt: assistantMessageQueue.maxAttempts + 1,
    maxAttempts: assistantMessageDeadLetterQueue.maxAttempts,
    isLastAttempt: false,
  }),
)

const stuckReplies = [
  { name: 'a queued reply', reply: queuedReply },
  {
    name: 'a generating reply',
    reply: new Message({ ...queuedReply, stage: 'generating', text: 'Hel' }),
  },
] as const

describe('AssistantMessageJob.handleDeadLettered', () => {
  it.live.each(stuckReplies)(
    'fails $name with a dead-letter cause and bumps the chat',
    ({ reply }) => {
      const { writes, prompts, logs, layer } = recordAssistantMessage(replyDeltas, storesPg)
      return Effect.gen(function* () {
        yield* arrangeChat(reply)

        const exit = yield* runDeadLettered

        assert.isTrue(Exit.isSuccess(exit))
        assert.deepStrictEqual(snapshotsOf(writes), [['failed', reply.text]])
        assert.deepStrictEqual(prompts, [])
        const failed = yield* selectReply
        const error = Option.getOrThrow(failed.error)
        assert.deepStrictEqual(
          [error.reason, error.cause],
          ['ReplyFailed', 'dead-lettered after 4 attempts on assistant-message-dlq'],
        )
        assert.isTrue(DateTime.isGreaterThan(failed.updatedAt, epoch))
        assertEquals((yield* selectChat).updatedAt, failed.updatedAt)
        assert.deepStrictEqual(logs, [['Error', 'assistant reply dead-lettered']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('leaves a settled reply and logs already settled', () => {
    const { writes, logs, layer } = recordAssistantMessage(replyDeltas, storesPg)
    return Effect.gen(function* () {
      const completed = yield* arrangeChat(asCompleted(queuedReply, 'Done.'))

      yield* runDeadLettered

      assert.deepStrictEqual(writes, [])
      assertEquals(yield* selectReply, completed)
      assertEquals(yield* selectChat, chat)
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: already settled']])
    }).pipe(Effect.provide(layer))
  })

  it.effect('logs chat deleted and writes nothing for a deleted chat', () => {
    const { writes, logs, layer } = recordAssistantMessage(replyDeltas, storesPg)
    return Effect.gen(function* () {
      yield* arrangeChat()
      yield* deleteChat

      yield* runDeadLettered

      assert.deepStrictEqual(writes, [])
      assert.deepStrictEqual(logs, [['Info', 'assistant reply skipped: chat deleted']])
    }).pipe(Effect.provide(layer))
  })
})

describe('AssistantMessageJob.handle on the TestClock', () => {
  it.effect('writes a snapshot every 300 ms and completes and bumps the chat at the end', () => {
    const { writes, layer } = recordAssistantMessage(threeDeltas, makeStoresTest())
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
      const { writes, layer } = recordAssistantMessage(failingMidway, makeStoresTest())
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
