import { Layer } from 'effect'

import { S3ServiceFromConfig } from '@app-template/kernel/aws'
import { AwsConfig } from '@app-template/kernel/config'

import { AttachmentBucketS3 } from '#infrastructure/attachment/attachment.bucket'

export { AttachmentBucketS3 } from '#infrastructure/attachment/attachment.bucket'

export const AttachmentBucketS3FromConfig = AttachmentBucketS3.pipe(
  Layer.provide([S3ServiceFromConfig, AwsConfig.layer]),
)
