---
paths:
  - "application/**"
  - "kernel/**"
---

# Modules: what review refuses

What `make check` cannot see, so review refuses it. Read the decision in
`docs/knowledge/decisions.md` before arguing an exception.

## A name past another module's contract

A module's entry opens it whole; its contract's entry (`@app-template/application/<module>/contract`)
re-exports by name the `domain/` files of its ids, its models with their errors and the group a
wire shape reads, the one path a `domain/` may take, which Biome holds. Through the whole entry
another module's other layers take only the names its contract exports, never a service, a rule's
group, a mapper or a namespace import (`import * as`); a name they need is re-exported there first.
Decision: [Module contracts](../../docs/knowledge/decisions.md#module-contracts).

## A cycle, or an import of a part above

Two modules that import each other's entries form a cycle, which `noImportCycles` refuses for
value imports and misses through `import type`: keep the shared id or error in the module that
owns it, exported by its contract, or move the flow into a use case. A cycle inside a module is
broken by widening a type; two models never nest each other: the one read with the other is its
select-only field ([models.md](models.md)) and names it back by id. Refuse too:

- a part importing one above it in its folder (a module the entry of a module above it, a kernel
  part one above or beside it, but in the data's e2e below, a package one above it), or a module's
  infrastructure the use cases; the kernel's order:
  [architecture.md](../../docs/knowledge/architecture.md#dependency-rules);
- test support (`<folder>/testing`, `#testing/<part>/…`) in source, and e2e support
  (`<folder>/testing/e2e`) in a unit test;
- of the kernel, in the data's tests more than its configuration and, in their e2e, the part whose
  containers they run on, through its entry and its `/testing/e2e` (the inventory, `AwsTest`); in
  `deployment` more than the configuration, the inventory and the files' key.

Decisions: [Module contracts](../../docs/knowledge/decisions.md#module-contracts),
[Guards are configuration](../../docs/knowledge/decisions.md#guards-are-configuration),
[Tests in their folders](../../docs/knowledge/decisions.md#tests-in-their-folders).

## A service rule or a model in the kernel

A check that refuses a write, a status move, a choice between outcomes or a domain
model belongs in a module's `domain/` or `services/`, even when every module needs it;
an entity keeps only what the store enforces (a column, a check, an index).
Decisions: [One kernel](../../docs/knowledge/decisions.md#one-kernel),
[The data at the centre](../../docs/knowledge/decisions.md#the-data-at-the-centre).

## Another module's rule copied

A module may read and write any record, but a rule another module owns is called through a use
case, never repeated. The test: if the owner changes the rule, must this module change too? Yes:
one rule, call it. No: two rules that only look alike, each kept by its module.
Decision: [Records open, rules called](../../docs/knowledge/decisions.md#records-open-rules-called).

## A job that reacts to another module's write

A job carries work that outlives a request (a slow call, a retry), never a module's reaction to
another module's write: a flow over several modules is one use case, run synchronously.
Decision:
[Use cases above the modules](../../docs/knowledge/decisions.md#use-cases-above-the-modules).
