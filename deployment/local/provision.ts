import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { Effect, Layer, Option } from 'effect'

import { provision, resources } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'

const AwsClientsFromConfig = Layer.unwrap(
  Effect.map(AwsConfig, ({ region, endpoint }) => {
    const shared = { region, endpoint: Option.map(endpoint, String).pipe(Option.getOrUndefined) }
    return Layer.mergeAll(
      S3Service.layer({ ...shared, forcePathStyle: Option.isSome(endpoint) }),
      SQSService.layer(shared),
    )
  }),
).pipe(Layer.provideMerge(AwsConfig.layer))

const provisionLocal = Effect.gen(function* () {
  const { stage, endpoint } = yield* AwsConfig
  const provisioned = yield* provision(resources, stage)

  const where = Option.match(endpoint, { onNone: () => 'AWS', onSome: (url) => url.href })
  yield* Effect.logInfo(`provisioned stage ${stage} on ${where}`)
  yield* Effect.forEach(provisioned, ({ name, outcome }) => Effect.logInfo(`${outcome}: ${name}`))
})

await provisionLocal.pipe(Effect.provide(AwsClientsFromConfig), Effect.orDie, Effect.runPromise)
