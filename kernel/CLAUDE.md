# kernel

The kernel holds this app's configuration of its tools: its settings, its resources and the rule
that names them, the clients built from them, and the schema's history in `data/migrations/`.
Keeping them here keeps `packages/*` generic: a package takes what is this app's as a parameter
(a resource's name reaches the provisioner as a function), and the kernel is the one place that
passes it.

- A client or tool any app could use goes to `packages/*`; the kernel only configures it.
- The migrations live here, not in `packages/db`: the schema and the client's config are this
  app's, and `packages/db` only applies the folder it is given.
- The kernel imports only `packages/*`, never a layer or an app, and no package imports the
  kernel:
  [architecture.md › Dependency rules](../docs/knowledge/architecture.md#dependency-rules).
