import { Layer } from 'effect'

import { AwsConfig } from '@app-template/config'

import {
  AttachmentRepositoryKv,
  AttachmentRepositoryPg,
} from '#infrastructure/attachment/attachment.repository'
import { AttachmentStoreKv, AttachmentStoreS3 } from '#infrastructure/attachment/attachment.storage'
import { S3ServiceFromConfig } from '#infrastructure/shared/aws.client'

export {
  AttachmentRepositoryKv,
  AttachmentRepositoryPg,
} from '#infrastructure/attachment/attachment.repository'
export { AttachmentStoreKv, AttachmentStoreS3 } from '#infrastructure/attachment/attachment.storage'

export const AttachmentKv = Layer.mergeAll(AttachmentRepositoryKv, AttachmentStoreKv)

export const AttachmentKvS3 = Layer.mergeAll(AttachmentRepositoryKv, AttachmentStoreS3).pipe(
  Layer.provide([S3ServiceFromConfig, AwsConfig.layer]),
)

export const AttachmentPgS3 = Layer.mergeAll(AttachmentRepositoryPg, AttachmentStoreS3).pipe(
  Layer.provide([S3ServiceFromConfig, AwsConfig.layer]),
)
