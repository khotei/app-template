import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { Layer } from 'effect'
import { inject } from 'vitest'

import { ministackRegion } from '#testing/aws.test-util'

declare module 'vitest' {
  export interface ProvidedContext {
    readonly awsEndpoint: string
  }
}

const credentials = { accessKeyId: 'test', secretAccessKey: 'test' } as const

const buildClientOptions = () => ({
  endpoint: inject('awsEndpoint'),
  region: ministackRegion,
  credentials,
})

/** An SQS client on the run's MiniStack. */
export const SqsClientTest = Layer.suspend(() => SQSService.layer(buildClientOptions()))

/** An S3 client on the run's MiniStack, addressing buckets by path as `S3ServiceFromConfig` does. */
export const S3ClientTest = Layer.suspend(() =>
  S3Service.layer({ ...buildClientOptions(), forcePathStyle: true }),
)
