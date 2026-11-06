# File repository verbs — plan

> Ticket: `2026-11-06-1159_file-repository-verbs` · Source: the review of PR #23 and #24 (`send` checks the object store through `files.url`); no `feature.md` or `architecture.md`, the decisions below are the spec

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | `FileRepository` reads metadata (`selectOne`, `selectMany`) and downloads bytes (`download`); `send` asks the store through `selectMany` | done |

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
    a missing key (one `headObject`); `get` is renamed `download` and answers the head and the
    bytes from one `GetObject`; `exists` is removed (`head` answers the same, and its callers
    were `S3Bucket.url` and two cases of the bucket's e2e, which move to `head`); `url` only
    signs, sends no request and checks no key.
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
  - `kernel/data/file/file.entity.ts` — one `FileEntityWhere` (`id` one or many) for every verb;
    `FileEntityDeleteWhere` is gone.
  - `kernel/data/file/file.repository.ts`, `kernel/data/__e2e__/file/file.repository.e2e.ts`,
    `kernel/data/__tests__/testing/file.test-fake.ts` — the verbs, their e2e and the memory fake
    (same entities, shared matcher).
  - Callers of the old `selectOne` (bytes): the history read of
    `generate-assistant-message.use-case.ts`; `apps/e2e/api/chat.e2e.ts` only checks presence
    through `selectOne` and needed no edit.
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
- **Status:** done
- **Findings:** passes: Standards, Spec, Design, hunt (S1.1); Standards, hunt (S1.2); Standards
  fix (S1.3); no simplify. `make check` green (254 unit, 109 e2e).
  - Probe — `selectMany` answering every id turned the send's lost-bytes case and the repository
    e2e case red and nothing else (`Tests 1 failed | 253 passed` unit, `1 failed | 107 passed`
    e2e).
  - Deviation — `S3Bucket.url` only signs: building it on `head` would send two `HeadObject`
    requests per read. `ObjectHead.fileName` is an `Option` (the package takes the name as
    optional); a file without a name is a defect, since `insert` always writes it.
  - Design — accepted, fixed in S1.2: `download` sent a `HeadObject` then a `GetObject`; one
    `GetObject` answers both. Accepted, fixed in S1.2: one `FileEntityWhere` for every verb,
    like the attachments have. Rejected: `ensureAllStored` typed over `string` (widens the model
    for one line).
  - Standards — accepted, fixed in S1.2: a `throw` for a missing name became `Effect.die`; two
    successive `Effect.map` became one step; `naming.md` and `deep-modules.md` name
    `Downloaded<Name>Entity`. Accepted, fixed in S1.3: an `Option` goes through its own `.pipe`.
  - Spec — accepted, fixed in S1.2: `selectMany`'s order had no test.
  - Hunt — confirmed and fixed in S1.2: an empty file name read back as nameless (the pattern
    `(.+)` became `(.*)`). Rejected: a missing or malformed `Content-Disposition` is a defect (a
    stored value that no longer decodes, `effect-schema.md`; only a value written outside the
    app reaches it, confirmed by a run).

## Requirement coverage

No `feature.md`; the scope is the review's finding, mapped to S1.
