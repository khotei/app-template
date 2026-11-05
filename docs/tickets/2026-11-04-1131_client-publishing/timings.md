# Client publishing — timings and review value

> Ticket: `2026-11-04-1131_client-publishing` · Measured by the main session of
> `/ticket-implement`: times from `date`, sizes from `git diff -M --stat`, findings from the
> reviewers' reports. Written to judge what the process costs and which passes earn their time.

## Steps

| Step | Estimated | Actual (`git diff -M --stat`) | Implementer | Simplify | Review | Total to commit |
|---|---|---|---|---|---|---|
| S1 | ~105 | 61+/48- over 18 files (S1.1), 3+/3- (S1.2) | 14:10:44 → 14:15:30 (4m46s) | 14:15:30 → 14:17:01 | 14:17:01 → 14:18:25 | 14:10:44 → 14:21 (about 10m) |

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

## Per pass, running totals

| Pass | Findings | Fixed | Real | Time |
|---|---|---|---|---|
| simplify (4 agents) | 4 reports, 1 item | 0 | 0 | about 1m30s |
| Standards | 3 | 2 | 0 | about 1m (parallel) |
| Spec | 1 | 1 | 1 | about 1m (parallel) |
| Design | 2 | 0 | 0 | about 1m (parallel) |
