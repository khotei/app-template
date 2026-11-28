import * as AWS from '@alchemy.run/aws'

import { resources } from '@app-template/kernel/aws'

const { abortIncompleteUploadDays } = resources.buckets.attachments.lifecycle

/** The bucket of the chats' attachments; an upload left unfinished is cleared. */
export const Files = AWS.S3.Bucket('Files', {
  lifecycleRules: [
    {
      ID: 'abort-incomplete-uploads',
      Status: 'Enabled',
      Filter: { Prefix: '' },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: abortIncompleteUploadDays },
    },
  ],
})
