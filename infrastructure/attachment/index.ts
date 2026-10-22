import { Layer } from 'effect'

import { AwsConfig } from '@app-template/config'

import { AttachmentRepositoryKv } from '#infrastructure/attachment/attachment.repository'
import { AttachmentStoreKv } from '#infrastructure/attachment/attachment.storage'
import { AttachmentStoreS3 } from '#infrastructure/attachment/attachment.storage.s3'
import { S3ServiceFromConfig } from '#infrastructure/shared/aws.client'

export * from '#infrastructure/attachment/attachment.repository'
export * from '#infrastructure/attachment/attachment.storage'
export * from '#infrastructure/attachment/attachment.storage.s3'

export const AttachmentKv = Layer.mergeAll(AttachmentRepositoryKv, AttachmentStoreKv)

/** Records in the key-value store, bytes in the S3 bucket of `AwsConfig`'s stage. */
export const AttachmentKvS3 = Layer.mergeAll(AttachmentRepositoryKv, AttachmentStoreS3).pipe(
  Layer.provide([S3ServiceFromConfig, AwsConfig.layer]),
)
