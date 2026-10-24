import * as pulumi from '@pulumi/pulumi'

import { createDatabase } from '#deployment/aws/database'
import { createProvider } from '#deployment/aws/provider'
import { createQueues } from '#deployment/aws/queue'
import { createStorage } from '#deployment/aws/storage'
import { ministack } from '#deployment/local/ministack'
import { localDatabase, settings } from '#deployment/local/settings'

const { stage } = settings.aws
const provider = createProvider(settings.aws, { dependsOn: [ministack] })

createStorage(provider, stage)
createQueues(provider, stage)
const database = createDatabase(provider, { stage, ...localDatabase })

// The password is URL-encoded, since Bun expands `$` in an env file even inside single quotes.
export const DATABASE_URL = pulumi.interpolate`postgres://${localDatabase.user}:${encodeURIComponent(localDatabase.password)}@${database.address}:${database.port}/${localDatabase.name}`
