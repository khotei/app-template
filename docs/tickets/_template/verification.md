# <Title> — verification

> Ticket: `<YYYY-MM-DD-HHmm>_<slug>` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run, and `stage <n>` one section per stage
run; earlier runs stay as history. -->

## Stage 1 — <YYYY-MM-DD>

**Verdict:** pass | fail

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | <command and output, response, or path:line> |

**Fixed by:** <each round that fixed a failure, by its id (`St1 S2.3 (VERIFY)`), with the
requirement it fixed; or "none">

## <YYYY-MM-DD> — run 1

**Verdict:** pass | fail

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | <command and output, response, or path:line> |

**Not verifiable:** <what could not be observed, and why; or "none">

### Stages

<Summed by `/ticket-verify` for a plan in stages, one row per stage; each cell counts and names
the steps.>

| Stage | Outcome or order changed | Details only | Later steps edited | Loop stopped |
|---|---|---|---|---|
| 1 | <n: S<n>, …> | <n: S<n>, …> | <n: S<n>, …> | <no, or yes: why> |

### Review

#### Review ledger

<Summed by `/ticket-verify` from each step's **Findings** in `plan.md`, one row per pass.>

| Pass | Findings | Accepted | Fixed | Rejected |
|---|---|---|---|---|
| <pass> | <n> | <n> | <n> | <n> |

#### Standards

<the Standards reviewer's report, verbatim>

#### Spec

<the Spec reviewer's report, verbatim>

### Simplifications

1. <change, `path:line`, expected gain; small enough for one plan step>

### Lessons

<Mistakes that recurred in two or more steps. Each proposes one change, applied only on the user's
OK.>

#### L1 — <what went wrong, in one line>

- **Evidence:** <the steps, review rounds or feedback where it recurred>.
- **Cost:** <what it caused: rounds, time, a wrong result>.
- **Proposed change:** <one line in a named skill or rule, or a mechanical check>.
- **Applied:** no
