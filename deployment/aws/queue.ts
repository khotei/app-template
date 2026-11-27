import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

import { ResourceName, resources } from '@app-template/kernel/aws'

import { buildTags } from '#deployment/shared/tags'

export const createQueues = (provider: aws.Provider, stage: string) =>
  Object.values(resources.queues).map(({ name, maxReceiveCount, visibilityTimeoutSeconds }) => {
    const tags = buildTags(stage)
    const queueName = ResourceName.build(stage, name)
    const deadLetter = new aws.sqs.Queue(
      ResourceName.buildDeadLetter(name),
      { name: ResourceName.buildDeadLetter(queueName), tags },
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
