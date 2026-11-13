# A brief, worked on a neutral `Order`

The shape `/review-brief` writes, on a made-up range that moves an order's delivery state into a
`Shipment` record. The brief itself is written in the owner's language; the names below are
placeholders, never this repository's.

---

**Verdict.** The range moves an order's delivery state into a `Shipment`; `make check` is green
at `<hash>` (240 unit, 80 e2e); your word is needed on question 1.

```
Ticket: shipments — an order's delivery as a record of its own
Committed: S1–S3 (table, model, the ship use case)
────────────────────────────────────────
Step: S4 — the courier's callback through the Shipment
State: review ready
```

**Meaning.**

| Concept | Before | After | Why |
|---|---|---|---|
| Order | holds `status: paid → shipped → delivered` | finished once paid, no delivery state | one record per kind of work |
| Shipment | — | the delivery of one order: `status`, `failure`, the carrier | a retry is a new Shipment |
| Busy | `orders.status = 'shipped'` | the order's newest Shipment is active | the order stops changing after payment |

**Flow.**

```
api    ──INSERT shipment(queued)*──▶ Postgres        (one transaction with the payment)
api    ──ShipOrder { shipmentId }*──▶ queue           (after the commit)
worker ──UPDATE shipment queued→sent (WHERE status = old)*──▶ Postgres
carrier ──POST /callbacks──▶ api ──UPDATE shipment →delivered | failed──▶ Postgres
  failure: UPDATE shipment →failed { reason, cause }; the order stays paid
```

**Entities.**

```
orders 1 ──< shipments          shipments.order_id → orders (cascade)
read:  Order { …, latestShipment: Option<Shipment> }
       Shipment { id, orderId, status, failure: Option<ShipmentFailure>, carrier }
```

**Invariants.**

| Rule | Held by | Proved by |
|---|---|---|
| one active Shipment per order | `shipments_order_id_active_index` | `shipment.entity.e2e.ts` |
| a failed Shipment has a failure | `shipments_failure_check` | `shipment.entity.e2e.ts` |
| a move leaves only its allowed statuses | `transitions` in `shipment.model.ts` | `shipment.model.test.ts` |

**Contracts.**

```diff
// http-api/order/order.http.ts
- POST /orders/:orderId/ship → 202 ApiOrder { status: 'shipped' }
+ POST /orders/:orderId/ship → 202 ApiShipment { status: 'queued', order }
```

**Review map** (code +410 −380; tests +520 −610; generated and docs skipped):

1. Data, `<path>/shipment.table.ts:12-40`, 60 lines: do the keys and the index hold the rules?
2. Model, `<path>/shipment.model.ts`, 90 lines: is each move a row of `transitions`?
3. Use cases, `ship-order.use-case.ts:30-58`, 50 lines: do all checks precede the first write?
4. API, `order.http.ts:40-70` and its mapper, 40 lines: does `cause` stay off the wire?

Skip: the regenerated migration (the table file states it), the OpenAPI snapshot, the tests'
fixture renames.

**Decisions.** The order's busy state is read from its newest Shipment, not stored: rejected a
column moved by both writers, which two transactions would have to keep in step; cost, one
lateral join on every order read.

**Unverified and risks.** The courier's callback ran only against the fake carrier. My mistake:
the estimate said 200 lines, the range is 790; lesson: count the tests that read the old field.

**Questions.**

1. Keep the busy state derived and log the rule's exception in Later?
