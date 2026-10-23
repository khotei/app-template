import * as aws from '@pulumi/aws'
import { Option } from 'effect'

import { deploymentConfig } from '#deployment/aws/config'

const { region, endpoint } = deploymentConfig

/**
 * MiniStack answers every service on one URL and accepts any credentials, so the provider skips
 * the calls that would reach AWS itself: STS for the account, IMDS for the region.
 */
const towardsEndpoint = (url: URL): aws.ProviderArgs => ({
  endpoints: [{ rds: url.origin, s3: url.origin, sqs: url.origin }],
  skipCredentialsValidation: true,
  skipRequestingAccountId: true,
  skipMetadataApiCheck: true,
})

export const provider = new aws.Provider('aws', {
  region,
  ...Option.match(endpoint, { onNone: () => ({}), onSome: towardsEndpoint }),
})
