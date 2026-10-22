import {
  Cause,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Pull,
  Result,
  Schedule,
  Schema,
} from 'effect'

import { QueueError, QueueTransport, type Received } from '#queue/queue.transport'

export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
  readonly maxAttempts: number
  readonly retrySchedule: Schedule.Schedule<unknown, number>
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

// Replays the schedule up to `attempt` from a fresh step, as effect's `PersistedQueue` does: the
// attempt is the receive count, so a retry handled by another process gets the same delay.
const buildRetryDelay = Effect.fnUntraced(function* (
  schedule: Schedule.Schedule<unknown, number>,
  attempt: number,
) {
  const step = yield* Schedule.toStep(schedule)
  let elapsed = 0
  let delay = Duration.zero
  for (let input = 1; input <= attempt; input++) {
    const next = yield* Pull.catchDone(step(elapsed, input), () => Effect.undefined)
    if (next === undefined) break
    delay = next[1]
    elapsed += Duration.toMillis(delay)
  }
  return delay
})

const buildAttemptInfo = (received: Received, maxAttempts: number): AttemptInfo => ({
  attempt: received.receiveCount,
  maxAttempts,
  isLastAttempt: received.receiveCount >= maxAttempts,
})

const buildJsonCodec = <A, I>(schema: Schema.Codec<A, I>) =>
  Schema.fromJsonString(Schema.toCodecJson(schema))

const makeClient = ({ queueName, lockExpiration, lockRefreshInterval }: QueueClientOptions) =>
  Effect.gen(function* () {
    const transport = yield* QueueTransport

    const send = Effect.fn('QueueClient.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const body = yield* Schema.encodeEffect(buildJsonCodec(definition.schema))(message).pipe(
        Effect.mapError((cause) => new QueueError({ cause })),
      )
      yield* transport.send(queueName(definition.name), body, {
        jobId: definition.jobId(message),
      })
    })

    const consume = <A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ) => {
      const queue = queueName(definition.name)
      const decode = Schema.decodeEffect(buildJsonCodec(definition.schema))
      const extend = (received: Received, visibility: Duration.Input) =>
        transport.extend(queue, received.handle, visibility)

      const heartbeat = (received: Received) =>
        Effect.sleep(lockRefreshInterval).pipe(
          Effect.andThen(extend(received, lockExpiration)),
          Effect.tapCause((cause) => Effect.logWarning('queue heartbeat failed', cause)),
          Effect.ignore,
          Effect.forever,
        )

      // Visibility settles every outcome: `delete` on success, a retry delay, or 0 so that the
      // next receive redrives a spent message to the dead-letter queue.
      const settle = Effect.fnUntraced(function* (
        received: Received,
        info: AttemptInfo,
        exit: Exit.Exit<void, E>,
      ) {
        if (Exit.isSuccess(exit)) return yield* transport.delete(queue, received.handle)
        if (Cause.hasInterruptsOnly(exit.cause)) return yield* extend(received, 0)
        if (info.isLastAttempt) {
          yield* Effect.logError('queue message dead-lettered', exit.cause)
          return yield* extend(received, 0)
        }
        yield* Effect.logWarning('queue message attempt failed', exit.cause)
        const delay = yield* buildRetryDelay(definition.retrySchedule, info.attempt)
        yield* extend(received, delay)
      })

      const run = Effect.fnUntraced(
        function* (received: Received) {
          const decoded = yield* Effect.result(decode(received.body))
          if (Result.isFailure(decoded)) {
            yield* Effect.logError('queue message does not decode', decoded.failure)
            return yield* extend(received, 0)
          }

          const info = buildAttemptInfo(received, definition.maxAttempts)
          const exit = yield* Effect.raceFirst(
            Effect.exit(handle(decoded.success, info)),
            heartbeat(received),
          ).pipe(Effect.onInterrupt(() => Effect.ignore(extend(received, 0))))
          yield* settle(received, info, exit)
        },
        (effect, received) =>
          Effect.annotateLogs(effect, {
            jobId: received.attributes.jobId,
            attempt: `${received.receiveCount}/${definition.maxAttempts}`,
          }),
      )

      return transport
        .receive(queue, { visibility: lockExpiration, wait: receiveWait })
        .pipe(
          Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: run })),
          Effect.forever,
        )
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
     * Runs `handle` on each message, forever.
     *
     * A failed attempt is logged and retried on the definition's schedule, the last one is logged
     * as dead-lettered, and neither ends the loop. An interrupt returns the in-flight message at
     * once, and its next receive counts as the next attempt.
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

  /** Queues on SQS, whose redrive policy moves a spent message to its dead-letter queue. */
  static readonly layerSqs = (options: QueueClientOptions) =>
    this.layer(options).pipe(Layer.provide(QueueTransport.layerSqs))
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
