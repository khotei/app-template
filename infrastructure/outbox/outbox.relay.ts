import { inArray } from 'drizzle-orm'
import { Array as Arr, Cause, Effect, Layer, Predicate } from 'effect'
import { SqlClient } from 'effect/sql'

import { buildResourceName } from '@app-template/aws'
import { AwsConfig, QueueConfig } from '@app-template/config'
import { QueueTransport } from '@app-template/queue'

import { Db, unwrapQueryError } from '#infrastructure/db/db.client'
import { outbox } from '#infrastructure/outbox/outbox.entity'
import { SQSServiceFromConfig } from '#infrastructure/shared/aws.client'

const batchLimit = 10

/**
 * Sends the outbox to SQS: each batch is locked, sent and deleted in one transaction, so a failed
 * send leaves its rows for the next poll.
 *
 * Delivery is at-least-once: a crash between a send and the commit sends the row again.
 */
export const OutboxRelay = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const transport = yield* QueueTransport
  const { stage } = yield* AwsConfig
  const { outboxPollInterval } = yield* QueueConfig

  const relayBatch = Effect.gen(function* () {
    const rows = yield* db
      .select()
      .from(outbox)
      .orderBy(outbox.createdAt, outbox.id)
      .limit(batchLimit)
      .for('update', { skipLocked: true })
    if (Arr.isReadonlyArrayEmpty(rows)) return rows

    yield* Effect.forEach(
      rows,
      (row) =>
        transport.send(buildResourceName(stage, row.queue), {
          body: row.body,
          attributes: { jobId: row.jobId },
        }),
      { discard: true },
    )
    yield* db.delete(outbox).where(
      inArray(
        outbox.id,
        Arr.map(rows, (row) => row.id),
      ),
    )
    return rows
  }).pipe(Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError), sql.withTransaction)

  const poll = relayBatch.pipe(
    Effect.tapCauseIf(Predicate.not(Cause.hasInterruptsOnly), (cause) =>
      Effect.logError('outbox relay failed', cause),
    ),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.succeed([]),
    ),
    Effect.flatMap((rows) =>
      rows.length < batchLimit ? Effect.sleep(outboxPollInterval) : Effect.void,
    ),
  )

  yield* Effect.forever(poll).pipe(Effect.forkScoped)
}).pipe(Layer.effectDiscard, Layer.provide([QueueConfig.layer, AwsConfig.layer]))

export const OutboxRelaySqs = OutboxRelay.pipe(
  Layer.provide(QueueTransport.layerSqs),
  Layer.provide(SQSServiceFromConfig),
)
