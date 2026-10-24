import { Layer } from 'effect'

import { AwsConfig } from '@app-template/config'

import { AttachmentRepositoryPg } from '#infrastructure/attachment/attachment.repository'
import { AttachmentStoreS3 } from '#infrastructure/attachment/attachment.storage'
import { S3ServiceFromConfig } from '#infrastructure/shared/aws.client'

export { AttachmentRepositoryPg } from '#infrastructure/attachment/attachment.repository'
export { AttachmentStoreS3 } from '#infrastructure/attachment/attachment.storage'

export const AttachmentPgS3 = Layer.mergeAll(AttachmentRepositoryPg, AttachmentStoreS3).pipe(
  Layer.provide([S3ServiceFromConfig, AwsConfig.layer]),
)
