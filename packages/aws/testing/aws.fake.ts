import { Effect } from 'effect'

import { layerOwnStage } from '@app-template/testing'

import { provision } from '#aws/provision'
import { type Resources, resources } from '#aws/resources'

const attachmentsBucket = { buckets: resources.buckets, queues: {} } satisfies Resources

/** `AwsConfig` on a stage of the test's own, where only the attachments bucket exists. */
export const AwsConfigOwnBucket = layerOwnStage((stage) =>
  Effect.orDie(provision(attachmentsBucket, stage)),
)
