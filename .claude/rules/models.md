---
paths:
  - "application/*/domain/**"
  - "application/*/services/**"
---

# Models: one field list, a variant per use

A domain model is a `Model.Class` of `effect/schema`: the class is what a read decodes,
`<Model>.insert` and `<Model>.update` what a write encodes, `<Model>.json` what the api serves.
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
  it, no json variant carries it, and the api adds its wire shape (`apps/CLAUDE.md`).
- **A value or rule that needs only the record is also a member** calling the model's function:
  a getter or a prototype method of one line, never a field, never a plain subclass
  (`class B extends A`). The function stays exported and tested; code that holds a plain struct
  (a variant, another module's shape) calls it
  ([why](../../docs/knowledge/decisions.md#rules-as-pure-functions)).
```ts
export class Order extends Model.Class<Order>('Order')({ … }) {
  get isPaid(): boolean { return isOrderPaid(this) }
  ensureCancellable() { return ensureOrderCancellable(this) }
}
export const isOrderPaid = (order: Pick<Order, 'payment'>): boolean => Option.isSome(order.payment)
```
- **A service builds a write through its model's static,** `<Model>.makeInsert(…)` or
  `<Model>.makeUpdate(…)`, the variant's `makeEffect` and its encode in one call: it hands
  `row` to the repository and returns `new <Model>(…)` over `set`; never `new <Model>(…)` with an
  id or a time made by hand (`DateTime.now`, a generator of its own).
- **A service codes its rows through the model's statics alone,** one per read's shape or write's
  variant, never `encodeWith`, `decodeWith` or `makeRowWith` at the call; a model holds only those
  its service calls, and an input its variant must not take (a record's own `updatedAt`) is
  trimmed by the static ([decision](../../docs/knowledge/decisions.md#models-with-variants)).
```ts
static readonly decodeOne = decodeWith(Schema.Option(this))    // selectOne's row
static readonly decodeMany = decodeWith(Schema.Array(this))    // selectMany's rows
static readonly makeInsert = makeRowWith(this.insert)       // { set, row }
static readonly makeUpdate = (order: Order) =>               // only on a model it updates
  makeRowWith(this.update)(Struct.omit(order, ['updatedAt']))  // the variant moves the time
```
- **An update passes every field it must keep:** a default on an updatable field fills it when
  left out, and the write then resets the column.

```diff
- yield* Order.update.makeEffect({ id: order.id, note })        // `status` defaults to 'placed'
+ yield* Order.makeUpdate(shipped)                           // whole, the time moved
```
