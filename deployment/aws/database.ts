import * as aws from '@pulumi/aws'
import { Redacted } from 'effect'

import { databaseConfig } from '#deployment/aws/config'
import { provider } from '#deployment/aws/provider'
import { buildResource } from '#deployment/aws/resource'

const database = buildResource('database')

const url = new URL(Redacted.value(databaseConfig.url))

const instance = new aws.rds.Instance(
  'database',
  {
    identifier: database.name,
    engine: 'postgres',
    engineVersion: '18',
    instanceClass: 'db.t4g.micro',
    allocatedStorage: 20,
    // Equal to allocatedStorage, so a refresh reads back what the program declares.
    maxAllocatedStorage: 20,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    dbName: url.pathname.slice(1),
    skipFinalSnapshot: true,
    publiclyAccessible: true,
    tags: database.tags,
  },
  { provider },
)

export const endpoint = instance.endpoint
