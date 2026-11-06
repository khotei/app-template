import { assert, describe, it, layer } from '@effect/vitest'
import { Array as Arr, Effect, Option, Order, Schedule, Schema } from 'effect'
import type { HttpClientError } from 'effect/http'
import { SqlClient } from 'effect/sql'

import {
  ActiveMessageStatus,
  AttachmentId,
  type ChatId,
  GenerateAssistantMessage,
  type MessageId,
} from '@app-template/application/chat'
import { ApiClient, AttachmentNotFoundError } from '@app-template/http-api'
import { FileRepository } from '@app-template/kernel/data'
import { assertSchemaEquals, png } from '@app-template/packages/testing'

import { StandTest } from '#testing/stand.test-layer'

const stubReply = 'This is the development stub answering the whole reply at once.'

const isActiveStatus = Schema.is(ActiveMessageStatus)

const poll = <A, E, R>(self: Effect.Effect<A, E, R>, until: (a: A) => boolean) =>
  self.pipe(
    Effect.repeat({ until, schedule: Schedule.spaced('100 millis') }),
    Effect.timeout('15 seconds'),
  )

/** Reads the reply until the worker has settled it, as the browser's polling does. */
const pollSettledMessage = (chatId: ChatId, messageId: MessageId) =>
  ApiClient.use((api) =>
    poll(
      api.chats.getMessage({ params: { chatId, messageId } }),
      (message) => !isActiveStatus(message.status),
    ),
  )

const pollTitledChat = (chatId: ChatId) =>
  ApiClient.use((api) =>
    poll(api.chats.get({ params: { chatId } }), (chat) => Option.isSome(chat.title)),
  )

function formOf(file: File) {
  const form = new FormData()
  form.append('files', file)
  return form
}

const uploadPhoto = ApiClient.use((api) =>
  api.attachments
    .upload({ payload: formOf(new File([png], 'photo.png', { type: 'image/png' })) })
    .pipe(Effect.head),
)

const selectUnsent = SqlClient.SqlClient.use(
  (sql) => sql`select queue from jobs where sent_at is null`,
)

const selectJobsOf = (chatId: ChatId) =>
  SqlClient.SqlClient.use((sql) => sql`select queue from jobs where body->>'chatId' = ${chatId}`)

/** The api answers a defect, such as a write Postgres refuses, with a bare `500`. */
const isDefectAnswer = (error: HttpClientError.HttpClientError) =>
  Option.fromUndefinedOr(error.response).pipe(Option.exists(({ status }) => status === 500))

const selectMessages = (chatId: ChatId) =>
  SqlClient.SqlClient.use((sql) => sql`select id from messages where chat_id = ${chatId}`)

const selectAttachmentChat = (id: AttachmentId) =>
  SqlClient.SqlClient.use(
    (sql) => sql`select chat_id as "chatId" from attachments where id = ${id}`,
  )

/**
 * Sends the files to the chat: 'sent', or 'refused' when the send reads one bound
 * (`AttachmentBoundError`) or, having read them free, dies on the bind's guard with a bare 500.
 */
const sendRacing = (chatId: ChatId, attachmentIds: ReadonlyArray<AttachmentId>) =>
  ApiClient.use((api) =>
    api.chats.send({ params: { chatId }, payload: { text: 'Look', attachmentIds } }).pipe(
      Effect.as('sent'),
      Effect.catchTag('AttachmentBoundError', () => Effect.succeed('refused')),
      Effect.catchTag('HttpClientError', (error) =>
        isDefectAnswer(error) ? Effect.succeed('refused') : Effect.fail(error),
      ),
    ),
  )

const ReplyJobRows = Schema.Tuple([
  Schema.Struct({ body: Schema.toCodecJson(GenerateAssistantMessage) }),
])

const selectReplyJob = (chatId: ChatId) =>
  SqlClient.SqlClient.use(
    (sql) =>
      sql`select body from jobs where queue = 'assistant-message' and body->>'chatId' = ${chatId}`,
  ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ReplyJobRows)))

