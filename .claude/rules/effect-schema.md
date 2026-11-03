---
paths:
  - "**/*.ts"
---

# Effect: schemas and failures

## Schemas

- An invariant a check can state goes in the schema (`Schema.isTrimmed()`, `Schema.isPattern(…)`,
  a brand), so the constructor and every decode of a row enforce it.
- Brand with `Schema.brand`, never the `Brand` module, so `make`, the row's decode and the wire
  DTO agree. An id is `Schema.String.check(Schema.isUUID()).pipe(Schema.brand('<Model>Id'))`; a
  constrained value a port or use case accepts (a file name, a media type, a size) is a brand too.
- An absent value is an `Option` (`Schema.Option(…)` in a model), never `null` or `undefined`;
  `null` exists only in a wire DTO.
- An annotation a JSON Schema must carry sits on the encoded side, on the key of a checked field
  (`annotateKey`): `annotate` on a check or a transformation drops it. Its test reads it back from
  `Schema.toJsonSchemaDocument`.
- A closed set of stages or kinds is `Schema.Literals([...])`; a subset is `.pick([...])` of it,
  tested with `Schema.is(Subset)`.

## Failures

- Fail with `return yield* new <Model><Problem>Error({ … })`; the `return` ends the branch for
  TypeScript.
- A refused operation is a typed failure: never a `throw` (a defect that reads as an infrastructure
  failure) and never an `Option.none` (no detail for the caller or the log).
- A domain error is a `Schema.TaggedError` tagged with its class name, so it decodes at the wire;
  its HTTP status lives in `http-api/CLAUDE.md`. A marker that never leaves its module is
  `Data.TaggedError`.
- Not-found from a port is a value (`Option`, or an id left out of an array); its reader turns it
  into the domain's `*NotFoundError`.
- A port declares no error channel: its adapter turns a client's failure, or a stored value that
  no longer decodes, into a defect. The exception is a port whose failures are outcomes a use case
  settles each its own way (an external service that declines or gives up): one final
  `<Port><Problem>Error` per outcome, raised after the adapter's retries.
- A failure's user-facing sentence comes from one table keyed by its reason; the cause stays in a
  field that never reaches the user.
