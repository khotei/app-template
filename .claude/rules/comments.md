---
paths:
  - "**/*.ts"
---

# Code comments

The default is no comment: a stale comment is acted on with full confidence, so a bad one is worse
than none. A comment says why; the code says what.

## Should it exist

Delete it if a competent reader of this stack gets it from the code (types, signatures, control
flow, a test name, a rule or `CLAUDE.md`). Keep one only for:

- a non-obvious decision and the rejected alternative, so an agent does not "fix" it back;
- a gotcha or a non-local coupling surprising from a distance;
- an invariant or policy the type cannot express (an attempt count, an ordering, a proof value,
  the order of a list a port returns, what a missing key yields): one TSDoc sentence on the
  export that carries it, stated once, on the port or the repository, never again in its other
  layers;
- a usage constraint on an exported symbol ("keep `refreshInterval` below `expiry`").

Never line narration, step markers, a doc block that repeats the function name, a `@param` that
restates a type, architecture or layering, or provenance tags (ticket or requirement ids belong in
the commit's `Refs:`). Test: delete it and re-read the code; if it still says the same, keep it
deleted.

## How to write it

A survivor is a TSDoc `/** … */`: one declarative sentence a caller can act on without reading
the body (if it cannot be written, fix the interface), and an optional second paragraph for the
reason it passed. A single-line `//` is for a pinpoint gotcha inside a body. `@param` and
`@returns` only when name and type do not say it; never `@since` or `@category`.

A change that makes a comment wrong shows it restated code: delete it, do not update it.

Never strip `biome-ignore`, `@ts-expect-error`, `@ts-ignore`, shebangs or build pragmas: they are
code, not prose.
