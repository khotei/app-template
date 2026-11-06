# Attachment model rules — plan

> Ticket: `2026-11-06-1133_attachment-model-rules` · Source: the review of PR #23 (`attachment-stored-model`); no `feature.md` or `architecture.md`, the decision below is the spec

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | the rules "a one attachment is live" and "a value is found" are pure functions of the attachment model, which `AttachmentService` calls | done |

## How to run this plan

- Branch `refactor/attachment-model-rules`; one commit when the step is ready, then a PR the user
  merges.
- **Decision (user, 2026-11-06):** `AttachmentService` builds `AttachmentNotFoundError` itself
  twice (`getOne` for an expired or absent attachment, `download` for a missing file). The rule
  moves to the attachment model as pure functions, beside `ensureAllLive`, so the service reads
  and calls and the model alone names the refusal. Rejected: leaving the construction in the
  service (a second copy of a refusal the model owns); a new service for the rules (no variation
  to inject, see `attachment-stored-model`).
- The remaining code of the service is I/O orchestration (`upload`'s tracking and cleanup, the
  deletes, the empty-id guard that spares the database an empty `IN`) and stays.

## Steps

#### S1 — The one-attachment rules in the model

- **Delivers:** `attachment.model.ts` exports `ensureFound(id)`, which turns an absent `Option`
  into `AttachmentNotFoundError` naming `id`, and `ensureLive(id, now)`, which also drops an
  attachment that is not live at `now` (`flow(Option.filter(isLiveAt(now)), ensureFound(id))`), so
  it reads as the twin of `ensureAllLive(ids, now)`; `AttachmentService.getOne` pipes its read
  through `ensureLive`, and `download` pipes the file's URL through `ensureFound`.
- **Goal:** the service no longer builds `AttachmentNotFoundError` for one attachment, and the
  rule "a one attachment is live" is tested on values; the behaviour of `getOne`, `download` and
  `getMany` is unchanged.
- **Blocked by:** none.
- **Files:**
  - `application/chat/domain/attachment.model.ts` — `ensureFound` and `ensureLive`, beside
    `ensureAllLive`, each with a one-sentence TSDoc; the private `ensureAllFound` may build its
    error the same way when that removes a copy, never changing what it names or in which order.
  - `application/chat/services/attachment.service.ts` — `getOne` and `download` call them; drop
    what becomes unused (`AttachmentNotFoundError` as a value import if nothing else builds it,
    `Option.filter`).
  - `application/chat/__tests__/domain/attachment.model.test.ts` — the new functions on values.
  - `application/chat/index.ts` only if the use cases need them (they do not; the entry already
    re-exports the model).
- **Introduces:** `ensureFound` (first consumer: `download`, and `ensureLive`) and `ensureLive`
  (first consumer: `getOne`). Removes later: none.
- **Size:** ~40 changed lines of code and tests.
- **Test first:** the model's unit tests: `ensureFound` of `none` fails `AttachmentNotFoundError`
  naming the id and of `some` passes the value; `ensureLive` of an expired unbound attachment
  fails naming the id, of a live or a bound one returns it — red before (the functions do not
  exist), green after. The service's existing cases for `getOne` and `download` (absent, expired,
  another user's, no bytes) stay green unchanged.
- **Verify:**
  - `make check` — green.
  - Probe: make `ensureLive` return its argument unfiltered; the new model case and the service's
    expired cases (`getOne`, `download`, `delete`, all reading through `getOne`) go red and nothing
    else; restore it.
- **Model:** `opus medium`.
- **Status:** done
- **Findings:** passes: Standards, Spec (round S1.1); no simplify, no Design (two exported names
  weighed with the user beforehand), no hunt. `make check` green (254 unit, 104 e2e).
  - Probe — `ensureLive` returning its argument unfiltered turned 4 cases red and nothing else:
    the new model case and the service's expired cases for `getOne`, `download` and `delete`
    (`Tests 4 failed | 250 passed`).
  - Deviation — the plan named one service case; three go red because `download` and `delete`
    read through `getOne`. The probe line is corrected.
  - Standards — none. Spec — none.
  - Out of scope — a blank line before `return` in `getOne` and `download` predates the step.

## Requirement coverage

No `feature.md`; the scope is the review's finding, mapped to S1.
