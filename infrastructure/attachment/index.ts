import { Layer } from 'effect'

import { S3ServiceFromConfig } from '@app-template/kernel/aws'
import { AwsConfig } from '@app-template/kernel/config'

import { AttachmentBucketS3 } from '#infrastructure/attachment/attachment.bucket'
import { AttachmentRepositoryPg } from '#infrastructure/attachment/attachment.repository'

export { AttachmentBucketS3 } from '#infrastructure/attachment/attachment.bucket'
export { AttachmentRepositoryPg } from '#infrastructure/attachment/attachment.repository'

export const AttachmentPgS3 = Layer.mergeAll(AttachmentRepositoryPg, AttachmentBucketS3).pipe(
  Layer.provide([S3ServiceFromConfig, AwsConfig.layer]),
)
