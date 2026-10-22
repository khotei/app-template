import { assert, describe, layer } from '@effect/vitest'
import { Array as Arr, Duration, Effect, Fiber, Layer, Option, Record, Struct } from 'effect'

import {
  buildDeadLetterName,
  buildResourceName,
  provision,
  type Resources,
} from '@app-template/aws'
import { AwsClientsMiniStack, buildStage } from '@app-template/testing'

import { QueueTransport, type ReceiveOptions } from '#queue/queue.transport'

const stage = buildStage()

const maxReceiveCount = 3

const inventory = {
  buckets: {},
  queues: {
    received: { name: 'received', maxReceiveCount },
    hidden: { name: 'hidden', maxReceiveCount },
    released: { name: 'released', maxReceiveCount },
    rewoken: { name: 'rewoken', maxReceiveCount },
    deleted: { name: 'deleted', maxReceiveCount },
    redriven: { name: 'redriven', maxReceiveCount },
    waited: { name: 'waited', maxReceiveCount },
    woken: { name: 'woken', maxReceiveCount },
  },
} as const satisfies Resources

const queues = Record.map(inventory.queues, (queue) => buildResourceName(stage, queue.name))

const options = { visibility: '30 seconds', wait: '1 second', maxReceiveCount } as const

const QueueTransportMiniStack = Layer.mergeAll(
  QueueTransport.layerSqs,
  Layer.effectDiscard(provision(inventory, stage)),
).pipe(Layer.provide(AwsClientsMiniStack))

const receiveSome = (queue: string, receiveOptions: ReceiveOptions) =>
  QueueTransport.use((transport) => transport.receive(queue, receiveOptions)).pipe(
    Effect.flatMap(Effect.fromOption),
  )

describe.each([
  { name: 'memory', transport: QueueTransport.layerMemory },
  { name: 'SQS on MiniStack', transport: QueueTransportMiniStack },
])('QueueTransport on $name', ({ transport }) => {
  layer(transport, { timeout: '60 seconds', excludeTestServices: true })((it) => {
    it.effect('receives a sent body with its attribute and receiveCount 1', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.received, 'hello', { jobId: 'job-1' })
        const received = yield* receiveSome(queues.received, options)

        assert.deepStrictEqual(Struct.omit(received, ['handle']), {
          body: 'hello',
          receiveCount: 1,
          attributes: { jobId: 'job-1' },
        })
      }),
    )

    it.effect('does not receive a received message again within its visibility', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.hidden, 'hello', { jobId: 'job-1' })
        yield* receiveSome(queues.hidden, options)
        const again = yield* queue.receive(queues.hidden, { ...options, wait: 0 })

        assert.deepStrictEqual(again, Option.none())
      }),
    )

    it.effect('returns a message released by extend(0) at once, with receiveCount 2', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.released, 'hello', { jobId: 'job-1' })
        const first = yield* receiveSome(queues.released, options)
        yield* queue.extend(queues.released, first.handle, 0)
        const again = yield* receiveSome(queues.released, { ...options, wait: 0 })

        assert.strictEqual(again.body, 'hello')
        assert.strictEqual(again.receiveCount, 2)
      }),
    )

    it.effect('returns early from a wait when a received message is released by extend(0)', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.rewoken, 'hello', { jobId: 'job-1' })
        const first = yield* receiveSome(queues.rewoken, options)
        const waiting = yield* Effect.forkChild(
          Effect.timed(receiveSome(queues.rewoken, { ...options, wait: '3 seconds' })),
        )
        yield* Effect.sleep('200 millis')
        yield* queue.extend(queues.rewoken, first.handle, 0)
        const [elapsed, again] = yield* Fiber.join(waiting)

        assert.strictEqual(again.receiveCount, 2)
        assert.isBelow(Duration.toMillis(elapsed), 2000)
      }),
    )

    it.effect('removes a deleted message', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.deleted, 'hello', { jobId: 'job-1' })
        const received = yield* receiveSome(queues.deleted, { ...options, visibility: 0 })
        yield* queue.delete(queues.deleted, received.handle)
        const again = yield* queue.receive(queues.deleted, { ...options, wait: 0 })

        assert.deepStrictEqual(again, Option.none())
      }),
    )

    it.effect('moves a message received maxReceiveCount times to <queue>-dlq', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.redriven, 'hello', { jobId: 'job-1' })
        const counts = yield* Effect.forEach(Arr.range(1, maxReceiveCount), () =>
          receiveSome(queues.redriven, { ...options, visibility: 0 }).pipe(
            Effect.map((received) => received.receiveCount),
          ),
        )
        const after = yield* queue.receive(queues.redriven, { ...options, wait: 0 })
        const deadLettered = yield* receiveSome(buildDeadLetterName(queues.redriven), options)

        assert.deepStrictEqual(counts, Arr.range(1, maxReceiveCount))
        assert.deepStrictEqual(after, Option.none())
        assert.strictEqual(deadLettered.body, 'hello')
      }),
    )

    it.effect('waits the whole wait on an empty queue', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        const [elapsed, received] = yield* Effect.timed(
          queue.receive(queues.waited, { ...options, wait: '1 second' }),
        )

        assert.deepStrictEqual(received, Option.none())
        assert.isAtLeast(Duration.toMillis(elapsed), 1000)
      }),
    )

    it.effect('returns early from a wait when a message is sent', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        const waiting = yield* Effect.forkChild(
          Effect.timed(receiveSome(queues.woken, { ...options, wait: '3 seconds' })),
        )
        yield* Effect.sleep('200 millis')
        yield* queue.send(queues.woken, 'hello', { jobId: 'job-1' })
        const [elapsed, received] = yield* Fiber.join(waiting)

        assert.strictEqual(received.body, 'hello')
        assert.isBelow(Duration.toMillis(elapsed), 2000)
      }),
    )
  })
})
