import { Effect, Layer, Option } from 'effect'
import { inject } from 'vitest'

import { provision } from '@app-template/aws'
import { generateStage, ministackRegion, S3ClientTest, SqsClientTest } from '@app-template/testing'

import { buildResourceName } from '#kernel/aws/resources/naming'
import { resources } from '#kernel/aws/resources/resources'
import { AwsConfig } from '#kernel/config/config'

/**
 * A stage of its own per test on the run's MiniStack, its bucket and queues provisioned fresh.
 * Publishes the clients too, as the processes' `*FromConfig` layers do.
 */
export const AwsTest = Layer.unwrap(
  Effect.gen(function* () {
    const stage = generateStage()
    yield* provision(resources, (name) => buildResourceName(stage, name))
    return Layer.succeed(AwsConfig, {
      region: ministackRegion,
      endpoint: Option.some(new URL(inject('awsEndpoint'))),
      stage,
    })
  }),
).pipe(Layer.provideMerge([SqsClientTest, S3ClientTest]))
