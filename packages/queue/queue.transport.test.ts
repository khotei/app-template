import { assert, describe, layer } from '@effect/vitest'
import { Array as Arr, Duration, Effect, Layer, Option, Record, Struct } from 'effect'

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
    deleted: { name: 'deleted', maxReceiveCount },
    redriven: { name: 'redriven', maxReceiveCount },
    waited: { name: 'waited', maxReceiveCount },
  },
} as const satisfies Resources

const queues = Record.map(inventory.queues, (queue) => buildResourceName(stage, queue.name))

const options = { visibility: '30 seconds', wait: '1 second' } as const

const hello = { body: 'hello', attributes: { jobId: 'job-1' } } as const

const QueueTransportMiniStack = Layer.mergeAll(
  QueueTransport.layerSqs,
  Layer.effectDiscard(provision(inventory, stage)),
).pipe(Layer.provide(AwsClientsMiniStack))

const receiveSome = (queue: string, receiveOptions: ReceiveOptions) =>
  QueueTransport.use((transport) => transport.receive(queue, receiveOptions)).pipe(
    Effect.flatMap(Effect.fromOption),
  )

describe('QueueTransport.layerSqs on MiniStack', () => {
  layer(QueueTransportMiniStack, { timeout: '60 seconds', excludeTestServices: true })((it) => {
    it.effect('receives a sent body with its attribute and receiveCount 1', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.received, hello)
        const received = yield* receiveSome(queues.received, options)

        assert.deepStrictEqual(Struct.omit(received, ['handle']), {
          body: 'hello',
          receiveCount: 1,
          attributes: { jobId: 'job-1' },
        })
      }),
    )

    it.effect('hides a received message for its visibility, then returns it', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.hidden, hello)
        yield* receiveSome(queues.hidden, { ...options, visibility: '2 seconds' })
        const within = yield* queue.receive(queues.hidden, { ...options, wait: 0 })
        const after = yield* receiveSome(queues.hidden, { ...options, wait: '4 seconds' })

        assert.deepStrictEqual(within, Option.none())
        assert.strictEqual(after.receiveCount, 2)
      }),
    )

    it.effect('returns a message released by extend(0) at once, with receiveCount 2', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.released, hello)
        const first = yield* receiveSome(queues.released, options)
        yield* queue.extend(queues.released, { handle: first.handle, visibility: 0 })
        const again = yield* receiveSome(queues.released, { ...options, wait: 0 })

        assert.strictEqual(again.body, 'hello')
        assert.strictEqual(again.receiveCount, 2)
      }),
    )

    it.effect('removes a deleted message', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.deleted, hello)
        const received = yield* receiveSome(queues.deleted, { ...options, visibility: 0 })
        yield* queue.delete(queues.deleted, received.handle)
        const again = yield* queue.receive(queues.deleted, { ...options, wait: 0 })

        assert.deepStrictEqual(again, Option.none())
      }),
    )

    it.effect('moves a message received maxReceiveCount times to its dead-letter queue', () =>
      Effect.gen(function* () {
        const queue = yield* QueueTransport

        yield* queue.send(queues.redriven, hello)
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
  })
})
