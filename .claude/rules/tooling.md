---
paths:
  - "**/package.json"
  - "Makefile"
  - ".env*"
  - "kernel/config/**"
---

# Tooling

- A version lives only in a root catalog, pinned exactly; a workspace references it as
  `catalog:<namespace>`, never the unnamed `catalog:`.
- Settings are read only through the `@app-template/kernel/config` layers; `.env.pulumi` is
  written by `make up`, never by hand.

The rest, with the commands and why they are so: the catalogs, the environment files and the dev
modes of [docs/knowledge/tooling.md](../../docs/knowledge/tooling.md).
