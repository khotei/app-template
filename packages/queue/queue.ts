import { Cause, Context, Data, Effect, Layer, Schedule, Schema } from 'effect'
import { PersistedQueue } from 'effect/persistence'

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
>()('@app-template/queue/QueueClient') {}

// The store reads only the exit of the take callback: a failure retries or dead-letters the
// message, an interrupt releases it. This marker carries that failure out of `take` so the loop
// can tell it from a store error.
class AttemptFailed extends Data.TaggedError('AttemptFailed') {}

const runAttempt = Effect.fn('runAttempt')(function* <A, I, E, R>(
  definition: QueueDefinition<Schema.Codec<A, I>>,
  handle: Handler<A, E, R>,
  message: A,
  metadata: { readonly id: string; readonly attempts: number },
) {
  const info: AttemptInfo = {
    attempt: metadata.attempts,
    maxAttempts: definition.maxAttempts,
    isLastAttempt: metadata.attempts >= definition.maxAttempts,
  }
  return yield* handle(message, info).pipe(
    Effect.catchCause(
      (cause): Effect.Effect<never, AttemptFailed> =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.interrupt
          : (info.isLastAttempt
              ? Effect.logError('queue message dead-lettered', cause)
              : Effect.logWarning('queue message attempt failed', cause)
            ).pipe(Effect.andThen(Effect.fail(new AttemptFailed()))),
    ),
    Effect.annotateLogs({
      queue: definition.name,
      messageId: metadata.id,
      attempt: `${info.attempt}/${info.maxAttempts}`,
    }),
  )
})

/** Provides `QueueClient` over whichever `PersistedQueueStore` the caller provides. */
export const layerPersisted: Layer.Layer<QueueClient, never, PersistedQueue.PersistedQueueStore> =
  Layer.effect(
    QueueClient,
    Effect.gen(function* () {
      const factory = yield* PersistedQueue.PersistedQueueFactory
      return QueueClient.of({
        send: Effect.fn('QueueClient.send')(function* <A, I>(
          definition: QueueDefinition<Schema.Codec<A, I>>,
          message: A,
        ) {
          const queue = yield* factory.make(definition)
          yield* queue
            .offer(message, { id: definition.jobId(message) })
            .pipe(Effect.mapError((cause) => new QueueError({ cause })))
        }),
        consume: (definition, handle) =>
          factory.make(definition).pipe(
            Effect.flatMap((queue) =>
              queue.take((message, metadata) => runAttempt(definition, handle, message, metadata)),
            ),
            // A store that dies settling a failed attempt (the SQL `ack`) adds its defect beside
            // `AttemptFailed`, and `catchTags` below would drop it unseen.
            Effect.tapCause((cause) =>
              Cause.hasDies(cause) && Cause.hasFails(cause)
                ? Effect.logError('queue store failed settling an attempt', cause)
                : Effect.void,
            ),
            Effect.catchTags({
              AttemptFailed: () => Effect.void,
              PersistedQueueError: (cause) => Effect.fail(new QueueError({ cause })),
            }),
            Effect.forever,
          ),
      })
    }),
  ).pipe(Layer.provide(PersistedQueue.layer))

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
  Layer.effectDiscard(
    Effect.forkScoped(
      QueueClient.use((client) => client.consume(definition, handle)).pipe(
        Effect.tapCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.logError('queue consumer failed', cause),
        ),
        Effect.sandbox,
        Effect.retry(consumerRestart),
        Effect.annotateLogs({ queue: definition.name }),
      ),
    ),
  )
