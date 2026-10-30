import {
  Cause,
  Context,
  Duration,
  Effect,
  Exit,
  flow,
  Layer,
  Option,
  Predicate,
  pipe,
  Result,
  Schedule,
  Schema,
} from 'effect'

import { QueueError, QueueTransport, type Received } from '#queue/queue.transport'

export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
  readonly maxAttempts: number
  /** How long a message waits after a failed `attempt`. */
  readonly retryDelay: (attempt: number) => Duration.Input
  /**
   * Travels with the message for logs only: delivery is at-least-once, so a handler must leave
   * the same state when a job comes twice.
   */
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

export interface QueueClientOptions {
  /** The physical queue that holds a definition's `name`. */
  readonly queueName: (name: string) => string
  /** How long a received message stays hidden from other workers; keep it above `lockRefreshInterval`. */
  readonly lockExpiration: Duration.Input
  readonly lockRefreshInterval: Duration.Input
}

const receiveWait = Duration.seconds(20)

type Restore = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

const buildAttemptInfo = (received: Received, maxAttempts: number): AttemptInfo => ({
  attempt: received.receiveCount,
  maxAttempts,
  isLastAttempt: received.receiveCount >= maxAttempts,
})

const buildJsonCodec = <A, I>(schema: Schema.Codec<A, I>) =>
  Schema.fromJsonString(Schema.toCodecJson(schema))

const encodeWith = <A, I>(codec: Schema.Codec<A, I>) =>
  flow(
    Schema.encodeEffect(codec),
    Effect.mapError((cause) => new QueueError({ cause })),
  )

/** The job as its definition's schema encodes it to JSON: the value an outbox row stores. */
export const encodeJob = <A, I>(definition: QueueDefinition<Schema.Codec<A, I>>, message: A) =>
  pipe(message, encodeWith(Schema.toCodecJson(definition.schema)))

const encodeBody = <A, I>(definition: QueueDefinition<Schema.Codec<A, I>>, message: A) =>
  pipe(message, encodeWith(buildJsonCodec(definition.schema)))

const makeClient = ({ queueName, lockExpiration, lockRefreshInterval }: QueueClientOptions) =>
  Effect.gen(function* () {
    const transport = yield* QueueTransport

    const send = Effect.fn('QueueClient.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const body = yield* encodeBody(definition, message)
      yield* transport.send(queueName(definition.name), {
        body,
        attributes: { jobId: definition.jobId(message) },
      })
    })

    const consume = <A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ) => {
      const queue = queueName(definition.name)
      const decode = Schema.decodeEffect(buildJsonCodec(definition.schema))
      const extend = (received: Received, visibility: Duration.Input) =>
        transport.extend(queue, { handle: received.handle, visibility })
      const release = (received: Received) => extend(received, 0)

      const heartbeat = (received: Received) =>
        extend(received, lockExpiration).pipe(
          Effect.delay(lockRefreshInterval),
          Effect.tapCause((cause) => Effect.logWarning('queue heartbeat failed', cause)),
          Effect.ignore,
          Effect.forever,
        )

      // `restore` lets an interrupt reach the effect, which then releases the message at once.
      const releaseOnInterrupt =
        (received: Received, restore: Restore) =>
        <B, E2, R2>(effect: Effect.Effect<B, E2, R2>) =>
          restore(effect).pipe(Effect.onInterrupt(() => release(received).pipe(Effect.ignore)))

      // A failed attempt waits its retry delay; the last is released at once, so that the next
      // receive redrives it to the dead-letter queue.
      const retry = (received: Received, info: AttemptInfo) =>
        info.isLastAttempt
          ? release(received)
          : extend(received, definition.retryDelay(info.attempt))

      const settle = Effect.fnUntraced(function* (
        received: Received,
        { info, exit }: { readonly info: AttemptInfo; readonly exit: Exit.Exit<void, E> },
      ) {
        if (Exit.isSuccess(exit)) return yield* transport.delete(queue, received.handle)
        if (Cause.hasInterruptsOnly(exit.cause)) return yield* release(received)

        yield* info.isLastAttempt
          ? Effect.logError('queue message dead-lettered', exit.cause)
          : Effect.logWarning('queue message attempt failed', exit.cause)
        yield* retry(received, info)
      })

      // Runs masked from the receive on, so no interrupt finds the message unreleased: only the
      // decode and the handler `releaseOnInterrupt`.
      const run = Effect.fnUntraced(
        function* (received: Received, restore: Restore) {
          const info = buildAttemptInfo(received, definition.maxAttempts)
          const decoded = yield* decode(received.body).pipe(
            Effect.result,
            releaseOnInterrupt(received, restore),
          )
          if (Result.isFailure(decoded)) {
            yield* Effect.logError('queue message does not decode', decoded.failure)
            return yield* retry(received, info)
          }

          const exit = yield* handle(decoded.success, info).pipe(
            Effect.exit,
            Effect.raceFirst(heartbeat(received)),
            releaseOnInterrupt(received, restore),
          )
          yield* settle(received, { info, exit })
        },
        (effect, received) =>
          Effect.annotateLogs(effect, {
            jobId: received.attributes.jobId,
            attempt: `${received.receiveCount}/${definition.maxAttempts}`,
          }),
      )

      const receiveAndRun = Effect.fnUntraced(function* (restore: Restore) {
        const next = yield* restore(
          transport.receive(queue, { visibility: lockExpiration, wait: receiveWait }),
        )
        if (Option.isNone(next)) return
        yield* run(next.value, restore)
      })

      return Effect.uninterruptibleMask(receiveAndRun).pipe(Effect.forever)
    }

    return QueueClient.of({ send, consume })
  })

export class QueueClient extends Context.Service<
  QueueClient,
  {
    readonly send: <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) => Effect.Effect<void, QueueError>
    /**
     * Runs `handle` on each message forever, the attempt being its receive count: success deletes
     * it, a failure or an undecodable body hides it for `retryDelay`, or on the last attempt makes
     * it visible at once for the dead-letter queue, and an interrupt makes it visible at once for
     * its next attempt.
     *
     * An interrupt waits for the settle under way, so a retry keeps its delay and a delete is
     * not lost.
     */
    readonly consume: <A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ) => Effect.Effect<never, QueueError, R>
  }
>()('@app-template/queue/QueueClient') {
  static readonly layer = (
    options: QueueClientOptions,
  ): Layer.Layer<QueueClient, never, QueueTransport> => Layer.effect(this, makeClient(options))
}

// Any cause restarts the consumer, logged, with no attempt limit: an unrecovered cause would end
// the forked fiber unlogged while the process runs on, and a process restart heals the transport
// no better than waiting does.
const consumerRestart = Schedule.min([
  Schedule.exponential('1 second'),
  Schedule.spaced('1 minute'),
])

/** Consumes `definition` in a fiber the layer's scope owns; closing it returns the job in hand. */
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
