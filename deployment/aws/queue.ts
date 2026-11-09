import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

import { buildResourceName, resources } from '@app-template/kernel/aws'
import { buildDeadLetterName } from '@app-template/packages/aws'

import { buildTags } from '#deployment/shared/tags'

export const createQueues = (provider: aws.Provider, stage: string) =>
  Object.values(resources.queues).map(({ name, maxReceiveCount, visibilityTimeoutSeconds }) => {
    const tags = buildTags(stage)
    const queueName = buildResourceName(stage, name)
    const deadLetter = new aws.sqs.Queue(
      buildDeadLetterName(name),
      { name: buildDeadLetterName(queueName), tags },
      { provider },
    )
    const queue = new aws.sqs.Queue(
      name,
      {
        name: queueName,
        visibilityTimeoutSeconds,
        redrivePolicy: pulumi.jsonStringify({
          deadLetterTargetArn: deadLetter.arn,
          maxReceiveCount,
        }),
        tags,
      },
      { provider },
    )
    return { name, queue }
  })
