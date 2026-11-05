# Client publishing

> Ticket: `2026-11-04-1131_client-publishing` · Source:
> [roadmap entry 10 `client-publishing`](../../knowledge/roadmap.md#10-client-publishing) and the
> grilling of 2026-11-04, which turned it from publishing a package into a self-standing API
> contract
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

The web reaches the server through the API definition, and that definition is built from the
modules' own schemas, imported through module entries that also export their services. The web
bundle stays free of server code only because the bundler drops what the web does not use: with
the side-effects flag removed, a Next.js build fails on a database driver. The backend pays for
the web too: a module's domain may import nothing but Effect because "it ships to the browser",
and the bundle check greps the repository's folder names, so it was rewritten six times after
renames and caught nothing.

## Goal

The API definition is a contract of its own: it declares every shape and error on the wire,
imports nothing of the app, and is the one codec of the whole round trip, so the api answers
through it, one mapper per model changing only what differs, and the web gets every type intact. The web reaches the server
only through it; the backend keeps no rule for the web's sake.

## Context

- **Prototypes of 2026-11-04** (worktree `client-publishing-contract-proto`, branch
  `proto/client-publishing-contract`, local commits `3922076ec4`, `fc50709f85`, `5761161edf`):
  - the contract declares 24 schemas of its own (ids, constrained strings, status literals, five
    models, seven errors, the auth middleware) and imports only `effect`; `openapi.json` stayed
    byte-identical; `make check` green with 241 unit and 104 e2e tests;
  - the contract's schemas encode the domain's values as they are: a `Struct` takes only its
    fields (an internal field never reaches the JSON), `Option` and `DateTime` round-trip, and a
    `Schema.Class` or `TaggedError` accepts a value carrying its identifier, not only its
    instances (`Schema.ts:16357-16359`), so a domain error leaves with the contract's status and
    reaches the client as the contract's class; the hand translation went from about 98 lines to
    none. The identifier check is internal: Effect marks it "HMR support" (`Schema.ts:16238`) and
    tests it nowhere, so an upgrade may drop it and turn every domain error into a 500;
  - the condition is that brand names and class identifiers match the domain's; a mismatch
    becomes a 500 (`HttpApiBuilder.ts:1012-1017`). `tsc` already fails a handler on a drifted
    brand or error tag; only a constraint (a length, a pattern) escapes the types, and comparing
    the two schemas' `SchemaRepresentation` catches it where their JSON Schema does not (a
    pattern with the `i` flag has none);
  - a new chat field cost one more line than today (the field in the contract); an internal
    rename reached no contract file;
  - renaming a domain field on the wire, nested in the attachment that 8 of the 13 endpoints
    return, broke all 8 handlers; behind one mapper per model (`(chat: Chat): ApiChat => chat`
    while the shapes match) it broke only the mappers and was fixed in one, and the api's 38 unit
    tests passed. A payload or a param is read by one handler only, so the input needs none.
- **Next.js 16.4.5 with Turbopack** (scratch app, same day): one `ApiClient` served a Server
  Component, a Server Action and a Client Component, with `Option`, `DateTime` and error classes
  intact in the browser and no server package in either bundle; with only the contract in the web
  the client JS was 278 KB gzip, slightly less than today; no `transpilePackages` was needed.
  Today's definition builds only while the modules' side-effects flag holds.
- **Practice:** Microsoft's API design guide, Stripe's versioning and Google AIP-180 keep the wire
  schema apart from internal models; contract-first stacks (ts-rest, oRPC) share a contract the
  server implements. Fowler's objection to DTOs targets local calls, not a network boundary.
- **Web today:** its client code may import only the API definition and the UI package (Biome);
  its `bun build` bundle holds no server package (checked 2026-11-04).

## Scope

- The API contract declares its own ids, constrained strings, models, errors, auth middleware and
  limits, and imports nothing of the app.
- The api's handlers answer through the contract's schemas, each model through one mapper.
- A parity check of the constraints the contract and the domain both declare.
- The web bundle check keyed on the packages the browser may hold instead of folder names.
- The records, the instruction files and the knowledge docs that describe the old boundary; the
  record "A module's layers" loses its browser reason while the domain's import bans stay.
