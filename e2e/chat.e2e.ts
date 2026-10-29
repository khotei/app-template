import { assert, describe, layer } from '@effect/vitest'
import { Array as Arr, Effect, Option, Schedule, Schema } from 'effect'
import { SqlClient } from 'effect/sql'

import {
  AttachmentBucket,
  AttachmentId,
  AttachmentNotFoundError,
} from '@app-template/domain/attachment'
import { ActiveMessageStage, type ChatId, type MessageId } from '@app-template/domain/chat'
import { ApiClient } from '@app-template/http-api'
import { assertSchemaEquals, png } from '@app-template/testing'

import { StandTest } from '#e2e/testing/stand.test-layer'

const stubReply = 'This is the development stub answering the whole reply at once.'

const isActiveStage = Schema.is(ActiveMessageStage)

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
      (message) => !isActiveStage(message.stage),
    ),
  )

const pollTitledChat = (chatId: ChatId) =>
  ApiClient.use((api) =>
    poll(api.chats.get({ params: { chatId } }), (chat) => Option.isSome(chat.title)),
  )

const formOf = (file: File) => {
  const form = new FormData()
  form.append('files', file)
  return form
}

const selectOutbox = SqlClient.SqlClient.use((sql) => sql`select queue from outbox`)

describe('the journey over both app layers', { concurrent: false }, () => {
  layer(StandTest, { excludeTestServices: true })((it) => {
    it.effect(
      'a sent message with an upload is answered and titled by the worker, and its delete removes the object',
      () =>
        Effect.gen(function* () {
          const api = yield* ApiClient
          const bucket = yield* AttachmentBucket
          yield* api.users.ensure()
          const chat = yield* api.chats.create()
          const uploaded = yield* api.attachments
            .upload({ payload: formOf(new File([png], 'photo.png', { type: 'image/png' })) })
            .pipe(Effect.head)

          const sent = yield* api.chats.send({
            params: { chatId: chat.id },
            payload: { text: 'Hello', attachmentIds: [uploaded.id] },
          })
          const reply = yield* pollSettledMessage(chat.id, sent.assistantMessage.id)
          const titled = yield* pollTitledChat(chat.id)

          assert.deepInclude(reply, { stage: 'completed', text: stubReply })
          assert.deepStrictEqual(titled.title, Option.some('Stub chat title'))
          assert.deepStrictEqual(titled.activeMessage, Option.none())
          assert.deepStrictEqual(
            Arr.map(titled.messages, ({ author, attachments }) => ({
              author,
              attachmentIds: Arr.map(attachments, ({ id }) => id),
            })),
            [
              { author: 'user', attachmentIds: [uploaded.id] },
              { author: 'assistant', attachmentIds: [] },
            ],
          )
          const rows = yield* selectOutbox
          assert.deepStrictEqual(rows, [])

          yield* api.chats.delete({ params: { chatId: chat.id } })
          const object = yield* bucket.select(uploaded.id)
          const gone = yield* api.attachments
            .get({ params: { attachmentId: uploaded.id } })
            .pipe(Effect.flip)

          assert.deepStrictEqual(object, Option.none())
          assertSchemaEquals(
            AttachmentNotFoundError,
            gone,
            new AttachmentNotFoundError({ id: uploaded.id }),
          )
        }),
      30_000,
    )

    it.effect('a send with a stale attachment id keeps no message and no outbox row', () =>
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

        const detail = yield* api.chats.get({ params: { chatId: chat.id } })
        const rows = yield* selectOutbox

        assertSchemaEquals(
          AttachmentNotFoundError,
          refused,
          new AttachmentNotFoundError({ id: stale }),
        )
        assert.deepStrictEqual(detail.messages, [])
        assert.deepStrictEqual(rows, [])
      }),
    )
  })
})
