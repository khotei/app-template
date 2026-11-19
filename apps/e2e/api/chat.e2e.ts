import { assert, describe, it, layer } from '@effect/vitest'
import { Array as Arr, Effect, Option, Order, Predicate, Schedule } from 'effect'
import type { HttpClientError } from 'effect/http'
import { SqlClient } from 'effect/sql'

import { ApiClient } from '@app-template/api/testing'
import {
  AttachmentBoundError,
  type AttachmentId,
  type ChatId,
  isActiveRun,
  type RunId,
} from '@app-template/application/chat'
import { FileRepository } from '@app-template/kernel/data'
import { assertSchemaEquals, png } from '@app-template/packages/testing'

import { StandTest, scriptedAnswers } from '#testing/stand.test-layer'

const poll = <A, E, R>(self: Effect.Effect<A, E, R>, until: (a: A) => boolean) =>
  self.pipe(
    Effect.repeat({ until, schedule: Schedule.spaced('100 millis') }),
    Effect.timeout('15 seconds'),
  )

/** Reads the Run until the worker has settled it, as the browser's polling does. */
const pollSettledRun = (chatId: ChatId, runId: RunId) =>
  ApiClient.use((api) =>
    poll(api.chats.getRun({ params: { chatId, runId } }), Predicate.not(isActiveRun)),
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

/** The api answers a defect, such as a write Postgres refuses, with a bare `500`. */
const isDefectAnswer = (error: HttpClientError.HttpClientError) =>
  Option.fromUndefinedOr(error.response).pipe(Option.exists(({ status }) => status === 500))

const selectMessages = (chatId: ChatId) =>
  SqlClient.SqlClient.use((sql) => sql`select id, author from messages where chat_id = ${chatId}`)

/** The chats that hold a copy sent from the library attachment `id`. */
const selectCopyChats = (id: AttachmentId) =>
  SqlClient.SqlClient.use(
    (sql) =>
      sql<{
        readonly chatId: string
      }>`select chat_id as "chatId" from attachments where source_id = ${id}`,
  ).pipe(Effect.map(Arr.map(({ chatId }) => chatId)))

describe('the journey over both app layers', { concurrent: false }, () => {
  layer(StandTest, { timeout: '60 seconds', excludeTestServices: true })((it) => {
    it.effect(
      'a sent message with an upload is answered and titled by the worker, and its delete keeps the upload in the library',
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          const files = yield* FileRepository
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          const uploaded = yield* uploadPhoto

          const sent = yield* api.chats.createMessage({
            params: { chatId: chat.id },
            payload: { text: 'Hello', attachmentIds: [uploaded.id] },
          })
          const settled = yield* pollSettledRun(chat.id, sent.id)
          const titled = yield* pollTitledChat(chat.id)

          const asked = yield* api.chats.getMessage({
            params: { chatId: chat.id, messageId: sent.userMessage.id },
          })

          assert.strictEqual(settled.status, 'done')
          assert.deepInclude(Option.getOrThrow(settled.assistantMessage), {
            author: 'assistant',
            text: scriptedAnswers.reply.text,
          })
          assert.deepStrictEqual(titled.title, Option.some<string>(scriptedAnswers.title))
          assert.strictEqual(titled.status, 'idle')
          assert.deepStrictEqual(
            Arr.map(asked.attachments, ({ sourceId }) => sourceId),
            [Option.some(uploaded.id)],
          )

          yield* api.chats.delete({ params: { chatId: chat.id } })
          const object = yield* files.selectOne({ id: uploaded.id })
          const library = yield* api.attachments.list()

          assert.isTrue(Option.isSome(object))
          assert.deepStrictEqual(yield* selectCopyChats(uploaded.id), [])
          assert.deepInclude(library, uploaded)
        }),
    )

    it.effect(
      "a reload after the reply lists the chat's two messages with the Run that answered",
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          const sent = yield* api.chats.createMessage({
            params: { chatId: chat.id },
            payload: { text: 'Hello', attachmentIds: [] },
          })
          yield* pollSettledRun(chat.id, sent.id)

          const reloaded = yield* api.chats.listMessages({ params: { chatId: chat.id } })

          assert.deepStrictEqual(
            Arr.map(reloaded, ({ author, run }) => [
              author,
              Option.map(run, ({ id, status }) => ({ id, status })),
            ]),
            [
              ['user', Option.some({ id: sent.id, status: 'done' })],
              ['assistant', Option.some({ id: sent.id, status: 'done' })],
            ],
          )
        }),
    )

    it.effect(
      'of two concurrent sends to one chat, one is stored and the other is refused, keeping nothing',
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          // The loser reads the winner's active Run (ChatBusyError) or, having read none, dies on
          // the index on the active Run, which the api answers with a bare 500: both roll it back whole.
          const send = api.chats
            .createMessage({
              params: { chatId: chat.id },
              payload: { text: 'Lisbon?', attachmentIds: [] },
            })
            .pipe(
              Effect.as('sent'),
              Effect.catchTag('ChatBusyError', () => Effect.succeed('refused')),
              Effect.catchTag('HttpClientError', (error) =>
                isDefectAnswer(error) ? Effect.succeed('refused') : Effect.fail(error),
              ),
            )

          const outcomes = yield* Effect.all([send, send], { concurrency: 'unbounded' })
          const messages = yield* selectMessages(chat.id)

          assert.deepStrictEqual(Arr.sort(outcomes, Order.String), ['refused', 'sent'])
          // The worker may answer the stored send before this count, so only the user's count.
          assert.lengthOf(
            Arr.filter(messages, ({ author }) => author === 'user'),
            1,
          )
        }),
    )

    it.effect(
      'two concurrent sends of one library attachment to two chats each store a copy of it',
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          const other = yield* api.chats.create()
          const photo = yield* uploadPhoto
          const sendTo = (chatId: ChatId) =>
            api.chats.createMessage({
              params: { chatId },
              payload: { text: 'Look', attachmentIds: [photo.id] },
            })

          yield* Effect.all([sendTo(chat.id), sendTo(other.id)], { concurrency: 'unbounded' })

          assert.sameMembers(yield* selectCopyChats(photo.id), [chat.id, other.id])
          assert.deepStrictEqual(
            yield* api.attachments.get({ params: { attachmentId: photo.id } }),
            photo,
          )
        }),
    )

    it.effect(
      'a library attachment sent to a chat refuses its delete, naming the chat, until the chat is deleted',
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          const photo = yield* uploadPhoto
          const remove = api.attachments.delete({ params: { attachmentId: photo.id } })
          const sent = yield* api.chats.createMessage({
            params: { chatId: chat.id },
            payload: { text: 'Look', attachmentIds: [photo.id] },
          })

          const refused = yield* remove.pipe(Effect.flip)
          yield* pollSettledRun(chat.id, sent.id)
          yield* api.chats.delete({ params: { chatId: chat.id } })
          yield* remove

          assertSchemaEquals(
            AttachmentBoundError,
            refused,
            new AttachmentBoundError({ id: photo.id, chatIds: [chat.id] }),
          )
          assert.notDeepInclude(yield* api.attachments.list(), photo)
        }),
    )
  })
})

