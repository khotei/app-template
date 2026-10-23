import { $ } from 'bun'

import { Array as Arr, Data, Effect, Layer, Option, Redacted, Schedule } from 'effect'

import { buildResourceName } from '@app-template/aws'
import { AwsConfig, DatabaseConfig } from '@app-template/config'

class DatabasePortMismatchError extends Data.TaggedError('DatabasePortMismatchError')<{
  readonly identifier: string
  readonly expected: string
  readonly published: ReadonlyArray<string>
}> {
  override get message(): string {
    const published = Arr.isReadonlyArrayEmpty(this.published)
      ? 'no port (no container of it runs)'
      : `port ${Arr.join(this.published, ', ')}`
    return `RDS instance ${this.identifier}: DATABASE_URL names port ${this.expected}, the instance publishes ${published}; run make reset, or set DATABASE_URL to the published port`
  }
}

const publishedPort = /:(\d+)->5432\/tcp/g

// A MiniStack that has just started respawns its instances in the background, so the container
// may appear a few seconds after `pulumi up` returns.
const respawnPoll = {
  while: Arr.isReadonlyArrayEmpty,
  schedule: Schedule.spaced('1 second'),
  times: 30,
}

const selectPublishedPorts = (identifier: string) =>
  Effect.promise(() =>
    $`docker ps --filter label=ministack=rds --filter label=db_id=${identifier} --format {{.Ports}}`.text(),
  ).pipe(
    Effect.map((ports) =>
      Arr.dedupe(
        Arr.getSomes(
          Arr.map([...ports.matchAll(publishedPort)], ([, port]) => Option.fromUndefinedOr(port)),
        ),
      ),
    ),
    Effect.repeat(respawnPoll),
  )

/**
 * MiniStack reports an instance `available` even when another container holds its host port, so
 * the check reads the port Docker published for the instance's own container.
 */
const checkDatabase = Effect.gen(function* () {
  const { stage } = yield* AwsConfig
  const { url } = yield* DatabaseConfig

  const identifier = buildResourceName(stage, 'database')
  const expected = new URL(Redacted.value(url)).port
  const published = yield* selectPublishedPorts(identifier)

  if (!Arr.contains(published, expected)) {
    return yield* new DatabasePortMismatchError({ identifier, expected, published })
  }
  yield* Effect.logInfo(`RDS instance ${identifier} listens on port ${expected}`)
})

await checkDatabase.pipe(
  Effect.provide(Layer.mergeAll(AwsConfig.layer, DatabaseConfig.layer)),
  Effect.runPromise,
)
