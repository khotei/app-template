import * as aws from '@pulumi/aws'

import { buildResourceName } from '@app-template/aws'

import { buildTags } from '#deployment/shared/tags'

export interface DatabaseSettings {
  readonly stage: string
  readonly user: string
  readonly password: string
  readonly name: string
}

export const createDatabase = (provider: aws.Provider, settings: DatabaseSettings) =>
  new aws.rds.Instance(
    'database',
    {
      identifier: buildResourceName(settings.stage, 'database'),
      engine: 'postgres',
      engineVersion: '18',
      instanceClass: 'db.t4g.micro',
      allocatedStorage: 20,
      // Equal to allocatedStorage, so a refresh reads back what the program declares.
      maxAllocatedStorage: 20,
      username: settings.user,
      password: settings.password,
      dbName: settings.name,
      skipFinalSnapshot: true,
      publiclyAccessible: true,
      tags: buildTags(settings.stage),
    },
    { provider },
  )
