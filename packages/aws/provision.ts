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
import { type Cause, Effect, pipe, Record } from 'effect'

import { buildDeadLetterName, buildResourceName } from '#aws/naming'
import type { QueueResource, Resources } from '#aws/resources'

type ProvisionError =
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

const provisionQueuePair = (stage: string) =>
  Effect.fnUntraced(function* (queue: QueueResource) {
    const sqs = yield* SQSService
    const name = buildResourceName(stage, queue.name)

    const deadLetter = yield* sqs.createQueue({ QueueName: buildDeadLetterName(name) })
    const { Attributes } = yield* sqs.getQueueAttributes({
      QueueUrl: deadLetter.QueueUrl,
      AttributeNames: ['QueueArn'],
    })
    const deadLetterArn = yield* Effect.fromNullishOr(Attributes?.QueueArn)
    yield* sqs.createQueue({
      QueueName: name,
      Attributes: { RedrivePolicy: buildRedrivePolicy(deadLetterArn, queue.maxReceiveCount) },
    })
  })

/**
 * Creates each queue of the inventory with its dead-letter queue under `stage`; a second run on the
 * same queues changes nothing.
 *
 * A queue whose attributes drifted from the inventory fails with `QueueNameExists`: SQS never
 * updates on create, and `make reset` is the local way back.
 */
export const provision = Effect.fn('provision')(
  (queues: Resources['queues'], stage: string): Effect.Effect<void, ProvisionError, SQSService> =>
    pipe(queues, Record.values, Effect.forEach(provisionQueuePair(stage), { discard: true })),
)
