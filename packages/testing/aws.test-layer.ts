import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { Layer } from 'effect'
import { inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    readonly awsEndpoint: string
  }
}

/** The region the `globalSetup` starts the run's MiniStack in; its clients and stages address it. */
export const ministackRegion = 'us-east-1'

const credentials = { accessKeyId: 'test', secretAccessKey: 'test' } as const

/** A stage no other test holds, `e2e` and eight hex digits, so a test's resources are its own. */
export const buildTestStage = (): string => `e2e${crypto.randomUUID().slice(0, 8)}`

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
