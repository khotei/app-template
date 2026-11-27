---
paths:
  - "application/*/domain/**"
  - "application/*/services/**"
---

# Models: one field list, a variant per use

A domain model of a stored record is a `Model.Class` of `effect/schema` (one no store holds, a
`Schema.Class`): the class is what a read decodes, `<Model>.insert` and `<Model>.update` what a
write encodes, `<Model>.json` what the api serves.
`Model` and `VariantSchema` are `@stability unstable`: at an Effect upgrade, check each name used
against the vendored module ([effect.md](effect.md)).
Decision: [Models with variants](../../docs/knowledge/decisions.md#models-with-variants).

```ts
export class Order extends Model.Class<Order>('Order')({
  id: Model.UuidV7Insert(OrderId),
  customerId: CustomerId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  status: OrderStatus.pipe(Schema.withConstructorDefault(Effect.succeed('placed' as const))),
  note: Schema.OptionFromNullOr(Schema.String),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate,
  shipment: Schema.OptionFromNullOr(Shipment).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
    Model.FieldOnly(['select']),
  ),
}) {}
```

- **The id and the times are the variants' defaults:** `Model.UuidV7Insert(<Model>Id)`,
  `Model.DateTimeInsertFromDate` (created), `Model.DateTimeUpdateFromDate` (updated). Each time
  is its own read of the clock, so a new record's two may differ: no rule compares them.
- **A field written once by the insert** (an owner, a parent, a kind) is
  `<Schema>.pipe(Model.FieldExcept(['update', 'jsonUpdate']))`, inline, with no local alias,
  whether or not the model is updated today. One no client may see is `Model.Sensitive`.
- **A record another table holds, read with the model,** is a field of the select variant alone
  (`Model.FieldOnly(['select'])`, defaulted so a new record builds without it): no write encodes
  it, no json variant carries it, and the API contract adds its wire shape
  (`application/CLAUDE.md`).
- **A model holds no member:** its rules are statics of a class per kind beside it, one file each
  (`order-policy.ts`): `<Model>Policy` the checks (`ensure<Rule>`, failing or passing, writing
  nothing, `Effect.fnUntraced`, no span; `is<Rule>` where a flow only branches on it),
  `<Model>Move` the status moves (`<verb>`, returning the record's next state,
  `Effect.fn('<Model>Move.<verb>')`), `<Model>State` what the record's values say of it (`build`,
  `is<Value>`), `<Model><Value>` a value built from the model's for one use (`build`,
  `OrderLabel.build(order)`). A model imports no group.
- **A static calls another by its class's name,** never `this`, so one passed as a value runs
  (`Effect.flatMap(<Group>.<rule>)`).
- **A rule is typed over the fields it reads,** never the class, so a plain struct (a variant,
  another module's shape, a spread) passes: a check or a value takes a `Pick` of its fields, a
  check that returns it generic, a move `<Model>Fields`
  ([why](../../docs/knowledge/decisions.md#rules-as-pure-functions)).
```ts
export type OrderFields = Schema.Struct.Type<typeof Order.fields>     // in order.model.ts
export class OrderMove {                                              // order-move.ts
  static readonly ship = Effect.fn('OrderMove.ship')((order: OrderFields) => …) // a new Order
}
```
- **A service codes its rows through `RowCodec` of `@app-template/packages/schema` alone,** its
  statics taking the model: `decodeOne`/`decodeMany` a read's rows, `makeInsert`/`makeUpdate` a
  write, the variant's `makeEffect` and its encode in one call; never `SchemaCodec`'s `encode`
  or `decode` at the call, nor a codec static on the model. It hands `row` to the repository
  and returns `new <Model>(…)` over `set`; never `new <Model>(…)` with an id or a time made by hand
  (`DateTime.now`, a generator of its own). `makeUpdate` drops the keys the update variant renews
  (`updatedAt`), so the variant moves them to now whether the caller passes fields or a record as
  read ([decision](../../docs/knowledge/decisions.md#models-with-variants)).
```ts
const { set, row } = yield* RowCodec.makeInsert(Order)({ customerId })
const found = yield* orders
  .selectOne(Where.encode(where))
  .pipe(Effect.flatMap(RowCodec.decodeOne(Order)))
```
- **An update passes every field it must keep:** a default on an updatable field fills it when
  left out, and the write then resets the column.

```diff
- yield* Order.update.makeEffect({ id: order.id, note })        // `status` defaults to 'placed'
+ yield* RowCodec.makeUpdate(Order)(shipped)                     // whole, the time moved
```
