# File repository verbs — plan

> Ticket: `2026-11-06-1159_file-repository-verbs` · Source: the review of PR #23 and #24 (`send` checks the object store through `files.url`); no `feature.md` or `architecture.md`, the decisions below are the spec

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | `FileRepository` reads metadata (`selectOne`, `selectMany`) and downloads bytes (`download`); `send` asks the store through `selectMany` | todo |

## How to run this plan

- Branch `refactor/file-repository-verbs`; one commit when the step is ready, then a PR the user
  merges.
- **Decision (user, 2026-11-06):** the send must not deal with the object store one id at a time,
  and must not use `url` as an existence check. The repository names its verbs like every other
  repository, and a file is one entity: `FileEntity` gains `url` (a presigned GET, valid for
  `urlLifetime`), built inside each read from the object's metadata; `selectOne` and `selectMany`
  answer it, and `download` answers `DownloadedFileEntity`, the entity extended with the file's
  bytes in `blob`. There is no separate verb for a URL. Rejected: `selectUrl` and `selectUrls`
  (the field replaces them); an `exists` verb (`selectMany` answers presence and costs the same
  `headObject`); a `getStoredIds` method on `AttachmentService` (the read is the repository's, the
  rule is the model's `ensureAllStored`). Overrides the line of `deep-modules.md` that gives a
  store's differently shaped answer (a signed URL) a verb of its own: that line, and the record in
  `docs/knowledge/decisions.md` it rests on, are rewritten in this step.
- The rule stays: `ensureAllStored(ids, stored)` in the attachment model, composed by the send.

## Steps

#### S1 — Metadata reads and `download`

- **Delivers:**
  - `S3Bucket` gets `head(key)`: the object's `contentType` and `fileName` as an `Option`, none for
    a missing key (one `headObject`); `get` is renamed `download`; `exists` is removed (`head`
    answers the same, and its only callers were `S3Bucket.url`, which builds on `head`, and two
    cases of the bucket's e2e, which move to `head`).
  - `FileEntity` (`kernel/data/file/file.entity.ts`) gains `url`; `FileEntityInsert` takes the
    entity without it (`Types.Simplify<Omit<FileEntity, 'url'>>`), the write has no URL.
    `DownloadedFileEntity` is `FileEntity` plus `blob: Uint8Array`.
  - `FileRepository.selectOne(where)` answers `Option<FileEntity>` through `head`;
    `selectMany({ id: ids })` answers the found `FileEntity`s in the order asked, concurrently;
    `download(where)` answers `Option<DownloadedFileEntity>` (the former `selectOne` read the bytes
    alone); the verb `url` is removed, its callers read `entity.url`.
  - `AttachmentService.download` reads the file through `selectOne` and answers its `url`, a
    missing file still `AttachmentNotFoundError` naming the id.
  - `generate-assistant-message`'s byte read reads `blob`.
  - `send` reads the stored ids with `files.selectMany` over the live attachments' ids, in place
    of its `Effect.filter` over `files.url`, then runs `ensureAllStored`.
- **Goal:** presence of files is asked of the repository as data, one verb for one and for many;
  `url` is no longer used as an existence check; behaviour of the send, `getOne`, `download` and
  upload is unchanged.
- **Blocked by:** none.
- **Files:**
  - `packages/s3/bucket.ts`, `packages/s3/__e2e__/bucket.e2e.ts` — `head`, `get` → `download`.
  - `kernel/data/file/file.entity.ts` — `FileEntityManyWhere` beside `FileEntityDeleteWhere` (may
    be one shared `where` type if it reads better).
  - `kernel/data/file/file.repository.ts`, `kernel/data/__e2e__/file/file.repository.e2e.ts`,
    `kernel/data/__tests__/testing/file.test-fake.ts` — the verbs, their e2e and the memory fake
    (same entities, shared matcher).
  - Callers of the old `selectOne` (bytes): `apps/e2e/api/chat.e2e.ts` (the byte read becomes
    `download`; the presence check at the end becomes `selectOne`), and any use case that reads
    bytes; find the rest by grep.
  - `application/use-cases/chat/send-message.use-case.ts` — the stored ids through `selectMany`.
  - `docs/knowledge/database.md` (and any other page naming the file verbs) — the verbs.
- **Introduces:** `S3Bucket.head` (first consumer: `FileRepository.selectOne`), `selectMany` (first
  consumer: the send), `FileEntity.url` (first consumer: `AttachmentService.download`),
  `DownloadedFileEntity` (first consumer: the history read). Removes: `FileRepository.url`,
  `S3Bucket.exists`.
- **Size:** ~120 changed lines of code and tests.
- **Test first:** the repository e2e: `selectMany` of one stored, one missing id answers only the
  stored entity with its `mediaType` and `fileName`; `selectOne` of a missing id is none — red
  before (the verbs answer other things), green after. The send case for lost bytes stays green.
- **Verify:**
  - `make check` — green.
  - Probe: make `selectMany` answer every id; the repository case and the send's lost-bytes case
    go red and nothing else; restore it.
- **Model:** `opus high`.
- **Status:** todo
- **Findings:** written when the step is reviewed.

## Requirement coverage

No `feature.md`; the scope is the review's finding, mapped to S1.
