---
paths:
  - "deployment/**"
---

# Alchemy: where its API, its guides and its examples are

Alchemy is a beta whose API moves between releases, and what you remember of it is an older
one. Check every name, prop and default against the vendored `repos/alchemy`, pinned to the
catalog's version by `make vendor-alchemy`, never memory and never the website: the site shows
`main`, which is ahead of the pin.

## Where to look

| The question | Where its answer is |
|---|---|
| a resource's props, defaults and attributes | its file, `repos/alchemy/packages/aws/src/<Service>/<Resource>.ts`: the props interface, and the examples in the JSDoc above the resource, one `**Example:**` per use |
| the core: the stack, outputs, bindings, the context, state, the CLI's flags | `repos/alchemy/packages/alchemy/src/`, one file per concept (`Stack.ts`, `Output.ts`, `Binding.ts`, `AlchemyContext.ts`; the flags under `Cli/commands/`) |
| a host command, a container, a test | `repos/alchemy/packages/alchemy/src/Command/`, `repos/alchemy/packages/docker/`, `repos/alchemy/packages/alchemy-test/` |
| why and how, in prose | the guides' sources, `repos/alchemy/website/src/content/docs/`: `infrastructure-as-effects/` (bindings, phases, layers), `infrastructure-as-code/`, `project-structure/`, `environments/`, `testing/`, `command/`, and `aws/` by topic (`compute/`, `messaging/`, `data/`, `frontend/`, `security/`, `tutorial/`, `local-development.mdx`) |
| a whole program that works | `repos/alchemy/examples/aws-*/`: an Effect `HttpApi` on Lambda in `aws-lambda-httpapi`, a database in `aws-rds`, a site and its router in `aws-router` and `aws-static-site`, the dev mode in `aws-dev`, one stack over several apps in `monorepo-single-stack` |
| how a resource behaves once deployed | its suite, `repos/alchemy/packages/integration-tests/test/AWS/<Service>/`: the calls the authors themselves make, with the IAM and the waits a guide leaves out |
| how it behaves under `alchemy dev` | the `Floci<Resource>Provider.ts` beside the resource, and `repos/alchemy/packages/aws/src/Local/` |
| the authors' own conventions | `repos/alchemy/AGENTS.md` (bindings, typed errors, local providers, fixtures) and `repos/alchemy/packages/aws/src/AGENTS.md` (layers in a function) |
| what a release changed | `repos/alchemy/CHANGELOG.md` |

## Reading it

- **The source outranks the guide.** A guide's snippet can name a prop the pinned source lacks or
  spells otherwise; the reference pages are generated from the JSDoc, so the file is the
  original. Quote what you use as `path:line`.
- **Start from the nearest example, then the resource's file.** An example shows the units in
  their order (the declaration, its binding, its layer); the file says what each prop does.
- **The emulator is not vendored.** `alchemy dev` runs floci; its image and tag are pinned in
  the `Local/` folder named above, and its behaviour is read in `alchemy-run/floci` at that tag.
- **A bump is three moves:** the catalog's version, `make vendor-alchemy`, then
  `repos/alchemy/CHANGELOG.md` read for every breaking line that names something `deployment/`
  uses.
