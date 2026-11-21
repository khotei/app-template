import { assert, describe, it } from '@effect/vitest'
import { SQSService } from '@effect-aws/client-sqs'
import { Array as Arr, Effect, Exit, Layer, Schema, UndefinedOr } from 'effect'

import { awsConfig } from '@app-template/kernel/config'
import { type QueueDefinition, QueueError, QueueSender } from '@app-template/packages/queue'

import { QueueSenderOfStage } from '#kernel/aws/aws.client'
import { buildResourceName } from '#kernel/aws/resources/naming'
import { resources } from '#kernel/aws/resources/resources'
import { AwsTest } from '#testing/aws/e2e/aws.test-layer'

const QueueSenderTest = QueueSenderOfStage.pipe(Layer.provideMerge(AwsTest))

/** A message shaped as a reply's, since the kernel knows no module's queues. */
class SampleMessage extends Schema.Class<SampleMessage>('SampleMessage')({
  chatId: Schema.String,
}) {}

/** On a queue every stage provisions, so the sender sends to its real queue. */
const sampleQueue = {
  name: resources.queues.replyToMessage.name,
  schema: SampleMessage,
} satisfies QueueDefinition<typeof SampleMessage>

const send = QueueSender.use((sender) =>
  sender.send(sampleQueue, new SampleMessage({ chatId: '0192d4e0-7b3a-7c00-8000-000000000030' })),
)

const queueUrl = Effect.gen(function* () {
  const { stage } = yield* awsConfig
  const sqs = yield* SQSService

  return yield* sqs
    .getQueueUrl({ QueueName: buildResourceName(stage, sampleQueue.name) })
    .pipe(Effect.flatMap(({ QueueUrl }) => Effect.fromNullishOr(QueueUrl)))
})

/** The messages on the sample queue within `waitSeconds`: each body parsed, beside its traceparent. */
const receive = (waitSeconds: number) =>
  Effect.gen(function* () {
    const sqs = yield* SQSService
    const url = yield* queueUrl

    const { Messages } = yield* sqs.receiveMessage({
      QueueUrl: url,
      MessageAttributeNames: ['All'],
      WaitTimeSeconds: waitSeconds,
    })
    return UndefinedOr.match(Messages, {
      onUndefined: () => [],
      onDefined: Arr.map((message) => ({
        body: JSON.parse(UndefinedOr.getOrThrow(message.Body)),
        traceparent: message.MessageAttributes?.traceparent?.StringValue,
      })),
    })
  })

// Live: SQS long-polls in real time.
describe('QueueSender', { concurrent: false }, () => {
  it.live("a sent message reaches the stage's queue with the trace it was sent in", () =>
    Effect.gen(function* () {
      const { traceId } = yield* Effect.currentSpan.pipe(Effect.orDie)
      yield* send
      const received = yield* receive(10)

      assert.deepStrictEqual(
        Arr.map(received, ({ body }) => body),
        [{ chatId: '0192d4e0-7b3a-7c00-8000-000000000030' }],
      )
      assert.match(String(received[0]?.traceparent), new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`))
    }).pipe(Effect.withSpan('test'), Effect.provide(QueueSenderTest)),
  )

  it.live('a send SQS refuses fails with one QueueError, and the next looks the URL up again', () =>
    Effect.gen(function* () {
      const { stage } = yield* awsConfig
      const sqs = yield* SQSService
      const url = yield* queueUrl
      yield* sqs.deleteQueue({ QueueUrl: url })

      const refused = yield* Effect.flip(send)
      yield* sqs.createQueue({ QueueName: buildResourceName(stage, sampleQueue.name) })
      const resent = yield* Effect.exit(send)

      assert.instanceOf(refused, QueueError)
      assert.notInstanceOf(refused.cause, QueueError)
      assert.isTrue(Exit.isSuccess(resent))
    }).pipe(Effect.provide(QueueSenderTest)),
  )
})
