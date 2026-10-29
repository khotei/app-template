import { inArray } from 'drizzle-orm'
import { Array as Arr, Cause, Effect, Layer, Predicate, Schedule, Struct } from 'effect'
import { SqlClient } from 'effect/sql'

import { buildResourceName } from '@app-template/aws'
import { AwsConfig, QueueConfig } from '@app-template/config'
import { QueueTransport } from '@app-template/queue'

import { Db, unwrapQueryError } from '#infrastructure/db/db.client'
import { outbox } from '#infrastructure/outbox/outbox.entity'
import { SQSServiceFromConfig } from '#infrastructure/shared/aws.client'

const batchLimit = 10

type OutboxRow = typeof outbox.$inferSelect

const isFullBatch = (rows: ReadonlyArray<OutboxRow>) => rows.length === batchLimit

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

  const selectBatch = db
    .select()
    .from(outbox)
    .orderBy(outbox.createdAt, outbox.id)
    .limit(batchLimit)
    .for('update', { skipLocked: true })

  const sendRow = (row: OutboxRow) =>
    transport.send(buildResourceName(stage, row.queue), {
      body: JSON.stringify(row.body),
      attributes: { jobId: row.jobId },
    })

  // `asVoid` gives the delete the type of `Effect.void`, the match's other arm.
  const deleteRows = (rows: Arr.NonEmptyReadonlyArray<OutboxRow>) =>
    db
      .delete(outbox)
      .where(inArray(outbox.id, Arr.map(rows, Struct.get('id'))))
      .pipe(Effect.asVoid)

  const relayBatch = selectBatch.pipe(
    Effect.tap(Effect.forEach(sendRow, { discard: true })),
    Effect.tap(Arr.match({ onEmpty: () => Effect.void, onNonEmpty: deleteRows })),
    Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError),
    sql.withTransaction,
  )

  yield* relayBatch.pipe(
    Effect.repeat({ while: isFullBatch }),
    Effect.tapCauseIf(Predicate.not(Cause.hasInterruptsOnly), (cause) =>
      Effect.logError('outbox relay failed', cause),
    ),
    Effect.catchCauseIf(Predicate.not(Cause.hasInterruptsOnly), () => Effect.void),
    Effect.repeat(Schedule.spaced(outboxPollInterval)),
    Effect.forkScoped,
  )
}).pipe(Layer.effectDiscard, Layer.provide(QueueConfig.layer))

export const OutboxRelaySqs = OutboxRelay.pipe(
  Layer.provide(QueueTransport.layerSqs),
  Layer.provide([AwsConfig.layer, SQSServiceFromConfig]),
)
