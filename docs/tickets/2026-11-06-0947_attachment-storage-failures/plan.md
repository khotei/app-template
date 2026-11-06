# Attachment storage failures — plan

> Ticket: `2026-11-06-0947_attachment-storage-failures` · Source: [roadmap entry 24](../../knowledge/roadmap.md#24-attachment-storage-failures); no `feature.md` or `architecture.md`, the entry and the options below are the spec

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | a missing file is logged where the reply reads history and refused where a send binds it | todo |

## How to run this plan

- Branch `fix/attachment-storage-failures`; the work stays uncommitted for the user's review.
- The send's rollback (entry 24's third gap) is left to roadmap entry 22 `jobs`: an untagged byte
  after a rollback costs storage, not behaviour, and a re-tag needs a new store verb.

## Steps

#### S1 — A missing file is never silent

- **Delivers:** a reply whose history holds an attachment the object store no longer has logs a
  warning with the attachment's and the chat's ids and answers without that file; a send that
  names an attachment whose bytes are gone from the store fails with `AttachmentNotFoundError`
  instead of binding a row to no bytes.
- **Goal:** entry 24's first two gaps close with no new error, no new `FileRepository` verb and no
  change to the S3 client (`deep-modules.md`: an object store's write never dies on a missing
  object).
- **Blocked by:** none.
- **Files:**
  - `application/use-cases/chat/generate-assistant-message.use-case.ts` — `readBytes`: the `None`
    of `files.selectOne` logs through `Effect.logWarning` annotated with `attachmentId` and
    `chatId` (`effect-style.md`), and still drops the file from the input.
  - `application/use-cases/chat/send-message.use-case.ts` — before the binds, `files.url({ id })`
    of each requested attachment; a `None` collects its id into
    `AttachmentNotFoundError({ ids })`, which `send` already declares. `url` already answers `None`
    for a missing id in `FileRepositoryTest`.
  - Their unit tests under `application/use-cases/__tests__/chat/`.
- **Introduces:** none. Removes later: none.
- **Size:** ~50 changed lines of code and tests.
- **Test first:** the use cases' unit tests, at the fakes: (a) an attachment whose bytes were
  deleted from `FileRepositoryTest` before the reply gives a reply without the file and a warning
  log carrying both ids; (b) a send naming an attachment whose bytes were deleted fails with
  `AttachmentNotFoundError` holding its id and leaves no bound row. Both red today: (a) logs
  nothing, (b) succeeds.
- **Verify:**
  - `make check` — green; `make test-unit` shows the two new cases red before the code and green
    after.
  - `grep -n "getSomes" application/use-cases/chat/generate-assistant-message.use-case.ts` — the
    dropped `None` now passes a log first.
- **Model:** `opus medium`.
- **Status:** todo
- **Findings:** written when the step is reviewed.

## Requirement coverage

No `feature.md`; the roadmap entry's scope bullets map to S1 (history, bind) and to entry 22 (the
rollback).
