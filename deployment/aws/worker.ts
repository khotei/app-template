import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

import { buildResourceName, resources } from '@app-template/kernel/aws'

import { buildTags } from '#deployment/shared/tags'

export interface WorkerOptions {
  readonly role: pulumi.Input<string>
  readonly environment: Record<string, pulumi.Input<string>>
}

/**
 * The worker's function and one mapping per queue that invokes it with the queue's batches; a
 * batch's answer names its failed records, so only they come back.
 */
export function createWorker(
  provider: aws.Provider,
  stage: string,
  queues: ReadonlyArray<{ readonly name: string; readonly queue: aws.sqs.Queue }>,
  { role, environment }: WorkerOptions,
) {
  const { name, timeoutSeconds } = resources.worker
  const worker = new aws.lambda.Function(
    name,
    {
      name: buildResourceName(stage, name),
      role,
      runtime: 'provided.al2023',
      handler: 'bootstrap',
      // A stand-in: on MiniStack the proxy URL in `environment` serves every invoke.
      code: new pulumi.asset.AssetArchive({
        bootstrap: new pulumi.asset.StringAsset('#!/bin/sh\n'),
      }),
      timeout: timeoutSeconds,
      environment: { variables: environment },
      tags: buildTags(stage),
    },
    { provider },
  )
  return queues.map(
    (queue) =>
      new aws.lambda.EventSourceMapping(
        `${queue.name}-${name}`,
        {
          eventSourceArn: queue.queue.arn,
          functionName: worker.arn,
          functionResponseTypes: ['ReportBatchItemFailures'],
        },
        { provider },
      ),
  )
}
