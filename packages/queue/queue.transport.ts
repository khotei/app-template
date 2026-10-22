import { SQSService } from '@effect-aws/client-sqs'
import {
  Array as Arr,
  Cache,
  Clock,
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Ref,
  Schema,
} from 'effect'

import { buildDeadLetterName } from '@app-template/aws'

export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', {
  cause: Schema.Defect(),
}) {}

export interface MessageAttributes {
  readonly jobId: string
}

export interface Received {
  readonly handle: string
  readonly body: string
  readonly receiveCount: number
  readonly attributes: MessageAttributes
}

export interface ReceiveOptions {
  readonly visibility: Duration.Input
  /** At most 20 seconds, SQS's long-poll limit. */
  readonly wait: Duration.Input
  readonly maxReceiveCount: number
}

interface StoredMessage {
  readonly id: string
  readonly body: string
  readonly attributes: MessageAttributes
  readonly receiveCount: number
  readonly visibleAt: number
  readonly handle: Option.Option<string>
}

const isVisibleAt =
  (now: number): Predicate.Predicate<StoredMessage> =>
  (message) =>
    message.visibleAt <= now

const isExhausted =
  (maxReceiveCount: number): Predicate.Predicate<StoredMessage> =>
  (message) =>
    message.receiveCount >= maxReceiveCount

const hasHandle =
  (handle: string): Predicate.Predicate<StoredMessage> =>
  (message) =>
    Option.contains(message.handle, handle)

const makeMemory = Effect.gen(function* () {
  const queues = new Map<string, ReadonlyArray<StoredMessage>>()
  const firstArrival = yield* Deferred.make<void>()
  const arrival = yield* Ref.make(firstArrival)

  const messagesOf = (queue: string) => queues.get(queue) ?? []

  const updateWhere = (
    queue: string,
    holds: Predicate.Predicate<StoredMessage>,
    change: (message: StoredMessage) => StoredMessage,
  ) =>
    queues.set(
      queue,
      Arr.map(messagesOf(queue), (message) => (holds(message) ? change(message) : message)),
    )

  const wakeReceivers = Effect.gen(function* () {
    const next = yield* Deferred.make<void>()
    const arrived = yield* Ref.getAndSet(arrival, next)
    yield* Deferred.succeed(arrived, undefined)
  })

  const redrive = (queue: string, { maxReceiveCount }: ReceiveOptions, now: number) => {
    const isDue = Predicate.and(isVisibleAt(now), isExhausted(maxReceiveCount))
    const deadLetter = buildDeadLetterName(queue)
    // Counted afresh, or a receive from the dead-letter queue would move it on again.
    const moved = Arr.map(Arr.filter(messagesOf(queue), isDue), (message) => ({
      ...message,
      receiveCount: 0,
      handle: Option.none(),
    }))
    queues.set(queue, Arr.filter(messagesOf(queue), Predicate.not(isDue)))
    queues.set(deadLetter, Arr.appendAll(messagesOf(deadLetter), moved))
  }

  const take = (queue: string, options: ReceiveOptions, now: number): Option.Option<Received> => {
    redrive(queue, options, now)
    const found = Arr.findFirst(messagesOf(queue), isVisibleAt(now))
    if (Option.isNone(found)) {
      return Option.none()
    }

    const handle = crypto.randomUUID()
    const taken = {
      ...found.value,
      receiveCount: found.value.receiveCount + 1,
      visibleAt: now + Duration.toMillis(options.visibility),
      handle: Option.some(handle),
    }
    updateWhere(
      queue,
      (message) => message.id === taken.id,
      () => taken,
    )
    const { body, receiveCount, attributes } = taken
    return Option.some({ handle, body, receiveCount, attributes })
  }

  const nextWake = (queue: string, now: number, deadline: number): number => {
    const hidden = Arr.filter(messagesOf(queue), Predicate.not(isVisibleAt(now)))
    return Math.min(deadline, ...Arr.map(hidden, (message) => message.visibleAt))
  }

  const poll = Effect.fnUntraced(function* (
    queue: string,
    options: ReceiveOptions,
    deadline: number,
  ): Effect.fn.Return<Option.Option<Received>> {
    const arrived = yield* Ref.get(arrival)
    const now = yield* Clock.currentTimeMillis
    const received = yield* Effect.sync(() => take(queue, options, now))

    if (Option.isSome(received) || now >= deadline) {
      return received
    }

    const wake = yield* Effect.sync(() => nextWake(queue, now, deadline))
    yield* Effect.raceFirst(Deferred.await(arrived), Effect.sleep(wake - now))
    return yield* poll(queue, options, deadline)
  })

  const send = Effect.fn('QueueTransport.send')(function* (
    queue: string,
    body: string,
    attributes: MessageAttributes,
  ) {
    const now = yield* Clock.currentTimeMillis
    const message: StoredMessage = {
      id: crypto.randomUUID(),
      body,
      attributes,
      receiveCount: 0,
      visibleAt: now,
      handle: Option.none(),
    }

    yield* Effect.sync(() => queues.set(queue, Arr.append(messagesOf(queue), message)))
    yield* wakeReceivers
  })

  const receive = Effect.fn('QueueTransport.receive')(function* (
    queue: string,
    options: ReceiveOptions,
  ) {
    const now = yield* Clock.currentTimeMillis
    return yield* poll(queue, options, now + Duration.toMillis(options.wait))
  })

  const extend = Effect.fn('QueueTransport.extend')(function* (
    queue: string,
    handle: string,
    visibility: Duration.Input,
  ) {
    const now = yield* Clock.currentTimeMillis
    const visibleAt = now + Duration.toMillis(visibility)

    yield* Effect.sync(() =>
      updateWhere(queue, hasHandle(handle), (message) => ({ ...message, visibleAt })),
    )
    yield* wakeReceivers
  })

  const remove = Effect.fn('QueueTransport.delete')((queue: string, handle: string) =>
    Effect.sync(() =>
      queues.set(queue, Arr.filter(messagesOf(queue), Predicate.not(hasHandle(handle)))),
    ),
  )

  return { send, receive, extend, delete: remove }
})

