---
paths:
  - "**/*.ts"
---

# Effect: schemas and failures

## Schemas

- Decode untrusted input with a schema, never with hand-written predicates.
- Put an invariant in the schema whenever a check can state it (`Schema.isTrimmed()`,
  `Schema.isPattern(…)`, a brand), so the constructor and every decode of a row enforce it.
- Brand with `Schema.brand`, never the `Brand` module: the schema route keeps the check and the
  brand together, so `make`, the row's decode and the wire DTO all agree. An id is
  `Schema.String.check(Schema.isUUID()).pipe(Schema.brand('<Entity>Id'))`; a constrained value a
  port or use case accepts (a file name, a media type, a size) is a brand too, so a plain `string`
  or `number` cannot slip in.
- An absent value is an `Option` (`Schema.Option(…)` in a model), never `null` or `undefined`;
  `null` exists only in a wire DTO.
- A literal lookup table is `as const satisfies Record<Key, Value>`, so a new key fails typecheck.
- A `Schema.Class` instance is `Data`: compare two with `Equal.equals`, never field by field.
- A closed set of stages or kinds is `Schema.Literals([...])`; a subset is `.pick([...])` of it, and
  its membership test is `Schema.is(Subset)`, not a hand-written `includes`.

## Failures

- Fail with `return yield* new <Entity><Problem>Error({ … })`; the `return` ends the branch for
  TypeScript.
- A refused operation is a typed failure: never a `throw` (a defect that reads as an infrastructure
  failure) and never an `Option.none` (no detail for the caller or the log).
- A domain error is `Schema.TaggedError`, so it decodes at the wire; its HTTP status lives in
  `http-api/CLAUDE.md`. A marker that never leaves its module (a failure carried out of a callback
  for the loop around it) is `Data.TaggedError`.
- Not-found from a port is a value (`Option`, or an id left out of an array); its reader turns it
  into the domain's `*NotFoundError`.
- A port declares no error channel: its adapter turns a client's failure or a stored value that
  no longer decodes into a defect, since every caller handles both alike.
- A user-facing sentence per failure reason lives in one table keyed by the reason; the cause stays
  in a separate field that never reaches the user.
