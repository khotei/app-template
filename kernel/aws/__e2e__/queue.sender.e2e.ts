import { assert, describe, it } from '@effect/vitest'
import { SQSService } from '@effect-aws/client-sqs'
import { Array as Arr, Effect, Exit, Layer, Schema, UndefinedOr } from 'effect'

import { AwsConfig } from '@app-template/kernel/config'
import { type QueueDefinition, QueueSender } from '@app-template/packages/queue'

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
  name: resources.queues.assistantMessage.name,
  schema: SampleMessage,
} satisfies QueueDefinition<typeof SampleMessage>

const send = QueueSender.use((sender) =>
  sender.send(sampleQueue, new SampleMessage({ chatId: '0192d4e0-7b3a-7c00-8000-000000000030' })),
)

const queueUrl = Effect.gen(function* () {
  const { stage } = yield* AwsConfig
  const sqs = yield* SQSService

  return yield* sqs
    .getQueueUrl({ QueueName: buildResourceName(stage, sampleQueue.name) })
    .pipe(Effect.flatMap(({ QueueUrl }) => Effect.fromNullishOr(QueueUrl)))
})

/** The bodies on the sample queue within `waitSeconds`, parsed, with their attribute names. */
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
        attributes: UndefinedOr.match(message.MessageAttributes, {
          onUndefined: () => [],
          onDefined: Object.keys,
        }),
        body: JSON.parse(UndefinedOr.getOrThrow(message.Body)),
      })),
    })
  })

// Live: SQS long-polls in real time.
describe('QueueSender', { concurrent: false }, () => {
  it.live(
    "a sent message reaches the stage's queue as its body alone",
    () =>
      Effect.gen(function* () {
        yield* send
        const received = yield* receive(10)

        assert.deepStrictEqual(received, [
          { attributes: [], body: { chatId: '0192d4e0-7b3a-7c00-8000-000000000030' } },
        ])
      }).pipe(Effect.provide(QueueSenderTest)),
    30_000,
  )

  it.live('a send SQS refuses fails with QueueError', () =>
    Effect.gen(function* () {
      const sqs = yield* SQSService
      const url = yield* queueUrl
      yield* sqs.deleteQueue({ QueueUrl: url })

      const exit = yield* Effect.exit(send)

      assert.isTrue(Exit.hasFails(exit))
    }).pipe(Effect.provide(QueueSenderTest)),
  )
})
