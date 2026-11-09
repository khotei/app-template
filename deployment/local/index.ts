import * as pulumi from '@pulumi/pulumi'

import { createDatabase } from '#deployment/aws/database'
import { createProvider } from '#deployment/aws/provider'
import { createQueues } from '#deployment/aws/queue'
import { createStorage } from '#deployment/aws/storage'
import { createWorker } from '#deployment/aws/worker'
import { ministack } from '#deployment/local/ministack'
import { localDatabase, settings } from '#deployment/local/settings'

const { stage } = settings.aws
const provider = createProvider(settings.aws, { dependsOn: [ministack] })

createStorage(provider, stage)
const queues = createQueues(provider, stage)
// MiniStack takes any role, and its proxy hands each invoke to the worker that runs on the host.
createWorker(provider, stage, queues, {
  role: 'arn:aws:iam::000000000000:role/worker',
  environment: {
    MINISTACK_LAMBDA_PROXY_URL: `http://host.docker.internal:${settings.worker.port}/events`,
  },
})
const database = createDatabase(provider, { stage, ...localDatabase })

// The password is URL-encoded, since Bun expands `$` in an env file even inside single quotes.
export const DATABASE_URL = pulumi.interpolate`postgres://${localDatabase.user}:${encodeURIComponent(localDatabase.password)}@${database.address}:${database.port}/${localDatabase.name}`
