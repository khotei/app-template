---
paths:
  - "application/**"
  - "kernel/**"
---

# Modules: what review refuses

`make check` refuses an import that points outward or across. These pass it, so review refuses
them. Each names the record in `docs/knowledge/decisions.md` that says why; read it before
arguing an exception.

## A name past another module's contract

A module's entry, `@app-template/application/<module>`, opens it whole: its contract, its
models, its services. Another module takes from it only the names of its `contract/` folder,
and no tool checks the names: review refuses a model, a service, a mapper or a namespace import
(`import * as`) of another module's entry.

```ts
// kept: an id of the contract
import { CustomerId } from '@app-template/application/customer'
// refused: a model of the customer module's domain
import { Customer } from '@app-template/application/customer'
```

Record: [Module contracts](../../docs/knowledge/decisions.md#module-contracts).

## A cycle of modules through their contracts

A dependency on a module's contract counts as one on the module. If `<a>` imports from `<b>`'s
entry and `<b>` from `<a>`'s, the modules form a cycle. Biome's `noImportCycles` refuses one of
value imports, never one through `import type`: refuse a change to `biome.json` whose list lets a
unit import one above it in the rings (a module the entry of a module above it, a kernel part a
part that imports it). Break the cycle
by moving the shared id or error into the contract of the module that owns it, or the flow into
a use case.
Records: [Module contracts](../../docs/knowledge/decisions.md#module-contracts),
[Guards are configuration](../../docs/knowledge/decisions.md#guards-are-configuration).

## A service rule or a model in the kernel

The kernel holds this app's tools and its data in the data layer's own types. A check that
refuses a write, a status move, a choice between outcomes or a `Schema.Class` of the domain
belongs in a module's `domain/` or `services/`, even when every module needs it. An entity keeps
only what the store enforces (a column, a check, an index).
Records: [One kernel](../../docs/knowledge/decisions.md#one-kernel),
[The data at the centre](../../docs/knowledge/decisions.md#the-data-at-the-centre).

## Another module's rule copied

A module may read and write any record, but a rule another module owns is called through a use
case, never repeated. The test: if the owner changes the rule, must this module change too? Yes:
one rule, call it. No: two rules that only look alike, each kept by its module.

```ts
// refused: the order module repeats the customer module's rule
if (customer.blockedAt !== null) return yield* new OrderRefusedError()
// kept: the use case calls the owner, then the order's own service
yield* CustomerService.requireActive(customerId)
yield* OrderService.place(customerId, lines)
```

Record: [Records open, rules called](../../docs/knowledge/decisions.md#records-open-rules-called).

## A rule in a use case

A use case composes services, holds the transaction, orders the writes against a store outside
it and enqueues the jobs. A branch on a model's state, a limit or a refusal of its own belongs in
the module whose model it reads; the use case calls it. A plain read or write with no rule may
go to the repository: [layering.md › Use cases](layering.md#use-cases).
Record:
[Use cases above the modules](../../docs/knowledge/decisions.md#use-cases-above-the-modules).

## A job that reacts to another module's write

A job carries work that outlives a request (a slow call, a retry), never a module's reaction to
what another module wrote. A flow that needs several modules is one use case, run synchronously.
Record:
[Use cases above the modules](../../docs/knowledge/decisions.md#use-cases-above-the-modules).
