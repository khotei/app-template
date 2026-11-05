# Client publishing — timings and review value

> Ticket: `2026-11-04-1131_client-publishing` · Measured by the main session of
> `/ticket-implement`: times from `date`, sizes from `git diff -M --stat`, findings from the
> reviewers' reports. Written to judge what the process costs and which passes earn their time.

## Steps

| Step | Estimated | Actual (`git diff -M --stat`) | Implementer | Simplify | Review | Total to commit |
|---|---|---|---|---|---|---|
| S1 | ~105 | 61+/48- over 18 files (S1.1), 3+/3- (S1.2) | 14:10:44 → 14:15:30 (4m46s) | 14:15:30 → 14:17:01 | 14:17:01 → 14:18:25 | 14:10:44 → 14:21 (about 10m) |
| S2 | ~390 | 268+/95- over 19 files (S2.1), 8+/6- (S2.2) | about 5m50s | about 5m (4 agents) | about 6m (3 agents) | about 20m |
| S5 | ~20 | 39+/2- over 2 files | 3m26s (agent time, no wall clock taken) | none (no new interface) | Standards 18s, Spec 37s | not taken |
| S7 | ~20 (docs) | 5+/4- over 3 files (S7.1), 5+/5- over 2 files (S7.2) | 2m20s and 2m15s (agent time) | none | S7.1 Standards 16s, Spec 39s; S7.2 Standards 17s, Spec 39s | not taken |
| S6 | ~15 | 12+/8- over 4 files | 3m31s (agent time) | none | Standards 20s, Spec 51s | not taken |

## Review value

`value`: real = a defect against a requirement or a false statement; form = naming or wording
with no effect on behaviour; none = rejected or speculative. `make check` column: would the green
gate have caught it.

| Step | Round | Pass | Finding | Fate | Value | Caught by `make check` |
|---|---|---|---|---|---|---|
| S1 | 1 | Standards | CLAUDE.md "still the domain's" goes stale | fixed (S1.2) | form | no |
| S1 | 1 | Standards | `ids.ts` plural, no `.id` suffix | rejected: `errors.ts` precedent | form | no |
| S1 | 1 | Standards | ids bullet lists folder contents | fixed (S1.2) | form | no |
| S1 | 1 | Spec | ids bullet says the contract's while groups still import the domain's | fixed (S1.2) | real (false doc) | no |
| S1 | 1 | Design | translate identity's error at the seam | rejected: speculative | none | no |
| S1 | 1 | Design | `UserUnknownError` into `errors.ts` | rejected: speculative | none | no |
| S1 | 1 | simplify | simpler `brand` parameter type | tried, `tsc` refused | none | yes |
| S2 | 1 | simplify | redundant `Schema.is` and `instanceOf` in tests (2 items) | fixed in S2.1 | none | no |
| S2 | 1 | simplify | identity `Arr.map` in list handlers; inline `rename`; `buildApiSendResult`; test helper (4 items) | rejected | none | no |
| S2 | 1 | Standards | `yield*` nested in the mapper call, 4 sites | fixed in S2.2 | form (hard rule) | no |
| S2 | 1 | Standards | `.mapper` row of `naming.md` | open for S3 | form | no |
| S2 | 1 | Spec | none | - | - | - |
| S2 | 1 | Design | upload decodes with the domain's strings; one call form for mappers | rejected | none | no |

## Per pass, running totals

| Pass | Findings | Fixed | Real | Time |
|---|---|---|---|---|
| simplify (4 agents) | S1: 1 item; S2: 6 items | S1: 0; S2: 2 | 0 | S1 about 1m30s; S2 about 5m |
| Standards | S1: 3; S2: 2 | S1: 2; S2: 1 | 0 | about 1m (parallel) |
| Spec | S1: 1; S2: 0 | S1: 1 | 1 (S1) | about 1m (parallel) |
| Design | S1: 2; S2: 2 | 0 | 0 | about 1m (parallel) |
| S5 | 1 | Standards | none | - | - | - |
| S5 | 1 | Spec | `architecture.md` described the chat mappers as the identity (Contracts, D6, Seams row) | fixed in the commit | real (false doc) | no |

## Process notes

- S1 cost 10 minutes for 105 lines, S2 about 20 for 363: the step cut matters more than a pass.
- A plan cut by endpoint group made the first S2 block (a twins test on names a later step
  replaces); the plan was recut from five steps to three, and the toolkit gained a Shape check,
  an Introduces field and a Scope block (`36c24b3581`).
- The implementer left out the new Scope block in its first S2 report: a new report field needs
  the main session to ask for it once.