- The roadmap: this entry rewritten; a new entry for a domain that takes types from the data
  layer.

## Out of scope

- Publishing to a registry, versions, CI publishing, use from other repositories.
- A generated client from `openapi.json`, a promise facade for non-Effect callers.
- A Next.js web app: `web-app`.
- Opening the domain to the data layer: its own roadmap entry, since it changes "The data at the
  centre".

## Requirements

- **R1** — THE API contract SHALL depend on no workspace of the repository and no package but
  Effect; IF it imports one, THEN `make check` SHALL fail naming the import.
- **R2** — WHEN the web calls an endpoint, THE client SHALL return its values with full types:
  branded ids, an absent value as an `Option`, a timestamp as a `DateTime`, and a refusal as the
  contract's error class matched by its tag.
- **R3** — WHEN the api answers an endpoint, THE api SHALL hand each domain model to the contract
  through one mapper per model, which returns the value as it is while the shapes match, and its
  domain errors to the contract's error classes as they are; an internal field of a domain value
  SHALL NOT reach the response.
- **R4** — THE wire SHALL stay as it is today: every route, field, status and error shape
  unchanged.
- **R5** — IF a brand name, a class identifier or a constraint of the contract differs from the
  domain's twin, THEN `make check` SHALL fail naming the pair, with no list of pairs or
  boundary values kept by hand.
- **R6** — THE web bundle SHALL hold no server code whether or not the bundler drops unused
  modules.
- **R7** — IF the web bundle holds a package outside the list of packages the browser may hold,
  which the web keeps, THEN `make check` SHALL fail naming the package and the import chain that
  brought it, with no repository folder name in the check.
- **R8** — WHERE the backend's code changes and the wire does not, THE contract and the web SHALL
  need no edit.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | an import of any workspace planted in the contract fails `make lint` with its name; the contract's manifest lists only `effect` |
| R2 | a client call in a test reads a chat back as `Option`, `DateTime` and a branded id, and a refused call is caught by its tag as the contract's class |
| R3 | each model a handler returns passes through its mapper, and a mapper of matching shapes returns its argument; a handler test shows `title: null` and an ISO date on the wire, a domain error answered with the contract's status, and a domain field absent from the contract absent from the JSON |
| R4 | `make api-check` passes; the snapshot differs from today's only in a component's name |
| R5 | a planted drift of the title limit, of a brand name and of an error identifier each fails `make check` naming the pair; a new twin schema added to both sides is compared with no edit to the check; one test shows a domain error encoded through the contract's class |
| R6 | a web build with every side-effects flag removed succeeds and the bundle check passes |
| R7 | a planted import of a database package, and of a server entry of a shared workspace, into web code each fail the bundle check naming the package and the chain; the check holds no repository folder name |
| R8 | renaming an internal domain field that is not on the wire touches no contract or web file; renaming a domain field that is on the wire edits one mapper and no contract, web or handler file |

## Open questions

### Q1 — Does the bundle check stay once the contract imports only Effect?

- **Why it matters:** the contract closes the path through the API, but the web also depends on
  the shared packages workspace, which holds server clients beside the UI package.
- **Options:** A — keep it, keyed on package names, as the one guard that sees the built bundle;
  B — drop it and rely on the import bans.
- **Recommendation:** A: it runs in about 0.1 s and no longer breaks on renames.
- **Answer:** A (user, 2026-11-04); its time grows with the web's own imports, not with the
  backend, and a move to Next.js is `web-app`'s to measure.

### Q2 — Does the prototype branch seed the implementation?

- **Why it matters:** its three commits already pass `make check` and e2e.
- **Options:** A — `/ticket-plan` reuses them as a reference and the steps rewrite them under the
  ticket's gates; B — cherry-pick them as the first steps.
- **Recommendation:** A, so each step lands with its review.
- **Answer:** A (user, 2026-11-04): the prototype is a reference only; `/ticket-architecture`
  designs the contract from scratch.
