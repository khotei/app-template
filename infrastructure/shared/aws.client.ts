import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { type Config, Layer, Option } from 'effect'

import { AwsConfig } from '@app-template/config'

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
