import * as aws from '@pulumi/aws'
import type * as pulumi from '@pulumi/pulumi'
import { Option } from 'effect'

import type { AwsConfig } from '@app-template/config'

/**
 * MiniStack answers every service on one URL and accepts any credentials, so the provider skips
 * the calls that would reach AWS itself: STS for the account, IMDS for the region.
 */
const buildEndpointArgs = (url: URL): aws.ProviderArgs => ({
  endpoints: [{ rds: url.origin, s3: url.origin, sqs: url.origin }],
  s3UsePathStyle: true,
  skipCredentialsValidation: true,
  skipRequestingAccountId: true,
  skipMetadataApiCheck: true,
})

export const createProvider = (config: AwsConfig['Service'], options?: pulumi.ResourceOptions) =>
  new aws.Provider(
    'aws',
    {
      region: config.region,
      ...Option.match(config.endpoint, { onNone: () => ({}), onSome: buildEndpointArgs }),
    },
    options,
  )
