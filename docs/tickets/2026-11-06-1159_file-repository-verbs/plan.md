# File repository verbs — plan

> Ticket: `2026-11-06-1159_file-repository-verbs` · Source: the review of PR #23 and #24 (`send` checks the object store through `files.url`); no `feature.md` or `architecture.md`, the decisions below are the spec

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | `FileRepository` reads metadata (`selectOne`, `selectMany`) and downloads bytes (`download`); `send` asks the store through `selectMany` | done |
| S2 | `FileRepository.update` takes a list of ids; `send` binds the files in one call | todo |
| S3 | `AttachmentService` (plain records), `LiveAttachmentService` (live reads), `FileAttachmentService` (bytes) | todo |
| S4 | Roadmap: entry 24 done, entry 27 `rules-from-attachment-work` added | todo |

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
- **Decision (user, 2026-11-06):** the follow-ups ride on this branch as S2 to S4, not as separate
  PRs; each is its own commit. S3 supersedes the line of `layering.md` that bars a domain service
  from seeing another: `LiveAttachmentService` wraps `AttachmentService` and
  `FileAttachmentService` wraps `LiveAttachmentService`, the layers of one model, and the rule and
  its record in `decisions.md` say so.

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

#### S2 — Batch `update`

- **Delivers:** `FileRepository.update(set, { id })` takes one id or a list and untags them in one
  pass; the send binds its files with one call, not an `Effect.forEach` of single updates; the
  memory fake and the e2e take a list too.
- **Goal:** a set is written through one batch call, never one call per id
  (`layering.md`); behaviour of the bind is unchanged.
- **Blocked by:** S1.
- **Files:** `kernel/data/file/file.repository.ts`, `file.entity.ts` (the unused `_set` is named
  for what it writes), `kernel/data/__e2e__/file/file.repository.e2e.ts`,
  `kernel/data/__tests__/testing/file.test-fake.ts`, `send-message.use-case.ts`.
- **Introduces:** nothing new; `FileEntityWhere.id` already takes a list.
- **Size:** ~30 changed lines.
- **Test first:** the repository e2e: `update({ bound: true }, { id: [a, b] })` leaves both
  objects without the unbound tag — red while `update` takes one id.
- **Verify:** `make check` green.
- **Model:** `opus medium`.
- **Status:** todo
- **Findings:**

#### S3 — Three attachment services

- **Delivers:**
  - `AttachmentService`: plain records, no rule: `getOne`, `getMany` and `delete`, which removes
    the row, then its bytes.
  - `LiveAttachmentService` over it: the same reads, applying `ensureLive` / `ensureAllLive`.
  - `FileAttachmentService` over the live one: `upload`, `download` and `delete`, which checks the
    attachment live and unbound (`ensureUnbound`) and deletes through `AttachmentService`.
  - The send and the handlers read the service whose name says what they get.
  - `layering.md` states the layered services as the exception to "never another domain service";
    `decisions.md` records it, with the rejected single service and the pipe-outside option.
- **Goal:** a read's name says what it answers (`Live…` drops the expired); a file is stored and
  removed with its attachment; behaviour of the API and the send is unchanged.
- **Blocked by:** S2.
- **Files:** `application/chat/services/`, its mapper and index, `application/chat/__tests__/`,
  `application/use-cases/chat/send-message.use-case.ts` and its test layer, `apps/api/layer.ts`,
  `apps/api/attachment/attachment.handler.ts`, `.claude/rules/layering.md`,
  `docs/knowledge/decisions.md`, `docs/knowledge/database.md` (the two bullets naming
  `AttachmentService`).
- **Introduces:** `LiveAttachmentService` (first consumer: the send), `FileAttachmentService`
  (first consumer: the attachment handler).
- **Size:** ~250 changed lines of code and tests; docs apart.
- **Test first:** the plain `getOne` answers an expired attachment, `LiveAttachmentService.getOne`
  fails `AttachmentNotFoundError` on it — red before the split.
- **Verify:** `make check` green; the existing attachment cases pass over the new services.
- **Model:** `opus high`.
- **Status:** todo
- **Findings:**

#### S4 — Roadmap

- **Delivers:** entry 24 `attachment-storage-failures` marked done with the pull requests that
  closed it; entry 27 `rules-from-attachment-work` added from the scratchpad draft.
- **Goal:** the roadmap shows what landed and the lessons still to apply.
- **Blocked by:** S3.
- **Files:** `docs/knowledge/roadmap.md`.
- **Size:** docs only.
- **Test first:** `config only`; `make check` (the docs links) is the check.
- **Verify:** `make check` green.
- **Model:** `opus medium`.
- **Status:** todo
- **Findings:**

## Requirement coverage

No `feature.md`; the scope is the review's finding, mapped to S1.