const SqsMessage = Schema.Struct({
  ReceiptHandle: Schema.String,
  Body: Schema.String,
  Attributes: Schema.Struct({ ApproximateReceiveCount: Schema.NumberFromString }),
  MessageAttributes: Schema.Struct({ jobId: Schema.Struct({ StringValue: Schema.String }) }),
})

const SqsReceived = Schema.Struct({ Messages: Schema.optionalKey(Schema.Array(SqsMessage)) })

const decodeReceived = Schema.decodeUnknownEffect(SqsReceived)

const toReceived = (message: typeof SqsMessage.Type): Received => ({
  handle: message.ReceiptHandle,
  body: message.Body,
  receiveCount: message.Attributes.ApproximateReceiveCount,
  attributes: { jobId: message.MessageAttributes.jobId.StringValue },
})

/** SQS takes whole seconds; rounding up keeps a message hidden at least as long as asked. */
const toWholeSeconds = (duration: Duration.Input): number => Math.ceil(Duration.toSeconds(duration))

const failQueue = Effect.mapError((cause: unknown) => new QueueError({ cause }))

const makeSqs = Effect.gen(function* () {
  const sqs = yield* SQSService
  const urls = yield* Cache.makeWith(
    (queue: string) =>
      sqs
        .getQueueUrl({ QueueName: queue })
        .pipe(Effect.flatMap(({ QueueUrl }) => Effect.fromNullishOr(QueueUrl))),
    {
      capacity: Number.POSITIVE_INFINITY,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
    },
  )

  const send = Effect.fn('QueueTransport.send')(function* (
    queue: string,
    body: string,
    attributes: MessageAttributes,
  ) {
    const url = yield* Cache.get(urls, queue)
    yield* sqs.sendMessage({
      QueueUrl: url,
      MessageBody: body,
      MessageAttributes: { jobId: { DataType: 'String', StringValue: attributes.jobId } },
    })
  }, failQueue)

  const receive = Effect.fn('QueueTransport.receive')(function* (
    queue: string,
    options: ReceiveOptions,
  ) {
    const url = yield* Cache.get(urls, queue)
    const response = yield* sqs.receiveMessage({
      QueueUrl: url,
      MaxNumberOfMessages: 1,
      VisibilityTimeout: toWholeSeconds(options.visibility),
      WaitTimeSeconds: toWholeSeconds(options.wait),
      MessageAttributeNames: ['jobId'],
      MessageSystemAttributeNames: ['ApproximateReceiveCount'],
    })
    const { Messages } = yield* decodeReceived(response)

    return Option.map(Arr.head(Messages ?? []), toReceived)
  }, failQueue)

  const extend = Effect.fn('QueueTransport.extend')(function* (
    queue: string,
    handle: string,
    visibility: Duration.Input,
  ) {
    const url = yield* Cache.get(urls, queue)
    yield* sqs.changeMessageVisibility({
      QueueUrl: url,
      ReceiptHandle: handle,
      VisibilityTimeout: toWholeSeconds(visibility),
    })
  }, failQueue)

  const remove = Effect.fn('QueueTransport.delete')(function* (queue: string, handle: string) {
    const url = yield* Cache.get(urls, queue)
    yield* sqs.deleteMessage({ QueueUrl: url, ReceiptHandle: handle })
  }, failQueue)

  return { send, receive, extend, delete: remove }
})

export class QueueTransport extends Context.Service<
  QueueTransport,
  {
    /** `jobId` travels for logs only: nothing deduplicates on it. */
    readonly send: (
      queue: string,
      body: string,
      attributes: MessageAttributes,
    ) => Effect.Effect<void, QueueError>
    /**
     * Long-polls up to `wait`; a message received is hidden for `visibility`. A message already
     * received `maxReceiveCount` times is moved to `buildDeadLetterName(queue)` instead of
     * returned.
     */
    readonly receive: (
      queue: string,
      options: ReceiveOptions,
    ) => Effect.Effect<Option.Option<Received>, QueueError>
    /** Visible again after `visibility`: the heartbeat, a retry delay, or 0 to release at once. */
    readonly extend: (
      queue: string,
      handle: string,
      visibility: Duration.Input,
    ) => Effect.Effect<void, QueueError>
    readonly delete: (queue: string, handle: string) => Effect.Effect<void, QueueError>
  }
>()('@app-template/queue/QueueTransport') {
  /** A process-local transport whose waits and visibility run on `Clock`. */
  static readonly layerMemory: Layer.Layer<QueueTransport> = Layer.effect(this, makeMemory)

  /** Ignores `maxReceiveCount`: the queue's `RedrivePolicy` enforces it. */
  static readonly layerSqs: Layer.Layer<QueueTransport, never, SQSService> = Layer.effect(
    this,
    makeSqs,
  )
}
