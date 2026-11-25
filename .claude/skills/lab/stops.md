# The owner's stops

Each pair below is a fix the owner accepted after a stop in a lab: a before → after on an
`Order`, which stands for any model, and one line why. A pair a code rule comes to state is
deleted here: the rule is its author.

## The questions

1. What breaks if this is removed?
2. Is it already in Effect, or in the code?
3. Is the rule a pure function in the model?
4. Is each method named for what it returns, with no pass-through and no probe, and is each new
   purpose a unit that wraps or composes, the units below unedited? A model's member that calls
   its own pure function is no pass-through.
5. Does each test helper sit beside its one test?
6. Who reads this type, field, error or method: a branch in code, an operator? None: not written.
7. Does each unit know only its own, a service and a model nothing of who calls them (a queue, a
   redelivery, a request)?
8. Does the flow read top to bottom, its failures in one tail, no function taking its step?
9. Is it the shape its neighbours have: the same verb, argument order and file kind?

## The stops

**One noun, and the path says what a delete means.**
Why: a second noun for the same thing doubles its routes, ids and glossary entry, while the path
already tells the delete of the thing from the delete of its link.

```text
// before: a saved address renamed where an order uses it, so that its delete can mean "unlink"
DELETE /addresses/:addressId
PUT    /orders/:orderId/destinations/:addressId
DELETE /orders/:orderId/destinations/:addressId
```

```text
// after: one noun; the top-level route is the thing, the nested one its link
DELETE /addresses/:addressId                  the address itself
PUT    /orders/:orderId/addresses/:addressId  link
DELETE /orders/:orderId/addresses/:addressId  unlink; the address stays
```

**A use case writes only what its own actor owns.**
Why: a record of the next actor written ahead (a reserved id, a pending row) is a second place
that must agree with the handler that really produces it, and a failure there has no home.

```text
// before: placing an order reserves the shipment and writes it as pending
placeOrder → insert order, insert shipment(pending), send ShipOrder(shipmentId)
```

```text
// after: the order is stored and the job sent; the warehouse's handler writes the shipment
placeOrder → insert order, send ShipOrder(orderId)
ShipOrder handler → insert shipment, or the shipment's failure with its cause
```

**Reuse by a record that names its source; the bytes are stored once.**
Why: a copy of the bytes doubles storage and drifts, and a link table is a second noun; a record
of the reuse with a `sourceId` keeps one way to read, list and delete.

```text
// before: an invoice reused on a second order as a copy, or through a table of links
invoices(id, orderId, objectKey)          a copy per order
invoice_links(invoiceId, orderId)         a second noun
```

```text
// after: the second order's own record names the first; one object in the store
invoices(id, orderId, objectKey, sourceId)
```
