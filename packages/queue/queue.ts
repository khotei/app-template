import { Cause, Context, Data, Effect, Layer, type Schedule, Schema } from 'effect'
import { PersistedQueue } from 'effect/persistence'

export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
  readonly maxAttempts: number
  readonly retrySchedule: Schedule.Schedule<unknown, number>
}

export interface JobQueue<A> {
  readonly send: (message: A, options: { readonly id: string }) => Effect.Effect<void, QueueError>
  /**
   * Runs `handle` on each message, forever.
   *
   * A failed attempt is logged and retried on the definition's schedule, the last one is logged as
   * dead-lettered, and neither ends the loop. An interrupt releases the in-flight message without
   * counting the attempt.
   */
  readonly consume: <E, R>(
    handle: (message: A) => Effect.Effect<void, E, R>,
  ) => Effect.Effect<never, QueueError, R>
}

export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', {
  cause: Schema.Defect(),
}) {}

export class QueueClient extends Context.Service<
  QueueClient,
  {
    readonly make: <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
    ) => Effect.Effect<JobQueue<A>>
  }
>()('@app-template/queue/QueueClient') {}

// The store reads only the exit of the take callback: a failure retries or dead-letters the
// message, an interrupt releases it. This marker carries that failure out of `take` so the loop
// can tell it from a store error.
class AttemptFailed extends Data.TaggedError('AttemptFailed') {}

const makeJobQueue = <A, I>(
  factory: PersistedQueue.PersistedQueueFactory['Service'],
  definition: QueueDefinition<Schema.Codec<A, I>>,
) =>
  Effect.map(factory.make(definition), (queue): JobQueue<A> => {
    const send = (message: A, options: { readonly id: string }) =>
      queue.offer(message, options).pipe(
        Effect.asVoid,
        Effect.mapError((cause) => new QueueError({ cause })),
      )

    const attempt = <E, R>(
      handle: (message: A) => Effect.Effect<void, E, R>,
      message: A,
      metadata: { readonly id: string; readonly attempts: number },
    ) =>
      handle(message).pipe(
        Effect.catchCause(
          (cause): Effect.Effect<never, AttemptFailed> =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.interrupt
              : (metadata.attempts >= definition.maxAttempts
                  ? Effect.logError('queue message dead-lettered', cause)
                  : Effect.logWarning('queue message attempt failed', cause)
                ).pipe(Effect.andThen(Effect.fail(new AttemptFailed()))),
        ),
        Effect.annotateLogs({
          queue: definition.name,
          messageId: metadata.id,
          attempt: `${metadata.attempts}/${definition.maxAttempts}`,
        }),
      )

    const consume = <E, R>(handle: (message: A) => Effect.Effect<void, E, R>) =>
      queue
        .take((message, metadata) => attempt(handle, message, metadata))
        .pipe(
          Effect.catchTags({
            AttemptFailed: () => Effect.void,
            PersistedQueueError: (cause) => Effect.fail(new QueueError({ cause })),
          }),
          Effect.forever,
        )

    return { send, consume }
  })

/** Provides `QueueClient` over whichever `PersistedQueueStore` the caller provides. */
export const layerPersisted: Layer.Layer<QueueClient, never, PersistedQueue.PersistedQueueStore> =
  Layer.effect(
    QueueClient,
    Effect.gen(function* () {
      const factory = yield* PersistedQueue.PersistedQueueFactory
      return QueueClient.of({ make: (definition) => makeJobQueue(factory, definition) })
    }),
  ).pipe(Layer.provide(PersistedQueue.layer))
