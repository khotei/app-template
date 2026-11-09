import { Array as Arr, type Schema, String as Str } from 'effect'

export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
}

/** The name of the queue an ARN names. */
export function buildQueueName(arn: string): string {
  return Arr.lastNonEmpty(Str.split(arn, ':'))
}
