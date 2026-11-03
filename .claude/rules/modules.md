---
paths:
  - "application/**"
  - "kernel/**"
---

# Modules: what review refuses

What `make check` cannot see, so review refuses it. Read the record in
`docs/knowledge/decisions.md` before arguing an exception.

## A name past another module's contract

A module's entry opens it whole; another module takes from it only the names of its `contract/`
folder, never a model, a service, a mapper or a namespace import (`import * as`).
Record: [Module contracts](../../docs/knowledge/decisions.md#module-contracts).

## A cycle, or an import of a unit above

Two modules that import each other's entries form a cycle, which `noImportCycles` refuses for
value imports and misses through `import type`: move the shared id or error into the contract of
the module that owns it, or the flow into a use case. Refuse too:

- a unit importing one above it in its folder (a module the entry of a module above it, a kernel
  part or a package one above it, a module's infrastructure the use cases);
- test support (`<folder>/testing`, `#testing/<unit>/…`) in source, and e2e support
  (`<folder>/testing/e2e`) in a unit test;
- of the kernel, more than its configuration in the web server's entry, than it and the inventory
  in the data's tests, than those and the files' key in `deployment`.

Records: [Module contracts](../../docs/knowledge/decisions.md#module-contracts),
[Guards are configuration](../../docs/knowledge/decisions.md#guards-are-configuration),
[Tests in their folders](../../docs/knowledge/decisions.md#tests-in-their-folders).

## A service rule or a model in the kernel

A check that refuses a write, a status move, a choice between outcomes or a domain
`Schema.Class` belongs in a module's `domain/` or `services/`, even when every module needs it;
an entity keeps only what the store enforces (a column, a check, an index).
Records: [One kernel](../../docs/knowledge/decisions.md#one-kernel),
[The data at the centre](../../docs/knowledge/decisions.md#the-data-at-the-centre).

## Another module's rule copied

A module may read and write any record, but a rule another module owns is called through a use
case, never repeated. The test: if the owner changes the rule, must this module change too? Yes:
one rule, call it. No: two rules that only look alike, each kept by its module.
Record: [Records open, rules called](../../docs/knowledge/decisions.md#records-open-rules-called).

## A rule in a use case

A branch on a model's state, a limit or a refusal of the use case's own belongs in the module
whose model it reads; the use case calls it.
Record:
[Use cases above the modules](../../docs/knowledge/decisions.md#use-cases-above-the-modules).

## A job that reacts to another module's write

A job carries work that outlives a request (a slow call, a retry), never a module's reaction to
another module's write: a flow over several modules is one use case, run synchronously.
Record:
[Use cases above the modules](../../docs/knowledge/decisions.md#use-cases-above-the-modules).
