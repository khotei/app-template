import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { SqlClient } from 'effect/sql'

import { ChatId, MessageId } from '@app-template/domain/chat'
import { QueueClient } from '@app-template/queue'

import { assistantMessageQueue, GenerateAssistantMessage } from '#infrastructure/chat/chat.queue'
import { Db } from '#infrastructure/db/db.client'
import { outbox } from '#infrastructure/outbox/outbox.entity'
import { QueueClientOutbox } from '#infrastructure/shared/queue.client'
import { DbTest } from '#infrastructure/testing/db-test'

const QueueClientOutboxTest = QueueClientOutbox.pipe(Layer.provideMerge(DbTest))

const job = new GenerateAssistantMessage({
  chatId: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000030'),
  messageId: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000040'),
})

const selectOutbox = Effect.flatMap(Db, (db) =>
  db.select({ queue: outbox.queue, jobId: outbox.jobId, body: outbox.body }).from(outbox),
)

describe('QueueClientOutbox', () => {
  it.effect('a committed send leaves one row with the queue, the job id and the encoded job', () =>
    Effect.gen(function* () {
      const queue = yield* QueueClient
      const sql = yield* SqlClient.SqlClient

      yield* sql.withTransaction(queue.send(assistantMessageQueue, job))

      assert.deepStrictEqual(yield* selectOutbox, [
        {
          queue: 'assistant-message',
          jobId: '0192d4e0-7b3a-7c00-8000-000000000040',
          body: '{"chatId":"0192d4e0-7b3a-7c00-8000-000000000030","messageId":"0192d4e0-7b3a-7c00-8000-000000000040"}',
        },
      ])
    }).pipe(Effect.provide(QueueClientOutboxTest)),
  )

  it.effect('a send inside a transaction that then fails leaves no row', () =>
    Effect.gen(function* () {
      const queue = yield* QueueClient
      const sql = yield* SqlClient.SqlClient

      yield* queue
        .send(assistantMessageQueue, job)
        .pipe(Effect.andThen(Effect.fail('a later write failed')), sql.withTransaction, Effect.flip)

      assert.deepStrictEqual(yield* selectOutbox, [])
    }).pipe(Effect.provide(QueueClientOutboxTest)),
  )
})
