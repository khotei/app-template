# Attachment stored model — plan

> Ticket: `2026-11-06-1048_attachment-stored-model` · Source: the review of PR #22 (`attachment-storage-failures`); no `feature.md` or `architecture.md`, the decisions below are the spec

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | the lost-bytes check is a pure function of the attachment model, composed by the send, so `getMany` stays a plain read | done |

## How to run this plan

- Branch `refactor/attachment-stored-model`; the work stays uncommitted for the user's review.
- **Decision (user, 2026-11-06):** the check that a send's attachments still have their bytes
  moves out of `AttachmentService.getMany`, whose callers need not read the object store, into the
  use case that binds them. The rule stays a pure function in the attachment model, composed like
  `ensureAllLive`. Rejected: a second `getMany` or a flag (a new name where one function and a
  caller's choice do); a new `attachment-ensure.service` (no variation to inject; the module's one
  caller would see it come back, the deletion test); keeping the check in `getMany` (every reader
  would pay a store read per file and be refused over bytes it does not need).

## Steps

#### S1 — A pure bytes check, composed by the send

- **Delivers:** `attachment.model.ts` exports `ensureAllStored(ids, stored)`, over a private
  `isStoredIn(stored)`, built like `ensureAllLive`
  (`flow(Arr.filter(<predicate>), ensureAllFound(ids))`), so the error names each lost id once, in
  the order asked; `AttachmentService.getMany` is back to its live check alone; the send reads the
  ids whose bytes the store holds and composes the model's check before its first write.
- **Goal:** the refusal of PR #22 keeps its behaviour (a send naming an attachment whose bytes are
  gone fails `AttachmentNotFoundError` naming it, before any write) while a reader of
  `getMany` no longer reads the object store; the rule is one pure function tested on values.
- **Blocked by:** none.
- **Files:**
  - `application/chat/domain/attachment.model.ts` — `ensureAllStored`, beside `ensureAllLive`,
    with its TSDoc; `isStoredIn` and `ensureAllFound` stay private.
  - `application/chat/services/attachment.service.ts` — remove `ensureAllStored` and its pipe step
    from `getMany`; drop what becomes unused (`Option`, `Struct`, `AttachmentNotFoundError` imports
    if nothing else reads them).
  - `application/use-cases/chat/send-message.use-case.ts` — after `getMany`, read the stored ids
    through `files.url` over the requested attachments (only the live ones `getMany` returns,
    concurrently, the wire caps them at `limits.attachment.maxFiles`), then `ensureAllStored`
    from the chat entry; one `yield*` per statement, its value named.
  - `application/chat/index.ts` — export the new function if the use case reaches the model
    through the entry.
  - Tests: `application/chat/__tests__/domain/attachment.model.test.ts` (the new function on
    values: all stored, one lost, two asked ids with a repeat, order asked); the service case of
    PR #22 (`getMany` of an attachment whose bytes are gone) is deleted with the check;
    `send` case (b) stays unchanged and must still pass.
  - `docs/knowledge/database.md` — the sentence on what the send refuses before its first write:
    the send, not `getMany`, refuses the lost bytes.
- **Introduces:** `ensureAllStored` (first consumer: the send), over the private `isStoredIn`.
  Removes later: none.
- **Size:** ~50 changed lines of code and tests.
- **Test first:** the model's unit test: `ensureAllStored` over a list of attachments and a list of
  stored ids fails naming the lost one — red before (the function does not exist), green after.
  Then the send case (b) must stay green through the move.
- **Verify:**
  - `make check` — green.
  - Probe: remove the `ensureAllStored` call from the send; case (b) and nothing else goes red;
    restore it.
  - The service case `getMany of an attachment whose bytes are gone` is deleted, and the probe
    above proves the send alone refuses lost bytes. A grep for `files.url` in the service misses
    `download`'s call, written over two lines, and would miss one put back into `getMany`.
- **Model:** `opus medium`.
- **Status:** done
- **Findings:** passes: Standards, Spec (rounds S1.1–S1.3); no simplify, no Design (one exported
  name, whose shape the user and the main session weighed against four alternatives before the
  step), no hunt. `make check` green (249 unit, 104 e2e).
  - Probe — removing the `ensureAllStored` call from the send turned send case (b) red and nothing
    else (`Tests 1 failed | 248 passed`).
  - Deviation — `isStoredIn` is private (S1.2): only `ensureAllStored` calls it.
  - Standards — accepted, fixed in S1.3 (judgement): the TSDoc of `ensureAllStored` was garbled;
    it is one plain sentence that defines `stored`.
  - Spec — none.

## Requirement coverage

No `feature.md`; the scope is the review's finding, mapped to S1.
