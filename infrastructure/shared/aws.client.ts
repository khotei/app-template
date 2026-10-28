import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { type Config, Effect, Layer, Option } from 'effect'

import { buildResourceName, resources } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'
import { S3Bucket } from '@app-template/s3'

const buildClientOptions = ({ region, endpoint }: AwsConfig['Service']) => ({
  region,
  endpoint: Option.map(endpoint, String).pipe(Option.getOrUndefined),
})

/** With an endpoint set, addresses buckets by path, so presigned URLs carry that endpoint's host. */
export const S3ServiceFromConfig: Layer.Layer<S3Service, Config.ConfigError> = Layer.unwrap(
  Effect.map(AwsConfig, (config) =>
    S3Service.layer({
      ...buildClientOptions(config),
      forcePathStyle: Option.isSome(config.endpoint),
    }),
  ),
).pipe(Layer.provide(AwsConfig.layer))

export const SQSServiceFromConfig: Layer.Layer<SQSService, Config.ConfigError> = Layer.unwrap(
  Effect.map(AwsConfig, (config) => SQSService.layer(buildClientOptions(config))),
).pipe(Layer.provide(AwsConfig.layer))

/**
 * The attachments bucket of the configured stage. Reads `AwsConfig` and `S3Service` from its
 * context, so a test's stage is not overridden by `AwsConfig.layer`.
 */
export const S3BucketFromConfig: Layer.Layer<S3Bucket, never, S3Service | AwsConfig> = Layer.unwrap(
  Effect.map(AwsConfig, ({ stage }) =>
    S3Bucket.layer({ bucket: buildResourceName(stage, resources.buckets.attachments.name) }),
  ),
)
