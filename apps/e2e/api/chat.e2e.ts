import { assert, describe, it, layer } from '@effect/vitest'
import { Array as Arr, Effect, Option, Order, Predicate, Schedule } from 'effect'
import type { HttpClientError } from 'effect/http'
import { SqlClient } from 'effect/sql'

import { ApiClient } from '@app-template/api/testing'
import { type ChatId, isActiveRun, type RunId } from '@app-template/application/chat'

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

/** The api responds to a defect, such as a write Postgres refuses, with a bare `500`. */
const isDefectAnswer = (error: HttpClientError.HttpClientError) =>
  Option.fromUndefinedOr(error.response).pipe(Option.exists(({ status }) => status === 500))

const selectMessages = (chatId: ChatId) =>
  SqlClient.SqlClient.use((sql) => sql`select id, author from messages where chat_id = ${chatId}`)

describe('the journey over both app layers', { concurrent: false }, () => {
  layer(StandTest, { timeout: '60 seconds', excludeTestServices: true })((it) => {
    it.effect('a sent message is answered and titled by the worker', () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        yield* api.users.recognise()
        const chat = yield* api.chats.create()

        const sent = yield* api.chats.ask({
          params: { chatId: chat.id },
          payload: { text: 'Hello' },
        })
        const settled = yield* pollSettledRun(chat.id, sent.id)
        const titled = yield* pollTitledChat(chat.id)

        assert.strictEqual(settled.status, 'done')
        assert.deepInclude(Option.getOrThrow(settled.assistantMessage), {
          author: 'assistant',
          text: scriptedAnswers.reply.text,
        })
        assert.deepStrictEqual(titled.title, Option.some<string>(scriptedAnswers.title))
        assert.strictEqual(titled.status, 'idle')
      }),
    )

    it.effect(
      "a reload after the reply lists the chat's two messages with the Run that answered",
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          yield* api.users.recognise()
          const chat = yield* api.chats.create()
          const sent = yield* api.chats.ask({
            params: { chatId: chat.id },
            payload: { text: 'Hello' },
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
          yield* api.users.recognise()
          const chat = yield* api.chats.create()
          // The loser reads the winner's active Run (ChatBusyError) or, having read none, dies on
          // the index on the active Run, which the api responds to with a bare 500: both roll it back whole.
          const send = api.chats
            .ask({
              params: { chatId: chat.id },
              payload: { text: 'Lisbon?' },
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
  })
})

// Each case alters the schema to make Postgres refuse a write, so it takes a stand of its own.
describe('a write Postgres refuses, through the api', () => {
  it.live('a send whose Run is refused leaves no message and no chat change', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const client = yield* SqlClient.SqlClient
      yield* api.users.recognise()
      const chat = yield* api.chats.create()
      const created = yield* api.chats.get({ params: { chatId: chat.id } })
      // The Run is the last write of a send; all the others precede it.
      yield* client
        .unsafe(`ALTER TABLE runs ADD CONSTRAINT refuse_run CHECK (status <> 'queued')`)
        .pipe(Effect.orDie)

      const outcome = yield* api.chats
        .ask({
          params: { chatId: chat.id },
          payload: { text: 'Look' },
        })
        .pipe(
          Effect.as('sent'),
          Effect.catchTag('HttpClientError', (error) =>
            isDefectAnswer(error) ? Effect.succeed('refused') : Effect.fail(error),
          ),
        )

      assert.strictEqual(outcome, 'refused')
      assert.deepStrictEqual(yield* selectMessages(chat.id), [])
      assert.deepStrictEqual(yield* api.chats.get({ params: { chatId: chat.id } }), created)
    }).pipe(Effect.provide(StandTest)),
  )

  it.live(
    'a Run whose move to done Postgres refuses ends failed with its chat and keeps no reply',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const client = yield* SqlClient.SqlClient
        yield* api.users.recognise()
        const chat = yield* api.chats.create()
        // The Run's move to `done` is the last write of a completion, after its reply.
        yield* client
          .unsafe(`ALTER TABLE runs ADD CONSTRAINT refuse_done CHECK (status <> 'done')`)
          .pipe(Effect.orDie)

        const sent = yield* api.chats.ask({
          params: { chatId: chat.id },
          payload: { text: 'Hello' },
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
        yield* api.users.recognise()
        const chat = yield* api.chats.create()
        yield* client
          .unsafe(`ALTER TABLE messages ADD CONSTRAINT refuse_reply CHECK (author <> 'assistant')`)
          .pipe(Effect.orDie)
        const sent = yield* api.chats.ask({
          params: { chatId: chat.id },
          payload: { text: 'Hello' },
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

  it.live('a refused chat delete keeps every row', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const client = yield* SqlClient.SqlClient
      yield* api.users.recognise()
      const chat = yield* api.chats.create()
      const sent = yield* api.chats.ask({
        params: { chatId: chat.id },
        payload: { text: 'Look' },
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
    }).pipe(Effect.provide(StandTest)),
  )
})
