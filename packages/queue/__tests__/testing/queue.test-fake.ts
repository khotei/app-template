import { Array as Arr, Layer, Ref } from 'effect'

import { QueueSender } from '#queue/queue.sender'

/** A message the recording sender took, under its definition's name. */
export interface SentMessage {
  readonly queue: string
  readonly message: unknown
}

/** A `QueueSender` that keeps each message it sends in `sent`, in order. */
export function recordMessages() {
  const sent = Ref.makeUnsafe<ReadonlyArray<SentMessage>>([])
  const layer = Layer.succeed(
    QueueSender,
    QueueSender.of({
      send: (definition, message) =>
        Ref.update(sent, Arr.append({ queue: definition.name, message })),
    }),
  )
  return { sent: Ref.get(sent), layer }
}
