# Research: rules of a modular monolith for this template

> Ticket: `2026-10-31-0926_modular-monolith` · Gathered 2026-10-30, re-checked 2026-10-31 · The
> full write-up with quotes is the claude.ai doc
> [Модульный монолит: руководство](https://claude.ai/artifact/L1MM6ostJgNz5Lhrpw36Gv), tab
> "Исследование"; this file keeps what the ticket relies on.

## Conclusion

The guide and the frameworks agree on a core this stack enforces without a new tool:

1. A module is a business capability that owns its behaviour.
2. Only its contract is visible outside, shaped for the consumers' use cases, not the domain model.
3. Dependencies between modules are declared and acyclic.
4. A violation fails the build; a module whose boundary is not checked "is just a package".

On data the ticket departs from the guide on purpose: one data layer owns every store for every
module, and a use case may commit several modules' writes in one transaction
(`feature.md › Decisions`, `architecture.md › D7, D2, D16`).

## The guide (Software Architecture Guild)

Quotes checked against the page text.

- **Modular monolith.** "one deployable application split into real modules aligned to the
  domain. Each module owns its behavior and data"; "collaboration happens only via the module's
  public surface (methods and/or events)"; "There is no cross-module data write—one writer per
  dataset"; may "share a physical database, but not each other's tables … schema segments map to
  modules"; "Transactions are local to a module; cross-module workflows coordinate with events or
  explicit orchestration"; "Keep internal layering per module (API → domain → infrastructure)";
  "shared 'domain' utilities are treated as a smell and kept domain-free"; "Add fitness functions
  in CI: allowed-deps, no cycles, forbidden imports; turn violations into failing builds".
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/))
- **Finding boundaries.** A module's mission fits one sentence, else "you have a bucket"; what
  always changes together belongs in one module; "if the data boundaries and the component
  boundaries don't roughly align, one of them is wrong"; boundaries per table make anemic modules.
  ([what-is-component](https://software-architecture-guild.com/guide/architecture/boundaries/what-is-component/),
  [defining-components](https://software-architecture-guild.com/guide/architecture/boundaries/defining-components/))
- **Coupling.** Judged on strength, distance and volatility: "Contrast between strength and
  distance tends toward modularity"; strength from intrusive (another's tables) through
  functional and model down to contract; "Async messaging does not magically reduce coupling
  strength". ([dimensions](https://software-architecture-guild.com/guide/architecture/boundaries/dimensions-of-coupling/),
  [balancing](https://software-architecture-guild.com/guide/architecture/boundaries/balancing-coupling/))
- **Data.** "The service that writes to a table owns that table"; other data "via APIs, not
  cross-schema joins"; "Foreign keys, views, triggers, and logical invariants encode coupling
  between tables"; "'Database per service' is not a rule"; "Use ACID locally inside each service".
  ([managing-operational-data](https://software-architecture-guild.com/guide/architecture/boundaries/managing-operational-data/))
- **Contracts.** "design contracts around use cases, not around internal entity models"; "Add
  fields as optional first". ([contracts](https://software-architecture-guild.com/guide/architecture/boundaries/contracts/))
- **Sharing.** "Duplication is sometimes the cheapest way to stay decoupled"; share "narrow,
  well-understood behaviors, not entire business objects".
  ([sharing](https://software-architecture-guild.com/guide/architecture/boundaries/sharing/))
- **Contexts.** "Every seam between contexts is a contract"; a shared kernel: "Keep the kernel
  tiny", "Run integration tests for every kernel change"; an anticorruption layer when the
  consumer is core; open host service when many consume; the outbox writes events "in the same
  transaction", consumers handle at-least-once delivery; "Reference other aggregates by ID".
  ([integration-of-bounded-contexts](https://software-architecture-guild.com/guide/architecture/domains/integration-of-bounded-contexts/),
  [domain-model-building-blocks](https://software-architecture-guild.com/guide/architecture/domains/domain-model-building-blocks/))
- **Governance.** Fitness functions: "executable checks that evaluate a specific characteristic
  against thresholds", run in CI; exceptions are time-boxed; review the context map "once or
  twice a year". ([measuring-and-governing](https://software-architecture-guild.com/guide/architecture/characteristics/measuring-and-governing/),
  [domains-evolution](https://software-architecture-guild.com/guide/architecture/domains/domains-evolution/))

## Practice

| Framework | Rules | Checked by |
|---|---|---|
| [Spring Modulith](https://docs.spring.io/spring-modulith/reference/verification.html) | acyclic module graph; no reference into internal packages; named interfaces; optional `allowedDependencies` | `ApplicationModules.verify()` in a test |
| [modular-monolith-with-ddd](https://github.com/kgrzybek/modular-monolith-with-ddd) | events only, no direct calls; a schema per module; outbox and inbox per module | NetArchTest architecture tests |
| [Packwerk](https://github.com/Shopify/packwerk/blob/main/USAGE.md) | declared dependencies; only `app/public` visible; acyclic; a baseline of old violations | `packwerk check` in CI |
| [Nx](https://nx.dev/docs/kb/enforce-module-boundaries) | tag constraints, cycles, no relative paths | an ESLint rule over the Nx graph: does not fit here |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | forbidden/allowed edges, folder cycles, one rule for all modules via `$1` | a CLI; needs a TS parser this repo lacks |

Lesson: a hand-written architecture test drifts silently (in modular-monolith-with-ddd the
"Domain does not depend on Infrastructure" test checks the Application assembly); prefer one
generic rule over a test per module.

## Verified in this repo

- Biome 2.5.15 `noRestrictedImports` catches `import`, `export * from` and `export { x } from`.
  One override on a path glob with `@app-template/*`, `@app-template/**` and negations for the
  allowed packages bans every other one; without `**` a deep path passes. Biome also has
  `noImportCycles` (file level) and `noPrivateImports`.
- tsgo 7.0.2: circular project references fail with TS6202.
- `bunfig.toml` `linker = "isolated"`: an undeclared workspace fails with TS2307.

## What the ticket took

- Modules by capability, never one per table: D1.
- Layers inside a module, checked by a Biome override per layer: D4, D12.
- Other modules see only a contract workspace: D3.
- Module dependencies declared and acyclic: the isolated linker, `tsc -b`, the modules rule (D12).
- The kernel holds no business rule: D5, the modules rule.
- External systems behind the adapters of the module that uses them: D4.
- A module's tests run over its layers and memory twins; e2e prove the wiring: D19.
- A violation fails `make check`, through configuration, never a hand-written test: D12.
