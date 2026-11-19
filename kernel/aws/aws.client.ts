import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { type Config, Effect, Layer, Option } from 'effect'

import { type AwsConfig, awsConfig } from '@app-template/kernel/config'
import { QueueSender } from '@app-template/packages/queue'
import { S3Bucket } from '@app-template/packages/s3'

import { buildResourceName } from '#kernel/aws/resources/naming'
import { resources } from '#kernel/aws/resources/resources'

const buildClientOptions = ({ region, endpoint }: AwsConfig) => ({
  region,
  endpoint: endpoint.pipe(Option.map(String), Option.getOrUndefined),
})

/** With an endpoint set, addresses buckets by path, so presigned URLs carry that endpoint's host. */
const S3ServiceFromConfig: Layer.Layer<S3Service, Config.ConfigError> = awsConfig.pipe(
  Effect.map((config) =>
    S3Service.layer({
      ...buildClientOptions(config),
      forcePathStyle: Option.isSome(config.endpoint),
    }),
  ),
  Layer.unwrap,
)

const SQSServiceFromConfig: Layer.Layer<SQSService, Config.ConfigError> = awsConfig.pipe(
  Effect.map((config) => SQSService.layer(buildClientOptions(config))),
  Layer.unwrap,
)

/** `S3Bucket` on the attachments bucket of the configured stage, over the `S3Service` in context. */
export const S3BucketOfStage: Layer.Layer<S3Bucket, Config.ConfigError, S3Service> = awsConfig.pipe(
  Effect.map(({ stage }) =>
    S3Bucket.layer({ bucket: buildResourceName(stage, resources.buckets.attachments.name) }),
  ),
  Layer.unwrap,
)

export const S3BucketFromConfig: Layer.Layer<S3Bucket, Config.ConfigError> = S3BucketOfStage.pipe(
  Layer.provide(S3ServiceFromConfig),
)

/** `QueueSender` on the queues of the configured stage, over the `SQSService` in context. */
export const QueueSenderOfStage: Layer.Layer<QueueSender, Config.ConfigError, SQSService> =
  awsConfig.pipe(
    Effect.map(({ stage }) => QueueSender.layer((name) => buildResourceName(stage, name))),
    Layer.unwrap,
  )

export const QueueSenderFromConfig: Layer.Layer<QueueSender, Config.ConfigError> =
  QueueSenderOfStage.pipe(Layer.provide(SQSServiceFromConfig))
