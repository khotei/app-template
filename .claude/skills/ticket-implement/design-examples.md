# Design examples

The Design pass reads this file; no other pass does. One do and one don't per lens, on an `Order`
that stands for any model. A do is a candidate worth proposing, a don't one to leave out. Each
pair rests on a rule or a record, linked here and read there: when the two disagree, the rule
wins.

A candidate earns `Strong` when the cost is already in the diff (a third copy, a rule two callers
repeat), `Worth exploring` when the next step of the plan pays it, `Speculative` when only a
guess about later code does. A don't is no candidate at any strength.

## A narrower interface

**Do: the variation becomes a value the one method takes.**
Rests on: [deep-modules.md › The tests](../../rules/deep-modules.md#the-tests).
Cohesion: the cancel move and its reasons change together, so they live in one method.

```ts
// before: a method per reason, each a copy of the same move
interface OrderService {
  cancelByCustomer(id: OrderId): Effect.Effect<Order, OrderNotFoundError>
  cancelByStaff(id: OrderId, note: string): Effect.Effect<Order, OrderNotFoundError>
  cancelUnpaid(id: OrderId): Effect.Effect<Order, OrderNotFoundError>
}
```

```ts
// after: the reason is data, and a new reason is a new arm of it
type CancelReason =
  | { readonly _tag: 'Customer' }
  | { readonly _tag: 'Staff'; readonly note: string }
  | { readonly _tag: 'Unpaid' }

interface OrderService {
  cancel(id: OrderId, reason: CancelReason): Effect.Effect<Order, OrderNotFoundError>
}
```

**Don't: a port that narrows a store to the calls one service makes.**
Rests on: [layering.md › Ports and domain services](../../rules/layering.md#ports-and-domain-services).

```ts
// proposed: the service sees two methods instead of the repository's verbs
interface OrderStore {
  load(id: OrderId): Effect.Effect<Option.Option<OrderEntity>>
  save(entity: OrderEntity): Effect.Effect<void>
}
// one adapter, whose every method forwards to the repository
```

## Composition in place of a wrapper per case

**Do: copies that differ by a value become one function over a table of the values.**
Rests on: [deep-modules.md › Composition over pass-through](../../rules/deep-modules.md#composition-over-pass-through)
and [effect-style.md › Branching](../../rules/effect-style.md#branching).
Cohesion: a new tier is one row, and the formula is written once.

```ts
// before: a function per tier, the formula copied into each
function priceRetail(order: Order) {
  return withTax(subtotal(order), 0.2)
}
function priceWholesale(order: Order) {
  return withTax(subtotal(order) * 0.9, 0.2)
}
function priceStaff(order: Order) {
  return withTax(subtotal(order) * 0.7, 0)
}
```

```ts
// after: the tiers are data; a missing row fails typecheck
const tiers = {
  retail: { discount: 0, tax: 0.2 },
  wholesale: { discount: 0.1, tax: 0.2 },
  staff: { discount: 0.3, tax: 0 },
} as const satisfies Record<Tier, { readonly discount: number; readonly tax: number }>

function price(order: Order, tier: Tier) {
  const { discount, tax } = tiers[tier]
  return withTax(subtotal(order) * (1 - discount), tax)
}
```

**Don't: a combinator for one caller, so the step "composes".**
Rests on: [effect-services.md › Functions](../../rules/effect-services.md#functions) and the
deletion test of [deep-modules.md › The tests](../../rules/deep-modules.md#the-tests).

```ts
// proposed: a wrapper that adds a span and a log annotation
const orderStep =
  <A, E, R>(name: string, step: (order: Order) => Effect.Effect<A, E, R>) =>
  (order: Order) =>
    step(order).pipe(Effect.withSpan(name), Effect.annotateLogs({ orderId: order.id }))

const ship = orderStep('ship', shipOrder) // its only caller
```

## A pure function taken out of an effect

**Do: the rule inside a service's body moves to the model, over values passed in.**
Rests on: [decisions.md › Rules as pure functions](../../../docs/knowledge/decisions.md#rules-as-pure-functions).
Coupling: the service stops knowing the rule; the rule is tested with plain values and no layer.

```ts
// before: the check reads the clock and sits between a read and a write
const ship = Effect.fn('OrderService.ship')(function* (id: OrderId) {
  const order = yield* orders.getOne({ id })
  const now = yield* DateTime.now
  if (order.status !== 'paid') {
    return yield* new OrderStatusInvalidError({ id, from: order.status, to: 'shipped' })
  }
  if (DateTime.isGreaterThan(now, DateTime.add(order.paidAt, { days: 7 }))) {
    return yield* new OrderExpiredError({ id })
  }
  const shipped = new Order({ ...order, status: 'shipped', shippedAt: now })
  yield* orders.update(shipped, { id, status: order.status })
  return shipped
})
```

```ts
// after, in the model: no service, the time an argument
const shipOrder = Effect.fn('shipOrder')(function* (order: Order, at: DateTime.Utc) {
  if (order.status !== 'paid') {
    return yield* new OrderStatusInvalidError({ id: order.id, from: order.status, to: 'shipped' })
  }
  if (DateTime.isGreaterThan(at, DateTime.add(order.paidAt, { days: 7 }))) {
    return yield* new OrderExpiredError({ id: order.id })
  }
  return new Order({ ...order, status: 'shipped', shippedAt: at })
})
```

**Don't: a helper that is still an effect and only renames a call.**
Rests on: [effect-services.md › Functions](../../rules/effect-services.md#functions).

```ts
// proposed: "extract" the read and the write
const loadOrder = (id: OrderId) => orders.getOne({ id })
const saveOrder = (order: Order, from: OrderStatus) =>
  orders.update(order, { id: order.id, status: from })
```

## A shorter or plainer implementation

**Do: drop the re-read and re-check after a write that already dies on a miss.**
Rests on: [deep-modules.md › A deep repository](../../rules/deep-modules.md#a-deep-repository).
Coupling: the caller stops knowing how the store answers a write; it trusts the value it built.

```ts
// before: the write is read back and checked again
yield* orders.update(shipped, { id: order.id, status: order.status })
const saved = yield* orders.getOne({ id: order.id })
if (saved.status !== 'shipped') {
  return yield* Effect.die('the order was not shipped')
}
return saved
```

```ts
// after
yield* orders.update(shipped, { id: order.id, status: order.status })
return shipped
```

**Don't: a shorter chain that nests what a generator names.**
Rests on: [effect-style.md › Composition](../../rules/effect-style.md#composition).

```ts
// proposed, in place of a generator that reads, ships and writes
const ship = (id: OrderId, at: DateTime.Utc) =>
  orders.getOne({ id }).pipe(
    Effect.flatMap((order) =>
      shipOrder(order, at).pipe(
        Effect.tap((shipped) => orders.update(shipped, { id, status: order.status })),
      ),
    ),
  )
```
