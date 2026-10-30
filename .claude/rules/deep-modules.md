---
paths:
  - "domain/**"
  - "application/**"
  - "apps/**"
  - "infrastructure/**"
---

# Deep modules

A module earns its place by depth: much behaviour behind a small interface, which is all a caller
must know (methods, argument and answer shapes, error modes). Words:
`mattpocock-skills:codebase-design`. The exemplar is a repository port: five verbs over a `where`
typed from the model hide the SQL, the relations, the owner filter, the order and the guards, and
callers compose them with pure model functions. `git log -S <name>` finds why a move was made.

## The tests

- **Deletion:** delete the module in thought. Nothing reappears in its callers → it was a
  pass-through: delete it. It reappears in several → it earns its place.
- **Interface:** before a new method, type, field or option, pass the variation as a value an
  existing one takes (a `where` field, a model field); a new name is the last resort.
- **Caller:** what only tests use is no interface; delete it with its mapper, fake branch and test.

## A deep port

- One method per verb (`insert`, `update`, `selectOne`, `selectMany`, `delete`) over a `where`
  typed from the model; a new filter is a field, never `selectByX`.
- A write answers `void` and dies where it matches no row (`orDieOnNoRows`): the caller checked
  the rule, so a miss is a lost race; a `boolean`, rows or a domain error adds an error mode to
  every caller.
- One shape per entity: a related model is a field the same relational query fills
  (`Message.attachments`), never a second type; an option keeps the answer's type (`forUpdate`).
- The filter lives in the `where`, a relation in the database (`ON DELETE CASCADE`), never in code
  after the read.
- Its adapters stay small through internal modules (`buildWhere`, `buildSet` in
  `infrastructure/db/columns.ts`); a `where` inside a relational query is built on the table the
  query hands over (`encodeWhere(table)`).
- The memory fake is the port's second adapter: its methods share one matcher
  (`domain/testing/rows.test-util.ts`), never a copy each.

## Composition over pass-through

- A pure model function builds or moves the value and names the refusal; the port writes it under
  the old state; no method sits between (`prepareMessage`, then `MessageRepository.update`).
- A domain service keeps only rules that need a read (`ChatService.delete`: the owner, the
  cascade, the bytes).
- Two methods that differ by their `where` or `set` are one, taking them from the caller
  (`ChatService.rename`), its arguments as narrow as the fields it uses.
- A copy per entity is one function over the varying part (`generateId`, `Status.pick`,
  `hasStatus`).
- After a write, answer the value the pure function built; never re-read it or re-check what the
  write's guard checked.
- A value another table implies is a column moved by transitions, not derived on each read
  (`queueChat`).
- Plumbing is a pipeable (`orDieOnNoRows`), never `if (…) return yield* Effect.die(…)`; an import
  cycle is broken by widening a type (an error's `from` takes `Status`), never by a new file.

## After a removal

Grep the removed name, its types and its options in code, fakes, docs and `.claude/rules/`.
