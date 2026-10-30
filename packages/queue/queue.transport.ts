import { SQSService } from '@effect-aws/client-sqs'
import { Array as Arr, Cache, Context, Duration, Effect, Exit, Layer, Option, Schema } from 'effect'

export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', {
  cause: Schema.Defect(),
}) {}

export interface MessageAttributes {
  readonly jobId: string
}

export interface MessageContent {
  readonly body: string
  readonly attributes: MessageAttributes
}

export interface Received extends MessageContent {
  readonly handle: string
  readonly receiveCount: number
}

export interface ReceiveOptions {
  readonly visibility: Duration.Input
  /** At most 20 seconds, SQS's long-poll limit. */
  readonly wait: Duration.Input
}

export interface VisibilityChange {
  readonly handle: string
  readonly visibility: Duration.Input
}

const SqsMessage = Schema.Struct({
  ReceiptHandle: Schema.String,
  Body: Schema.String,
  Attributes: Schema.Struct({ ApproximateReceiveCount: Schema.NumberFromString }),
  // A message sent with no `jobId` still reaches its handler, logged under an empty one, rather
  // than failing the receive for every message behind it.
  MessageAttributes: Schema.Struct({ jobId: Schema.Struct({ StringValue: Schema.String }) }).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({ jobId: { StringValue: '' } })),
  ),
})

const SqsReceived = Schema.Struct({
  Messages: Schema.Array(SqsMessage).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
})

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

  const send = Effect.fn('QueueTransport.send')(function* (queue: string, message: MessageContent) {
    const url = yield* Cache.get(urls, queue)
    yield* sqs.sendMessage({
      QueueUrl: url,
      MessageBody: message.body,
      MessageAttributes: { jobId: { DataType: 'String', StringValue: message.attributes.jobId } },
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

    return Arr.head(Messages).pipe(Option.map(toReceived))
  }, failQueue)

  const extend = Effect.fn('QueueTransport.extend')(function* (
    queue: string,
    { handle, visibility }: VisibilityChange,
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
    readonly send: (queue: string, message: MessageContent) => Effect.Effect<void, QueueError>
    /**
     * Long-polls up to `wait`; a message received is hidden for `visibility`. A message already
     * received the `maxReceiveCount` of the queue's `RedrivePolicy` is moved to its dead-letter
     * queue instead of returned.
     */
    readonly receive: (
      queue: string,
      options: ReceiveOptions,
    ) => Effect.Effect<Option.Option<Received>, QueueError>
    /** Visible again after `visibility`: the heartbeat, a retry delay, or 0 to release at once. */
    readonly extend: (queue: string, change: VisibilityChange) => Effect.Effect<void, QueueError>
    readonly delete: (queue: string, handle: string) => Effect.Effect<void, QueueError>
  }
>()('@app-template/queue/QueueTransport') {
  static readonly layerSqs: Layer.Layer<QueueTransport, never, SQSService> = Layer.effect(
    this,
    makeSqs,
  )
}
