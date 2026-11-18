import { Array as Arr, type Schema, String as Str } from 'effect'

export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
}

/** The name of the queue an ARN names. */
export const buildQueueName = (arn: string): string => Arr.lastNonEmpty(Str.split(arn, ':'))