describe('the journey over both app layers', { concurrent: false }, () => {
  layer(StandTest, { timeout: '60 seconds', excludeTestServices: true })((it) => {
    it.effect(
      "a sent message with an upload is answered and titled by the worker, its reply job keeps the api's provenance, and its delete removes the object",
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          const files = yield* FileRepository
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          const uploaded = yield* uploadPhoto

          const sent = yield* api.chats.send({
            params: { chatId: chat.id },
            payload: { text: 'Hello', attachmentIds: [uploaded.id] },
          })
          const reply = yield* pollSettledMessage(chat.id, sent.assistantMessage.id)
          const titled = yield* pollTitledChat(chat.id)

          const asked = yield* api.chats.getMessage({
            params: { chatId: chat.id, messageId: sent.userMessage.id },
          })

          assert.deepInclude(reply, { status: 'done', text: stubReply, attachments: [] })
          assert.deepStrictEqual(titled.title, Option.some('Stub chat title'))
          assert.strictEqual(titled.status, 'idle')
          assert.deepStrictEqual(
            Arr.map(asked.attachments, ({ id }) => id),
            [uploaded.id],
          )
          const unsent = yield* selectUnsent
          assert.deepStrictEqual(unsent, [])
          const [{ body: replyJob }] = yield* selectReplyJob(chat.id)
          const provenance = Option.getOrThrow(replyJob.provenance)
          assert.deepInclude(provenance, { provider: 'stub', model: 'stub' })
          assert.match(provenance.instructionsHash, /^[0-9a-f]{64}$/)

          yield* api.chats.delete({ params: { chatId: chat.id } })
          const object = yield* files.selectOne({ id: uploaded.id })
          const gone = yield* api.attachments
            .get({ params: { attachmentId: uploaded.id } })
            .pipe(Effect.flip)

          assert.deepStrictEqual(object, Option.none())
          assertSchemaEquals(
            AttachmentNotFoundError,
            gone,
            new AttachmentNotFoundError({ ids: [uploaded.id] }),
          )
        }),
      30_000,
    )

    it.effect('a send with a stale attachment id keeps no message and no job', () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        yield* api.users.ensure()
        const chat = yield* api.chats.create()
        const stale = AttachmentId.make('0192d4e0-7b3a-7c00-8000-00000000dead')

        const refused = yield* api.chats
          .send({
            params: { chatId: chat.id },
            payload: { text: 'Hello', attachmentIds: [stale] },
          })
          .pipe(Effect.flip)

        const stored = yield* selectMessages(chat.id)
        const rows = yield* selectJobsOf(chat.id)

        assertSchemaEquals(
          AttachmentNotFoundError,
          refused,
          new AttachmentNotFoundError({ ids: [stale] }),
        )
        assert.deepStrictEqual(stored, [])
        assert.deepStrictEqual(rows, [])
      }),
    )

    it.effect(
      'of two concurrent sends to one chat, one is stored and the other is refused, keeping nothing',
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          // The loser reads the chat queued (ChatBusyError) or, having read it idle, dies on the
          // status move, which the api answers with a bare 500: both roll it back whole.
          const send = api.chats
            .send({ params: { chatId: chat.id }, payload: { text: 'Lisbon?', attachmentIds: [] } })
            .pipe(
              Effect.as('sent'),
              Effect.catchTag('ChatBusyError', () => Effect.succeed('refused')),
              Effect.catchTag('HttpClientError', (error) =>
                isDefectAnswer(error) ? Effect.succeed('refused') : Effect.fail(error),
              ),
            )

          const outcomes = yield* Effect.all([send, send], { concurrency: 'unbounded' })

          assert.deepStrictEqual(Arr.sort(outcomes, Order.String), ['refused', 'sent'])
          assert.strictEqual((yield* selectMessages(chat.id)).length, 2)
        }),
    )

    it.effect(
      'of two concurrent sends binding one file to two chats, one binds it and the other is refused, keeping nothing',
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          const other = yield* api.chats.create()
          const photo = yield* uploadPhoto

          const outcomes = yield* Effect.all(
            [sendRacing(chat.id, [photo.id]), sendRacing(other.id, [photo.id])],
            { concurrency: 'unbounded' },
          )

          const winner = outcomes[0] === 'sent' ? chat.id : other.id
          const loser = winner === chat.id ? other.id : chat.id
          assert.deepStrictEqual(Arr.sort(outcomes, Order.String), ['refused', 'sent'])
          assert.deepStrictEqual(yield* selectAttachmentChat(photo.id), [{ chatId: winner }])
          assert.deepStrictEqual(yield* selectMessages(loser), [])
        }),
    )

    it.effect(
      'of two concurrent sends of overlapping files to two chats, the loser keeps nothing, not even the file only it named',
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          const other = yield* api.chats.create()
          const [a, b, c] = yield* Effect.all([uploadPhoto, uploadPhoto, uploadPhoto])

          const outcomes = yield* Effect.all(
            [sendRacing(chat.id, [a.id, b.id]), sendRacing(other.id, [b.id, c.id])],
            { concurrency: 'unbounded' },
          )

          const chatWon = outcomes[0] === 'sent'
          const loser = chatWon ? other.id : chat.id
          const loserOnly = chatWon ? c.id : a.id
          assert.deepStrictEqual(Arr.sort(outcomes, Order.String), ['refused', 'sent'])
          assert.deepStrictEqual(yield* selectMessages(loser), [])
          assert.deepStrictEqual(yield* selectAttachmentChat(loserOnly), [{ chatId: null }])
        }),
    )
  })
})

