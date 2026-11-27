import * as aws from '@pulumi/aws'

import { ResourceName, resources } from '@app-template/kernel/aws'

import { buildTags } from '#deployment/shared/tags'

export const createStorage = (provider: aws.Provider, stage: string) =>
  Object.values(resources.buckets).map(({ name, lifecycle }) => {
    const bucket = new aws.s3.Bucket(
      name,
      { bucket: ResourceName.build(stage, name), tags: buildTags(stage) },
      { provider },
    )
    new aws.s3.BucketLifecycleConfiguration(
      name,
      {
        bucket: bucket.bucket,
        rules: [
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
