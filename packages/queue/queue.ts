import { SqliteClient } from '@effect/sql-sqlite-bun'
import {
  Cause,
  Context,
  Data,
  type Duration,
  Effect,
  Layer,
  Predicate,
  Schedule,
  Schema,
} from 'effect'
import { PersistedQueue } from 'effect/persistence'
import type { SqlError } from 'effect/sql'

export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
  readonly maxAttempts: number
  readonly retrySchedule: Schedule.Schedule<unknown, number>
  /** Messages that share an id are delivered once: the first one sent. */
  readonly jobId: (message: S['Type']) => string
}

export interface AttemptInfo {
  /** 1-based. */
  readonly attempt: number
  readonly maxAttempts: number
  /** A failure of this attempt dead-letters the message instead of scheduling a retry. */
  readonly isLastAttempt: boolean
}

export type Handler<A, E, R> = (message: A, attempt: AttemptInfo) => Effect.Effect<void, E, R>

export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', {
  cause: Schema.Defect(),
}) {}

export interface QueueClientSqliteOptions {
  readonly filename: string
  /** How long a crashed worker's lock holds its message; keep it above `lockRefreshInterval`. */
  readonly lockExpiration: Duration.Input
  readonly lockRefreshInterval: Duration.Input
}

// The store reads only the exit of the take callback: a failure retries or dead-letters the
// message, an interrupt releases it. This marker carries that failure out of `take` so the loop
// can tell it from a store error.
class AttemptFailed extends Data.TaggedError('AttemptFailed') {}

const runAttempt = <A, I, E, R>(
  definition: QueueDefinition<Schema.Codec<A, I>>,
  handle: Handler<A, E, R>,
) =>
  Effect.fn('runAttempt')(function* (
    message: A,
    metadata: { readonly id: string; readonly attempts: number },
  ) {
    const info: AttemptInfo = {
      attempt: metadata.attempts,
      maxAttempts: definition.maxAttempts,
      isLastAttempt: metadata.attempts >= definition.maxAttempts,
    }
    const [level, text] = info.isLastAttempt
      ? (['Error', 'queue message dead-lettered'] as const)
      : (['Warn', 'queue message attempt failed'] as const)
    return yield* handle(message, info).pipe(
      Effect.tapCauseIf(Predicate.not(Cause.hasInterruptsOnly), (cause) =>
        Effect.logWithLevel(level)(text, cause),
      ),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause) ? Effect.interrupt : Effect.fail(new AttemptFailed()),
      ),
      Effect.annotateLogs({
        queue: definition.name,
        messageId: metadata.id,
        attempt: `${info.attempt}/${info.maxAttempts}`,
      }),
    )
  })

export class QueueClient extends Context.Service<
  QueueClient,
  {
    readonly send: <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) => Effect.Effect<void, QueueError>
    /**
     * Runs `handle` on each message, forever.
     *
     * A failed attempt is logged and retried on the definition's schedule, the last one is logged
     * as dead-lettered, and neither ends the loop. An interrupt releases the in-flight message
     * without counting the attempt.
     */
    readonly consume: <A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ) => Effect.Effect<never, QueueError, R>
  }
>()('@app-template/queue/QueueClient', {
  make: Effect.gen(function* () {
    const factory = yield* PersistedQueue.PersistedQueueFactory

    const send = Effect.fn('QueueClient.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const queue = yield* factory.make(definition)
      yield* queue
        .offer(message, { id: definition.jobId(message) })
        .pipe(Effect.mapError((cause) => new QueueError({ cause })))
    })

    const consume = <A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ) =>
      factory.make(definition).pipe(
        Effect.flatMap((queue) => queue.take(runAttempt(definition, handle))),
        // A store that dies settling a failed attempt (the SQL `ack`) adds its defect beside
        // `AttemptFailed`, and `catchTags` below would drop it unseen.
        Effect.tapCauseIf(
          (cause) => Cause.hasDies(cause) && Cause.hasFails(cause),
          (cause) => Effect.logError('queue store failed settling an attempt', cause),
        ),
        Effect.catchTags({
          AttemptFailed: () => Effect.void,
          PersistedQueueError: (cause) => Effect.fail(new QueueError({ cause })),
        }),
        Effect.forever,
      )

    return { send, consume }
  }),
}) {
  static readonly layer: Layer.Layer<QueueClient, never, PersistedQueue.PersistedQueueStore> =
    Layer.effect(this, this.make).pipe(Layer.provide(PersistedQueue.layer))

  /** A process-local, volatile queue for tests and single-process development. */
  static readonly layerMemory: Layer.Layer<QueueClient> = this.layer.pipe(
    Layer.provide(PersistedQueue.layerStoreMemory),
  )

  /** A queue in one SQLite file, shared by every process that opens the same file. */
  static readonly layerSqlite = ({
    filename,
    ...locks
  }: QueueClientSqliteOptions): Layer.Layer<QueueClient, SqlError.SqlError> =>
    this.layer.pipe(
      Layer.provide(PersistedQueue.layerStoreSql(locks)),
      Layer.provide(SqliteClient.layer({ filename })),
    )
}

export const send = <A, I>(
  definition: QueueDefinition<Schema.Codec<A, I>>,
  message: A,
): Effect.Effect<void, QueueError, QueueClient> =>
  QueueClient.use((client) => client.send(definition, message))

// Any cause restarts the consumer, logged, with no attempt limit, as effect's own SQL poll loop
// does: the SQL store dies on a failed ack, and an unrecovered cause would end the forked fiber
// unlogged while the process runs on. A process restart heals a store no better than waiting does.
const consumerRestart = Schedule.min([
  Schedule.exponential('1 second'),
  Schedule.spaced('1 minute'),
])

/** Consumes `definition` in a fiber the layer's scope owns; closing it releases the job in hand. */
export const worker = <A, I, E, R>(
  definition: QueueDefinition<Schema.Codec<A, I>>,
  handle: Handler<A, E, R>,
): Layer.Layer<never, never, QueueClient | R> =>
  QueueClient.use((client) => client.consume(definition, handle)).pipe(
    Effect.tapCauseIf(Predicate.not(Cause.hasInterruptsOnly), (cause) =>
      Effect.logError('queue consumer failed', cause),
    ),
    Effect.sandbox,
    Effect.retry(consumerRestart),
    Effect.annotateLogs({ queue: definition.name }),
    Effect.forkScoped,
    Layer.effectDiscard,
  )
