# kernel

This app's configuration of its tools (its settings, its resources and the rule that names them,
the clients built from them, the queue's transport over the table `jobs`) and its data in
`data/`. A package takes what is this app's as a parameter (a resource's name reaches the
provisioner as a function), and the kernel is the one place that passes it. Where each part sits
in the rings and what it may import:
[architecture.md › Dependency rules](../docs/knowledge/architecture.md#dependency-rules).

- A client or tool any app could use goes to `packages/*`; the kernel only configures it.
- The migrations live here, not in `packages/db`: the schema and the client's config are this
  app's, and `packages/db` only applies the folder it is given.
- How the data layer gets a store's client:
  [architecture.md › Add a store's client](../docs/knowledge/architecture.md#add-a-stores-client).
- The data layer speaks its own types: besides packages, a table imports only tables and an
  entity only tables and entities, never a model, so an enum, a check's limit or pattern and a
  JSON column's shape are declared there.
- The data layer stores a job as a row and imports no `queue`: encoding a job and sending it to
  SQS stay in `queue/`, over `JobRepository`.
