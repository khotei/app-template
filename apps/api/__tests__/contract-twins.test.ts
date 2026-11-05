import { assert, describe, it } from '@effect/vitest'
import {
  Array as Arr,
  Effect,
  flow,
  Predicate,
  pipe,
  Record as Rec,
  Schema,
  SchemaRepresentation,
} from 'effect'

import * as Chat from '@app-template/application/chat'
import * as Identity from '@app-template/application/identity'
import * as Contract from '@app-template/http-api'

const modules = { Chat, Identity }

/** The schemas the contract and `domain` both export under one name. */
const twinsOf = (domain: Rec.ReadonlyRecord<string, unknown>) =>
  pipe(
    Rec.intersection(Contract, domain, (contract: unknown, domain) => ({ contract, domain })),
    Rec.filter(Predicate.Struct({ contract: Schema.isSchema, domain: Schema.isSchema })),
    Rec.collect((name, pair) => ({ name, ...pair })),
  )

/**
 * The representation as JSON: the live one holds each check's closures (`toJsonSchema`,
 * `toCode`), which never compare equal across two declarations.
 */
const representationOf = flow(Schema.toRepresentation, SchemaRepresentation.toJson)

describe('the contract twins', () => {
  it.effect.each(Rec.collect(modules, (name, domain) => ({ name, domain })))(
    '$name shares a twin with the contract',
    ({ domain }) => Effect.sync(() => assert.isNotEmpty(twinsOf(domain))),
  )

  it.effect.each(pipe(modules, Rec.values, Arr.flatMap(twinsOf)))(
    "$name: the contract declares the domain's checks",
    ({ contract, domain }) =>
      Effect.sync(() =>
        assert.deepStrictEqual(representationOf(contract), representationOf(domain)),
      ),
  )

  it.effect('the contract encodes a domain error instance', () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeUnknownEffect(
        Schema.toCodecJson(Contract.UserUnknownError),
      )(new Identity.UserUnknownError())

      assert.deepStrictEqual(encoded, { _tag: 'UserUnknownError' })
    }),
  )
})
