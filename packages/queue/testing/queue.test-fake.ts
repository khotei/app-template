import { Array as Arr, Effect, Layer, Ref } from 'effect'

import { type MessageContent, QueueTransport } from '#queue/queue.transport'

/** A message the recording transport took: the physical queue's name with the content sent. */
export interface SentMessage extends MessageContent {
  readonly queue: string
}

const onlySends = Effect.die('recordQueue only sends: nothing consumes it')

/** A `QueueTransport` that keeps each send in `sent`, in order; it only sends, as the api's does. */
export const recordQueue = () => {
  const sent = Ref.makeUnsafe<ReadonlyArray<SentMessage>>([])
  const layer = Layer.succeed(
    QueueTransport,
    QueueTransport.of({
      send: (queue, message) => Ref.update(sent, Arr.append({ queue, ...message })),
      receive: () => onlySends,
      extend: () => onlySends,
      delete: () => onlySends,
    }),
  )
  return { sent: Ref.get(sent), layer }
}
