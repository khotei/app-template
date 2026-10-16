---
paths:
  - "**/*.ts"
---

# Code comments

Default is **no comment**: a stale comment is acted on with full confidence, so a bad one is worse
than none. Comment the **why**; the code states the what.

## Gate A — should it exist?

**Could a competent reader of this stack get it from the code itself** (types, signatures, control
flow, a test name, a rule or `CLAUDE.md`)? Yes → delete it on sight. Only four reasons to keep one:

- a non-obvious **decision plus the rejected alternative** (it stops an agent "fixing" it back);
- a **gotcha or non-local coupling** that is surprising from a distance;
- an **invariant the type cannot express**;
- a usage **constraint on an exported symbol** ("call `loadConfig` before `createLayer`").

Never write line narration, step markers, a doc block that repeats the function name, a `@param`
that restates a type, or provenance tags (ticket or requirement ids belong in the commit `Refs:`).
**Test:** write it, delete it, re-read the code. If the code still says the same thing, keep it
deleted.

## Gate B — write the survivor as documentation

An export gets no doc block by default. A survivor is a **TSDoc `/** … */`** comment: one
declarative sentence a caller can act on without reading the body (if you cannot write it, fix the
interface), plus an optional second paragraph only for the reason it passed Gate A. A single-line
`//` is for a pinpoint gotcha inside a body. Use `@param`/`@returns` only when name and type do not
say it; never `@since` or `@category`.

## Maintenance

A comment is never "kept in sync": if a change makes it wrong, it was restating code, so **delete
it, don't update it**. Never narrate architecture or layering in a comment; that is the job of the
rules and `CLAUDE.md`. Most files need zero comments.

**Never strip these, they are code, not prose:** `biome-ignore`, `@ts-expect-error`, `@ts-ignore`,
shebangs, build pragmas.
