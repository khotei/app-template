import { SQSService } from '@effect-aws/client-sqs'
import { Effect, Layer, Predicate } from 'effect'
import { TestClock } from 'effect/testing'

import { buildResourceName, provision, resources } from '@app-template/aws'
import { QueueClient, QueueTransport } from '@app-template/queue'
import { buildStage } from '@app-template/testing'

export interface SentJob {
  readonly queue: string
  readonly jobId: string
  readonly job: unknown
}

/**
 * The inventory provisioned under a fresh stage on the test file's MiniStack, with a
 * `QueueClient` on it, the `QueueTransport` beneath, and the physical name of each queue.
 */
export const provisionQueues = () => {
  const stage = buildStage()
  const queueName = (name: string) => buildResourceName(stage, name)
  const layer = QueueClient.layer({
    queueName,
    lockExpiration: '30 seconds',
    lockRefreshInterval: '10 seconds',
  }).pipe(
    Layer.provideMerge(QueueTransport.layerSqs),
    Layer.provide(Layer.effectDiscard(Effect.orDie(provision(resources, stage)))),
  )
  return { queueName, layer }
}

/** A queue on MiniStack, recording every job sent to it. */
export const recordQueue = () => {
  const sent: Array<SentJob> = []
  const layer = Layer.effect(
    QueueClient,
    Effect.map(QueueClient, (inner) =>
      QueueClient.of({
        ...inner,
        send: (definition, job) =>
          Effect.andThen(
            Effect.sync(() =>
              sent.push({ queue: definition.name, jobId: definition.jobId(job), job }),
            ),
            inner.send(definition, job),
          ),
      }),
    ),
  ).pipe(Layer.provide(provisionQueues().layer))
  return { sent, layer }
}

/**
 * Receives the message on `queue` and leaves it, `times` times, as workers that stopped
 * mid-attempt would, so the next receive is attempt `times + 1`.
 */
export const abandonAttempts = (queue: string, times: number) =>
  QueueTransport.use((transport) =>
    transport.receive(queue, { visibility: 0, wait: '5 seconds' }),
  ).pipe(
    Effect.flatMap(Effect.fromOption),
    Effect.replicateEffect(times, { discard: true }),
    Effect.orDie,
  )

const livePause = TestClock.withLive(Effect.sleep('50 millis'))

/**
 * Pauses in real time, leaving the `TestClock` where it is, until `holds` is true; dies after a
 * minute.
 */
export const pollUntil = (holds: () => boolean) =>
  livePause.pipe(
    Effect.map(holds),
    Effect.repeat({ until: Predicate.isTruthy, times: 1200 }),
    Effect.filterOrFail(Predicate.isTruthy, () => new Error('the awaited condition never held')),
    Effect.orDie,
  )

const isDrained = Effect.fnUntraced(function* (queue: string) {
  const sqs = yield* SQSService

  const { QueueUrl } = yield* sqs.getQueueUrl({ QueueName: queue })
  const { Attributes } = yield* sqs.getQueueAttributes({
    QueueUrl,
    AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
  })

  return (
    Attributes?.ApproximateNumberOfMessages === '0' &&
    Attributes.ApproximateNumberOfMessagesNotVisible === '0'
  )
}, Effect.orDie)

/**
 * Advances the `TestClock` a second at a time, pausing in real time between steps so SQS can
 * deliver, until `queue` holds no message, visible or in flight; dies after a minute.
 *
 * A handler's own sleeps run on the test clock while SQS keeps real time, so a test asserts times
 * relative to the handler's first write, not to the clock's start.
 */
export const runUntilDrained = (queue: string) =>
  TestClock.adjust('1 second').pipe(
    Effect.andThen(livePause),
    Effect.andThen(isDrained(queue)),
    Effect.repeat({ until: Predicate.isTruthy, times: 1200 }),
    Effect.filterOrFail(
      Predicate.isTruthy,
      () => new Error(`queue ${queue} still holds a message`),
    ),
    Effect.orDie,
  )
