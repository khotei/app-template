# kernel

This app's configuration of its tools (its settings, its resources and the rule that names them,
the clients built from them, the queues' sender named for the stage, the policy of a
language-model call and its errors) and its data in `data/`. A package takes what is this app's
as a parameter (a resource's name reaches the queue sender as a function). Where each part sits
in the rings and what it may import:
[architecture.md › Dependency rules](../docs/knowledge/architecture.md#dependency-rules).

- A client or tool any app could use goes to `packages/*`; the kernel only configures it.
- A function that fixes this app's numbers or names this app's error over a library's API (a
  retry policy, an error mapping) stays in the kernel part of that library; it moves to
  `packages/` only when its numbers are options and its error is the library's own.
- The migrations live here, not in `packages/db`: the schema and the client's config are this
  app's, and `packages/db` only applies the folder it is given.
- How the data layer gets a store's client:
  [architecture.md › Add a store's client](../docs/knowledge/architecture.md#add-a-stores-client).
- The data layer speaks its own types: besides packages, a table imports only tables and an
  entity only tables and entities, never a model, so an enum, a check's limit or pattern and a
  JSON column's shape are declared there
  ([why](../docs/knowledge/decisions.md#the-data-at-the-centre)).
- The data layer imports no `queue`: a job is a queue message, and no table holds it
  ([why](../docs/knowledge/decisions.md#jobs-as-queue-messages)).
