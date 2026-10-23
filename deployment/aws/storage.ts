import * as aws from '@pulumi/aws'

import { buildResourceName, resources, unboundTag } from '@app-template/aws'

import { buildTags } from '#deployment/shared/tags'

/** The inventory's buckets, each with the rule that expires unbound objects. */
export const createStorage = (provider: aws.Provider, stage: string) =>
  Object.values(resources.buckets).map(({ name, lifecycle }) => {
    const bucket = new aws.s3.Bucket(
      name,
      { bucket: buildResourceName(stage, name), tags: buildTags(stage) },
      { provider },
    )
    new aws.s3.BucketLifecycleConfiguration(
      name,
      {
        bucket: bucket.bucket,
        rules: [
          {
            id: 'expire-unbound',
            status: 'Enabled',
            filter: { tag: unboundTag },
            expiration: { days: lifecycle.unboundExpirationDays },
          },
          {
            id: 'abort-incomplete-uploads',
            status: 'Enabled',
            filter: { prefix: '' },
            abortIncompleteMultipartUpload: {
              daysAfterInitiation: lifecycle.abortIncompleteUploadDays,
            },
          },
        ],
      },
      { provider },
    )
    return bucket
  })
