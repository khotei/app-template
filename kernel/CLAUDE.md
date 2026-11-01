# kernel

The kernel holds this app's configuration of its tools: its settings, its resources and the rule
that names them, the clients built from them, and its data: the tables, entities and relations
in `data/`, with the schema's history in `data/migrations/`.
Keeping them here keeps `packages/*` generic: a package takes what is this app's as a parameter
(a resource's name reaches the provisioner as a function), and the kernel is the one place that
passes it.

- A client or tool any app could use goes to `packages/*`; the kernel only configures it.
- The migrations live here, not in `packages/db`: the schema and the client's config are this
  app's, and `packages/db` only applies the folder it is given.
- The data layer speaks its own types: besides packages, a table imports only tables and an
  entity only tables and entities, never a model, so an enum, a check's limit or pattern and a
  JSON column's shape are declared there.
- The kernel imports only `packages/*`, never a layer or an app, and no package imports the
  kernel:
  [architecture.md › Dependency rules](../docs/knowledge/architecture.md#dependency-rules).
