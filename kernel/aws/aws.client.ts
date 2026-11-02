import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { type Config, Layer, Option } from 'effect'

import { AwsConfig } from '@app-template/kernel/config'
import { S3Bucket } from '@app-template/packages/s3'

import { buildResourceName } from '#kernel/aws/resources/naming'
import { resources } from '#kernel/aws/resources/resources'

const buildClientOptions = ({ region, endpoint }: AwsConfig['Service']) => ({
  region,
  endpoint: endpoint.pipe(Option.map(String), Option.getOrUndefined),
})

/** With an endpoint set, addresses buckets by path, so presigned URLs carry that endpoint's host. */
export const S3ServiceFromConfig: Layer.Layer<S3Service, Config.ConfigError> = Layer.unwrap(
  AwsConfig.useSync((config) =>
    S3Service.layer({
      ...buildClientOptions(config),
      forcePathStyle: Option.isSome(config.endpoint),
    }),
  ),
).pipe(Layer.provide(AwsConfig.layer))

export const SQSServiceFromConfig: Layer.Layer<SQSService, Config.ConfigError> = Layer.unwrap(
  AwsConfig.useSync((config) => SQSService.layer(buildClientOptions(config))),
).pipe(Layer.provide(AwsConfig.layer))

/** `S3Bucket` on the attachments bucket of the stage in `AwsConfig`, over the `S3Service` in context. */
export const S3BucketOfStage: Layer.Layer<S3Bucket, never, S3Service | AwsConfig> = Layer.unwrap(
  AwsConfig.useSync(({ stage }) =>
    S3Bucket.layer({ bucket: buildResourceName(stage, resources.buckets.attachments.name) }),
  ),
)

export const S3BucketFromConfig: Layer.Layer<S3Bucket, Config.ConfigError> = S3BucketOfStage.pipe(
  Layer.provide([S3ServiceFromConfig, AwsConfig.layer]),
)