// Each case alters the schema to make Postgres refuse a write, so it takes a stand of its own.
describe('a write Postgres refuses, through the api', () => {
  it.live(
    'a send whose title job is refused leaves no message, no bind, no chat change and no job',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const client = yield* SqlClient.SqlClient
        yield* api.users.ensure()
        const chat = yield* api.chats.create()
        const photo = yield* uploadPhoto
        const created = yield* api.chats.get({ params: { chatId: chat.id } })
        const unbound = yield* api.attachments.get({ params: { attachmentId: photo.id } })
        // The title job is the last write of a chat's first send; all the others precede it.
        yield* client
          .unsafe(`ALTER TABLE jobs ADD CONSTRAINT refuse_title CHECK (queue <> 'chat-title')`)
          .pipe(Effect.orDie)

        const outcome = yield* api.chats
          .send({
            params: { chatId: chat.id },
            payload: { text: 'Look', attachmentIds: [photo.id] },
          })
          .pipe(
            Effect.as('sent'),
            Effect.catchTag('HttpClientError', (error) =>
              isDefectAnswer(error) ? Effect.succeed('refused') : Effect.fail(error),
            ),
          )

        assert.strictEqual(outcome, 'refused')
        assert.deepStrictEqual(yield* selectMessages(chat.id), [])
        assert.deepStrictEqual(
          yield* api.attachments.get({ params: { attachmentId: photo.id } }),
          unbound,
        )
        assert.deepStrictEqual(yield* api.chats.get({ params: { chatId: chat.id } }), created)
        assert.deepStrictEqual(yield* selectJobsOf(chat.id), [])
      }).pipe(Effect.provide(StandTest)),
    30_000,
  )

  it.live(
    "a reply whose chat's move to idle is refused ends failed with its chat, never done beside a queued chat",
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const client = yield* SqlClient.SqlClient
        yield* api.users.ensure()
        const chat = yield* api.chats.create()
        // `NOT VALID` spares the chat, created idle: the reply's settle is the next move to idle.
        yield* client
          .unsafe(`ALTER TABLE chats ADD CONSTRAINT refuse_idle CHECK (status <> 'idle') NOT VALID`)
          .pipe(Effect.orDie)

        const sent = yield* api.chats.send({
          params: { chatId: chat.id },
          payload: { text: 'Hello', attachmentIds: [] },
        })
        const reply = yield* pollSettledMessage(chat.id, sent.assistantMessage.id)
        const settled = yield* api.chats.get({ params: { chatId: chat.id } })

        assert.strictEqual(reply.status, 'failed')
        assert.strictEqual(settled.status, 'failed')
      }).pipe(Effect.provide(StandTest)),
    60_000,
  )

  it.live(
    'a refused chat delete keeps every row and the bytes',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const files = yield* FileRepository
        const client = yield* SqlClient.SqlClient
        yield* api.users.ensure()
        const chat = yield* api.chats.create()
        const photo = yield* uploadPhoto
        const sent = yield* api.chats.send({
          params: { chatId: chat.id },
          payload: { text: 'Look', attachmentIds: [photo.id] },
        })
        // The worker settles the reply and the title first, so only the delete could move a row.
        const reply = yield* pollSettledMessage(chat.id, sent.assistantMessage.id)
        const settled = yield* pollTitledChat(chat.id)
        const asked = yield* api.chats.getMessage({
          params: { chatId: chat.id, messageId: sent.userMessage.id },
        })
        const bound = yield* api.attachments.get({ params: { attachmentId: photo.id } })
        // A row that references the chat without a cascade: Postgres refuses the chat's delete,
        // and the cascade it started goes back with it.
        yield* client
          .unsafe('CREATE TABLE chat_holds (chat_id uuid NOT NULL REFERENCES chats (id))')
          .pipe(Effect.orDie)
        yield* Effect.orDie(client`INSERT INTO chat_holds (chat_id) VALUES (${chat.id})`)

        const outcome = yield* api.chats.delete({ params: { chatId: chat.id } }).pipe(
          Effect.as('deleted'),
          Effect.catchTag('HttpClientError', (error) =>
            isDefectAnswer(error) ? Effect.succeed('refused') : Effect.fail(error),
          ),
        )

        assert.strictEqual(outcome, 'refused')
        assert.deepStrictEqual(yield* api.chats.get({ params: { chatId: chat.id } }), settled)
        assert.deepStrictEqual(
          yield* api.chats.getMessage({
            params: { chatId: chat.id, messageId: sent.userMessage.id },
          }),
          asked,
        )
        assert.deepStrictEqual(
          yield* api.chats.getMessage({
            params: { chatId: chat.id, messageId: sent.assistantMessage.id },
          }),
          reply,
        )
        assert.deepStrictEqual(
          yield* api.attachments.get({ params: { attachmentId: photo.id } }),
          bound,
        )
        assert.isTrue(Option.isSome(yield* files.selectOne({ id: photo.id })))
      }).pipe(Effect.provide(StandTest)),
    30_000,
  )
})
