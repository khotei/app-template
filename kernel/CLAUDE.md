# kernel

The kernel holds this app's configuration of its tools: its settings, its resources and the rule
that names them, and the clients built from them. Keeping them here keeps `packages/*` generic:
a package takes what is this app's as a parameter (a resource's name reaches the provisioner as
a function), and the kernel is the one place that passes it.

- A client or tool any app could use goes to `packages/*`; the kernel only configures it.
- The kernel imports only `packages/*`, never a layer or an app, and no package imports the
  kernel:
  [architecture.md › Dependency rules](../docs/knowledge/architecture.md#dependency-rules).
