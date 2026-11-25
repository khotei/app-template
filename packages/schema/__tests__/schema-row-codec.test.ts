import { assert, describe, it } from '@effect/vitest'
import { Cause, DateTime, Effect, Equal, Option, Schema } from 'effect'
import { Model } from 'effect/schema'

import { epoch, isUuidV7 } from '@app-template/packages/testing'

import { encodeWith } from '#schema/schema-codec'
import { buildIdSchema } from '#schema/schema-id'
import { RowCodec } from '#schema/schema-row-codec'

const OrderId = buildIdSchema('OrderId')
const CustomerId = buildIdSchema('CustomerId')

class Order extends Model.Class<Order>('Order')({
  id: Model.UuidV7Insert(OrderId),
  customerId: CustomerId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  status: Schema.Literals(['placed', 'shipped']).pipe(
    Schema.withConstructorDefault(Effect.succeed('placed' as const)),
  ),
  note: Schema.OptionFromNullOr(Schema.String.check(Schema.isNonEmpty())).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate,
}) {}

const readAt = DateTime.makeUnsafe('2026-11-09T00:00:00.000Z')

/** A shipped order as a read returns it, its `updatedAt` older than the test clock's now. */
const order = new Order({
  id: OrderId.make('0192d4e0-7b3a-7c00-8000-000000000001'),
  customerId: CustomerId.make('0192d4e0-7b3a-7c00-8000-000000000002'),
  status: 'shipped',
  note: Option.some('fragile'),
  createdAt: readAt,
  updatedAt: readAt,
})

describe('RowCodec.decodeOne and decodeMany', () => {
  it.effect('decode the rows a read returns into the model', () =>
    Effect.gen(function* () {
      const row = yield* encodeWith(Order)(order)

      const one = yield* RowCodec.decodeOne(Order)(Option.some(row))
      const none = yield* RowCodec.decodeOne(Order)(Option.none())
      const [many] = yield* RowCodec.decodeMany(Order)([row])

      assert.instanceOf(Option.getOrThrow(one), Order)
      assert.isTrue(Equal.equals(Option.getOrThrow(one), order))
      assert.isTrue(Option.isNone(none))
      assert.isTrue(Equal.equals(many, order))
    }),
  )

  it.effect('refuse a row of another shape at compile time, and die on it', () =>
    Effect.gen(function* () {
      const { createdAt: _, ...drifted } = yield* encodeWith(Order)(order)

      // @ts-expect-error a row without createdAt is no Order's
      const decoded = RowCodec.decodeOne(Order)(Option.some(drifted))
      const defect = yield* decoded.pipe(Effect.catchDefect(Effect.succeed))

      assert.isTrue(Schema.isSchemaError(defect))
    }),
  )
})

describe('RowCodec.makeInsert', () => {
  it.effect('makes a new record with its defaults and encodes its row', () =>
    Effect.gen(function* () {
      const { set, row } = yield* RowCodec.makeInsert(Order)({ customerId: order.customerId })

      assert.isTrue(isUuidV7(set.id))
      assert.deepStrictEqual(
        [set, row],
        [
          {
            id: set.id,
            customerId: order.customerId,
            status: 'placed',
            note: Option.none(),
            createdAt: epoch,
            updatedAt: epoch,
          },
          {
            id: set.id,
            customerId: order.customerId,
            status: 'placed',
            note: null,
            createdAt: new Date(0),
            updatedAt: new Date(0),
          },
        ],
      )
    }),
  )

  it.effect('dies on a value its variant refuses, the defect reading as its message', () =>
    Effect.gen(function* () {
      const cause = yield* RowCodec.makeInsert(Order)({
        customerId: order.customerId,
        note: Option.some(''),
      }).pipe(Effect.sandbox, Effect.flip)

      assert.isTrue(Cause.hasDies(cause))
      assert.strictEqual(
        Cause.pretty(cause),
        'SchemaError: Expected a value with a length of at least 1\n  at ["note"]["value"]',
      )
    }),
  )
})

describe('RowCodec.makeUpdate', () => {
  it.effect.each([
    { name: 'a record as read', input: order },
    { name: 'its fields', input: { id: order.id, status: 'shipped', note: order.note } as const },
  ])('makes the row of $name, keeping its fields and moving updatedAt to now', ({ input }) =>
    Effect.gen(function* () {
      const { set, row } = yield* RowCodec.makeUpdate(Order)(input)

      assert.deepStrictEqual(
        [set, row],
        [
          { id: order.id, status: 'shipped', note: order.note, updatedAt: epoch },
          { id: order.id, status: 'shipped', note: 'fragile', updatedAt: new Date(0) },
        ],
      )
    }),
  )

  it.effect('refuses at compile time a field written once, and leaves it out of the row', () =>
    Effect.gen(function* () {
      const update = RowCodec.makeUpdate(Order)

      // @ts-expect-error customerId is written once, by the insert
      const { row } = yield* update({ id: order.id, customerId: order.customerId })

      assert.deepStrictEqual(row, {
        id: order.id,
        status: 'placed',
        note: null,
        updatedAt: new Date(0),
      })
    }),
  )

  it.effect('refuses at compile time a kept field of another type, and dies on it', () =>
    Effect.gen(function* () {
      const update = RowCodec.makeUpdate(Order)

      // @ts-expect-error status is kept, so it takes only a status
      const cause = yield* update({ id: order.id, status: 'lost' }).pipe(
        Effect.sandbox,
        Effect.flip,
      )

      assert.isTrue(Cause.hasDies(cause))
      assert.strictEqual(
        Cause.pretty(cause),
        'SchemaError: Expected "placed" | "shipped"\n  at ["status"]',
      )
    }),
  )
})
