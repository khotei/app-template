---
paths:
  - "**/package.json"
  - "Makefile"
  - ".env*"
  - "kernel/config/**"
  - "biome.json"
  - ".misc/lint/**"
  - "**/tsconfig*.json"
---

# Tooling

- Settings are read only through the `Config` values of `@app-template/kernel/config`, save the
  `OTEL_*` variables `Otlp.layerFromConfig` reads itself and the web server's, which its entry
  declares, since the web declares no kernel; `.env.pulumi` is written by `make up`, never by
  hand.
- A change to a guard (a Biome override or plugin, a manifest's `exports` or dependencies, a
  `tsconfig` reference, a check script) is first seen red on one probe per ban it adds, changes or
  removes, and per ban of every override matching the same files, since a later Biome override
  replaces an earlier one's options. A probe is one import or line its ban alone refuses, reverted
  after. A rule that says "only X" is an allow-list; where only a deny-list can hold it, probe
  each class the rule names (a workspace, a built-in, an installed package).

The rest, with the commands and why they are so: the catalogs, the environment files and the dev
modes of [docs/knowledge/tooling.md](../../docs/knowledge/tooling.md).