// Each case alters the schema to make Postgres refuse a write, so it takes a stand of its own.
describe('a write Postgres refuses, through the api', () => {
  it.live('a send whose Run is refused leaves no message, no copy and no chat change', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const client = yield* SqlClient.SqlClient
      yield* api.users.ensure()
      const chat = yield* api.chats.create()
      const photo = yield* uploadPhoto
      const created = yield* api.chats.get({ params: { chatId: chat.id } })
      // The Run is the last write of a send; all the others precede it.
      yield* client
        .unsafe(`ALTER TABLE runs ADD CONSTRAINT refuse_run CHECK (status <> 'queued')`)
        .pipe(Effect.orDie)

      const outcome = yield* api.chats
        .createMessage({
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
      assert.deepStrictEqual(yield* selectCopyChats(photo.id), [])
      assert.deepStrictEqual(yield* api.chats.get({ params: { chatId: chat.id } }), created)
    }).pipe(Effect.provide(StandTest)),
  )

  it.live(
    'a Run whose move to done Postgres refuses ends failed with its chat and keeps no reply',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const client = yield* SqlClient.SqlClient
        yield* api.users.ensure()
        const chat = yield* api.chats.create()
        // The Run's move to `done` is the last write of a completion, after its reply.
        yield* client
          .unsafe(`ALTER TABLE runs ADD CONSTRAINT refuse_done CHECK (status <> 'done')`)
          .pipe(Effect.orDie)

        const sent = yield* api.chats.createMessage({
          params: { chatId: chat.id },
          payload: { text: 'Hello', attachmentIds: [] },
        })
        const settled = yield* pollSettledRun(chat.id, sent.id)
        const failedChat = yield* api.chats.get({ params: { chatId: chat.id } })

        assert.strictEqual(settled.status, 'failed')
        assert.deepStrictEqual(settled.assistantMessage, Option.none())
        assert.strictEqual(failedChat.status, 'failed')
        assert.strictEqual((yield* selectMessages(chat.id)).length, 1)
      }).pipe(Effect.provide(StandTest)),
    60_000,
  )

  it.live(
    'a retry after a failed Run is answered by the worker, and a reload shows the reply',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const client = yield* SqlClient.SqlClient
        yield* api.users.ensure()
        const chat = yield* api.chats.create()
        yield* client
          .unsafe(`ALTER TABLE messages ADD CONSTRAINT refuse_reply CHECK (author <> 'assistant')`)
          .pipe(Effect.orDie)
        const sent = yield* api.chats.createMessage({
          params: { chatId: chat.id },
          payload: { text: 'Hello', attachmentIds: [] },
        })
        yield* pollSettledRun(chat.id, sent.id)
        yield* client.unsafe('ALTER TABLE messages DROP CONSTRAINT refuse_reply').pipe(Effect.orDie)

        const retried = yield* api.chats.retryRun({ params: { chatId: chat.id } })
        const settled = yield* pollSettledRun(chat.id, retried.id)
        const failed = yield* api.chats.getRun({ params: { chatId: chat.id, runId: sent.id } })
        const reloaded = yield* api.chats.listMessages({ params: { chatId: chat.id } })

        assert.strictEqual(settled.status, 'done')
        assert.strictEqual(failed.status, 'failed')
        assert.deepStrictEqual(
          Arr.map(reloaded, ({ author, run }) => [author, Option.map(run, ({ id }) => id)]),
          [
            ['user', Option.some(retried.id)],
            ['assistant', Option.some(retried.id)],
          ],
        )
      }).pipe(Effect.provide(StandTest)),
    60_000,
  )

  it.live('a refused chat delete keeps every row and the bytes', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const files = yield* FileRepository
      const client = yield* SqlClient.SqlClient
      yield* api.users.ensure()
      const chat = yield* api.chats.create()
      const photo = yield* uploadPhoto
      const sent = yield* api.chats.createMessage({
        params: { chatId: chat.id },
        payload: { text: 'Look', attachmentIds: [photo.id] },
      })
      // The worker settles the Run and the title first, so only the delete could move a row.
      const done = yield* pollSettledRun(chat.id, sent.id)
      const settled = yield* pollTitledChat(chat.id)
      const asked = yield* api.chats.getMessage({
        params: { chatId: chat.id, messageId: sent.userMessage.id },
      })
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
        yield* api.chats.getRun({ params: { chatId: chat.id, runId: sent.id } }),
        done,
      )
      assert.deepStrictEqual(yield* selectCopyChats(photo.id), [chat.id])
      assert.isTrue(Option.isSome(yield* files.selectOne({ id: photo.id })))
    }).pipe(Effect.provide(StandTest)),
  )
})
