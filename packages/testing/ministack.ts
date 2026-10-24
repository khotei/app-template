import { layer, type Vitest } from '@effect/vitest'
import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { ConfigProvider, Effect, Layer, type Scope } from 'effect'
import { TestClock } from 'effect/testing'
import { GenericContainer, Wait } from 'testcontainers'
import type { TestContext, TestOptions } from 'vitest'

import { AwsConfig, ministackImage } from '@app-template/config'

import { buildStage } from '#testing/stage.fixture'

const port = 4566
const region = 'us-east-1'
const credentials = { accessKeyId: 'test', secretAccessKey: 'test' } as const

const start = Effect.acquireRelease(
  Effect.promise(() =>
    new GenericContainer(ministackImage)
      .withExposedPorts(port)
      .withEnvironment({ MINISTACK_REGION: region })
      .withWaitStrategy(Wait.forHttp('/_ministack/health', port))
      .start(),
  ),
  (container) => Effect.promise(() => container.stop()),
)

/** S3 and SQS clients on a MiniStack container that lives as long as the layer: one per test file. */
export const AwsClientsMiniStack = Layer.unwrap(
  Effect.map(start, (container) => {
    const endpoint = new URL(`http://${container.getHost()}:${container.getMappedPort(port)}`).href
    return Layer.mergeAll(
      S3Service.layer({ endpoint, region, credentials, forcePathStyle: true }),
      SQSService.layer({ endpoint, region, credentials }),
    )
  }),
)

const withOwnClock =
  <R>(test: Vitest.Test<R>): Vitest.Test<R> =>
  (name, self, timeout) =>
    test(name, (...args) => Effect.provide(self(...args), TestClock.layer()), timeout)

/**
 * `it` with a `TestClock` of each test's own: a `layer` suite shares one, so a concurrent test's
 * `adjust` would move another's time.
 */
const giveEachTestItsClock = <R>(it: Vitest.MethodsNonLive<R>): Vitest.MethodsNonLive<R> => {
  const tester = it.effect
  const effect: typeof tester = Object.assign(withOwnClock(tester), {
    skip: withOwnClock(tester.skip),
    only: withOwnClock(tester.only),
    fails: withOwnClock(tester.fails),
    skipIf: (condition: unknown) => withOwnClock(tester.skipIf(condition)),
    runIf: (condition: unknown) => withOwnClock(tester.runIf(condition)),
    each:
      <T>(cases: ReadonlyArray<T>) =>
      <A, E>(
        name: string,
        self: Vitest.TestFunction<A, E, R | Scope.Scope, [T, TestContext]>,
        timeout?: number | TestOptions,
      ) =>
        tester.each(cases)(
          name,
          (...args) => Effect.provide(self(...args), TestClock.layer()),
          timeout,
        ),
    prop: tester.prop,
  })
  return new Proxy(it, {
    get: (target, key) => (key === 'effect' ? effect : Reflect.get(target, key)),
  })
}

/**
 * Describes a suite whose tests reach S3 and SQS on the suite's MiniStack; each test takes its
 * own stage there (`layerOwnStage`) and runs on its own `TestClock`.
 */
export const describeOnMiniStack = (
  name: string,
  f: (it: Vitest.MethodsNonLive<S3Service | SQSService>) => void,
) =>
  layer(AwsClientsMiniStack, { timeout: '60 seconds' })(name, (it) => f(giveEachTestItsClock(it)))

/**
 * `AwsConfig` on a stage no other test shares, read through a `ConfigProvider` once `provision`
 * has created the resources the test uses under it: provide it per test, so its buckets and
 * queues are its own and nothing needs cleaning.
 */
export const layerOwnStage = <E, R>(provision: (stage: string) => Effect.Effect<unknown, E, R>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const stage = buildStage()
      yield* provision(stage)
      return AwsConfig.layer.pipe(
        Layer.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ AWS_REGION: region, STAGE: stage })),
        ),
      )
    }),
  )

export const countObjects = (bucket: string) =>
  Effect.flatMap(S3Service, (s3) => s3.listObjectsV2({ Bucket: bucket })).pipe(
    Effect.map(({ Contents }) => Contents?.length ?? 0),
    Effect.orDie,
  )
