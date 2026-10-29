import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

import { buildDeadLetterName, buildResourceName, resources } from '@app-template/aws'

import { buildTags } from '#deployment/shared/tags'

export const createQueues = (provider: aws.Provider, stage: string) =>
  Object.values(resources.queues).map(({ name, maxReceiveCount }) => {
    const tags = buildTags(stage)
    const queueName = buildResourceName(stage, name)
    const deadLetter = new aws.sqs.Queue(
      buildDeadLetterName(name),
      { name: buildDeadLetterName(queueName), tags },
      { provider },
    )
    return new aws.sqs.Queue(
      name,
      {
        name: queueName,
        redrivePolicy: pulumi.jsonStringify({
          deadLetterTargetArn: deadLetter.arn,
          maxReceiveCount,
        }),
        tags,
      },
      { provider },
    )
  })
