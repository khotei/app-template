import {
  type InvalidAddressError,
  type InvalidAttributeNameError,
  type InvalidAttributeValueError,
  type InvalidSecurityError,
  type QueueDeletedRecentlyError,
  type QueueDoesNotExistError,
  type QueueNameExistsError,
  type RequestThrottledError,
  type SdkError,
  SQSService,
  type UnsupportedOperationError,
} from '@effect-aws/client-sqs'
import { Array as Arr, type Cause, Effect, Option } from 'effect'

import { buildDeadLetterName, buildResourceName } from '#aws/naming'
import type { QueueResource, Resources } from '#aws/resources'

export interface ProvisionedResource {
  readonly name: string
  readonly outcome: 'created' | 'unchanged'
}

export type ProvisionError =
  | Cause.NoSuchElementError
  | Cause.TimeoutError
  | SdkError
  | InvalidAddressError
  | InvalidAttributeNameError
  | InvalidAttributeValueError
  | InvalidSecurityError
  | QueueDeletedRecentlyError
  | QueueDoesNotExistError
  | QueueNameExistsError
  | RequestThrottledError
  | UnsupportedOperationError

/** The key order is fixed: CreateQueue compares a repeated RedrivePolicy as a string. */
const buildRedrivePolicy = (deadLetterTargetArn: string, maxReceiveCount: number): string =>
  JSON.stringify({ deadLetterTargetArn, maxReceiveCount })

const provisionQueue = Effect.fnUntraced(function* (
  name: string,
  attributes: Record<string, string>,
) {
  const sqs = yield* SQSService

  const existing = yield* sqs.getQueueUrl({ QueueName: name }).pipe(
    Effect.map(Option.some),
    Effect.catchTag('QueueDoesNotExist', () => Effect.succeed(Option.none())),
  )
  const { QueueUrl } = yield* sqs.createQueue({ QueueName: name, Attributes: attributes })

  return {
    url: QueueUrl,
    resource: {
      name,
      outcome: Option.isSome(existing) ? 'unchanged' : 'created',
    } satisfies ProvisionedResource,
  }
})

const provisionQueuePair = Effect.fnUntraced(function* (stage: string, queue: QueueResource) {
  const sqs = yield* SQSService
  const name = buildResourceName(stage, queue.name)

  const deadLetter = yield* provisionQueue(buildDeadLetterName(name), {})
  const { Attributes } = yield* sqs.getQueueAttributes({
    QueueUrl: deadLetter.url,
    AttributeNames: ['QueueArn'],
  })
  const deadLetterArn = yield* Effect.fromNullishOr(Attributes?.QueueArn)
  const main = yield* provisionQueue(name, {
    RedrivePolicy: buildRedrivePolicy(deadLetterArn, queue.maxReceiveCount),
  })

  return [deadLetter.resource, main.resource]
})

/**
 * Creates each queue of the inventory with its dead-letter queue under `stage` and reports each as
 * created or unchanged; a second run on the same queues changes nothing.
 *
 * A queue whose attributes drifted from the inventory fails with `QueueNameExists`: SQS never
 * updates on create, and `make reset` is the local way back.
 */
export const provision = Effect.fn('provision')(function* (
  queues: Resources['queues'],
  stage: string,
): Effect.fn.Return<ReadonlyArray<ProvisionedResource>, ProvisionError, SQSService> {
  const pairs = yield* Effect.forEach(Object.values(queues), (queue) =>
    provisionQueuePair(stage, queue),
  )

  return Arr.flatten(pairs)
})
