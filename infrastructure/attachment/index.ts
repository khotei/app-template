import { Layer } from 'effect'

import { AwsConfig } from '@app-template/config'

import { AttachmentBucketS3 } from '#infrastructure/attachment/attachment.bucket'
import { AttachmentRepositoryPg } from '#infrastructure/attachment/attachment.repository'
import { S3BucketFromConfig, S3ServiceFromConfig } from '#infrastructure/shared/aws.client'

export { AttachmentBucketS3 } from '#infrastructure/attachment/attachment.bucket'
export { AttachmentRepositoryPg } from '#infrastructure/attachment/attachment.repository'

export const AttachmentPgS3 = Layer.mergeAll(AttachmentRepositoryPg, AttachmentBucketS3).pipe(
  Layer.provide(S3BucketFromConfig),
  Layer.provide([S3ServiceFromConfig, AwsConfig.layer]),
)
