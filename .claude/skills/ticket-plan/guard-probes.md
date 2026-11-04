# Guard probes

A step that adds, changes or removes a guard or a scope of one lists, in the **Probes** shape of
`docs/tickets/_template/plan.md`, one probe per ban of each scope it adds, changes or removes, of
every scope whose files those also match, and of every scope when it rewrites the guard whole.
The overlap counts because a later Biome override replaces an earlier one's options for the files
both match.

- An added scope's own probes fail only after the change; they are recorded with the output they
  give at plan time. Every other probe fails at plan time.
- A scope is one Biome override, the root config, one Biome plugin or one grep; a ban is one
  restriction in it with its own message: a pattern or a path of an override or of the root's
  import rule, a root rule that refuses an import (`noImportCycles`), one diagnostic a plugin
  registers, a grep's pattern. An override of four groups takes four probes. Each probe is one
  import or line that its ban alone refuses, and names the command it fails (the guard's tool
  alone, or `make check`).
