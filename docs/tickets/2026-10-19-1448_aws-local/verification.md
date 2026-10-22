# AWS local — verification

> Ticket: `2026-10-19-1448_aws-local` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-10-22 — run 1

**Verdict:** fail (R17, the bucket direction only)

Branch `feat/aws-local` at `0d95984`, 51 commits over `origin/main` (`366b604`). `make check`:
Biome, `tsc -b` clean, vitest 30 files / 345 tests. The verifier ran the stack in a scratch copy
of the tree (api `:3090`, web `:3091`, MiniStack `:4656`); the main tree's `.data` was not
touched, and every probe was removed. The reports below are condensed from the three agents'
(verifier, Standards reviewer, Spec reviewer) output; every path is theirs.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | a 10,000,000-byte PNG through the api: same sha256 (`730f8d32…`) on S3, ETag `-2` (two parts); a spy on the api's multipart stream saw 161 chunks of at most 64 KiB, the adapter holds one 5 MiB part at most |
| R2 | pass | 11 MB → `413 AttachmentTooLargeError`; a 10 MB upload cut after 8 MiB leaves no object, no open multipart upload, the record count unchanged; store tests "a stream failing after the first part…", "an insert interrupted after the first part…" |
| R3 | pass | `302`, `Location` on `localhost:4656`, `X-Amz-Expires=300`; fetching it → `200 image/png`, `inline; filename*=UTF-8''ten.png`, identical bytes; the same URL 5 min 8 s later → `403 Request has expired` |
| R4 | pass | another user's cookie → `404 AttachmentNotFoundError`, no `Location`; an unknown id → `404` |
| R5 | pass | deleting a chat with two attachments and an unbound attachment (`204`) leaves none of the three objects; a later download → `404` |
| R6 | pass | a scratch worker on the real layers (S3 store, SQS queue, file store) with a recording model: the prompt holds a `file` part, `image/png`, 45 bytes, the upload's sha256; the reply `completed` |
| R7 | pass | tests: unbound at 24 h is not found from `get`, `download`, `delete`, `findBindable`, nothing deleted; found at 23 h 59 min; bound at 48 h found. Live: a single-put object tagged `unbound=true`, `[]` after the send; lifecycle rules read back as the inventory states |
| R8 | pass | a live send puts one job on `app-template-local-assistant-message` and `-chat-title`; queue suite "consumes a sent message as its first attempt" |
| R9 | pass | a duplicate on each queue: `assistant reply skipped: already settled`, `chat title skipped: already titled`; message and chat JSON byte-identical |
| R10 | pass | "keeps a job from a second worker while its handler runs past the visibility timeout" |
| R11 | pass | "counts every failed attempt, waits each retry delay…": gaps ≥ 2 s and < 3.5 s, then ≥ 4 s |
| R12 | pass | attempts 1–3, `isLastAttempt` on the last only; a stopped worker's job returns as the next attempt in < 1 s; a settle keeps its delay; a reply interrupted on its last attempt ends `failed` (`assistant-message.job.test.ts:365`). Soft spot: "handler interrupts itself" (`queue.test.ts:284`) checks the attempt, not the timing |
| R13 | pass | dead-lettered after 3 attempts; the handler ran 3 times |
| R14 | pass | "dead-letters a body that does not decode without calling the handler" |
| R15 | pass | `packages/aws/resources.ts`: one bucket, two queues (3 and 5 attempts); live readback: each queue redrives to its `-dlq` with `maxReceiveCount` 3 and 5, both lifecycle rules |
| R16 | pass | clean state: first `make up` all `created`, second `3 unchanged` from Pulumi and all five resources `unchanged`; `make down` leaves no container and state survives it |
| R17 | **fail** | queues pass both ways (`queue 'orphan-queue' has no definition`, `queue 'chat-titles' is not in the inventory`); an adapter naming a missing bucket fails typecheck (`TS2339 'uploads'`); but a `reports` bucket added to the inventory and read by no code passes lint, `tsc -b`, the agreement test and the provision tests |
| R18 | pass | `make dev`: upload, send, `completed` in ~2 s, title `Stub chat title`; no `*sqlite*` in `.data/`, the largest store file 268 bytes |
| R20 | pass | no `process.env` or `Bun.env` read outside `packages/config`; resource names only in `packages/aws/resources.ts`; `.env.example` lists `AWS_REGION`, `AWS_ENDPOINT_URL`, `STAGE` and the two keys |
| R21 | pass (local) | the `AttachmentStore` suite on KV and S3, the queue suite on MiniStack; `make test` without `.env`: 345/345 |
| R22 | pass | `docs/knowledge/aws.md` covers start, reset, the inventory and adding a resource; `architecture.md:39` links it |

R19 was dropped with S3.

**Not verifiable:** CI on `0d95984` (`origin/feat/aws-local` is at S2's `071abfd`); lifecycle
deletion and the tag on a multipart object (MiniStack runs neither; ticket 9 checks both on AWS);
the download in a real browser (`curl` only).

**Main tree:** `make up` fails with `QueueNameExists`: its MiniStack state still has
`assistant-message` at `maxReceiveCount` 4, from before S5d. One `make reset` fixes it (it drops
the local `.data`). Its `.env` still carries the unread `QUEUE_SQLITE_PATH`.

### Review

#### Standards

No layer-boundary breach. Hard violations, none affecting behaviour:

1. `packages/queue/queue.transport.ts`: the `.transport` suffix is not in `naming.md › Files`.
2. `infrastructure/shared/resources.test.ts` mirrors no `resources.ts`; `:14-17` joins predicates
   with `&&` (`effect-style.md › Control flow` asks for `Predicate.and`).
3. `queue.transport.ts:116,131` `send(queue, body, attributes)`, `extend(queue, handle,
   visibility)` and `queue.ts:100` `settle(received, info, exit)`: three positional parameters
   not led by branded ids (`effect-style.md › Signatures`).
4. `queue.ts:166-172`: the `consume` doc runs five sentences (`comments.md › Gate B`).

Judgement calls: the MiniStack image pinned twice (`deployment/local/ministack.ts:10`,
`packages/testing/ministack.ts:7`); `deployment/local/provision.ts:8` copies
`infrastructure/shared/aws.client.ts:7-23`; `QueueClientMiniStack` defined in
`queue.test.ts:92` and `application/testing/queue.harness.ts:10`; `queue.harness.ts` exports a
layer, not `make<Entity>Harness`; `buildStage` is random, `build` is for pure functions;
`buildResourceName(stage, resource)` takes two plain strings; `AttachmentKvS3` mixes the
`<Entity>Kv` bundle name with S3; `static readonly handle` widens the job classes for tests;
`QueueClient.layer` is a function outside `{ make }`; `deployment/local/ministack.ts:17-18`
throws at top level; the api handler tests keep `{ timeout: '60 seconds' }` with no container.

#### Spec

No behaviour violates a requirement.

- **Acceptance rows that the tests do not reach:** R6 (the job tests use `AttachmentStoreKv`),
  R1 (no memory measure), R3 (the api harness redirects to a `data:` URL). The verifier closed
  all three by hand above.
- **R15:** the inventory holds no dead-letter entries or rule shapes; they live in
  `packages/aws/provision.ts:47-68`, so ticket 9's Pulumi program rebuilds them. **R17:** the
  bucket is checked only for its lifetime (the failure above).
- **R16:** `provision.ts:88` rewrites the lifecycle configuration every run, while a drifted
  queue fails `make up`.
- **Scope:** the worktree tooling (`.claude/hooks/make-check.sh`, `ticket-implement/SKILL.md`,
  `39fb9ea`, `03895cd`, `5d87d25`) and one MiniStack per worktree (S9) sit beyond
  `feature.md › Scope`.
- **Stale text:**
  - `architecture.md:9` says "four-call"; D1 and D2 still describe the memory transport.
  - "every queue test on MiniStack" (`architecture.md:11-12`, `feature.md:42-43`, R21) predates
    `recordQueue()`.
  - D1's S5c note "`layerSqs` folds into `QueueClientSqs`" is ambiguous beside
    `QueueTransport.layerSqs`.
  - D7 and D9 still say "*Your OK pending (round 3, C2/C1)*".
  - `feature.md:39,68` promise collection of unbound attachments, which S8 gave to ticket 4.
  - R12's acceptance cites `chat-core` R18–R19 "as amended in S8b" (now S5d).
  - R20's acceptance `git grep` matches `repos/**` and ticket docs.
  - `plan.md` S7 findings describe the second tag call.

### Simplifications

1. One AWS client builder in `@app-template/aws`, shared by `infrastructure/shared/aws.client.ts`
   and `deployment/local/provision.ts`.
2. One MiniStack image constant; the "bump both together" comment goes.
3. One `QueueClientMiniStack(stage, options)` in `@app-template/queue/testing`, replacing the
   copies in `queue.test.ts` and `application/testing/queue.harness.ts`.
4. A branded `Stage`, and an object parameter for `buildResourceName`.
5. Drop the 60-second timeouts from the api handler tests; settle `queue.transport.ts`'s suffix.

**Follow-up (user's choice):** R17 closes with a bucket check rather than a narrower R17 (S11,
with the stale ticket text); the Standards fixes and simplifications 2, 3 and 5 are S12;
simplifications 1 and 4 wait for ticket 9. D7's and D9's pending-OK markers were cleared.

### Lessons

| Lesson | Evidence | Proposed change | Applied |
|---|---|---|---|
| A change left text describing the old behaviour in comments, `README.md`, `docs/knowledge` or the ticket's own docs | S5d.1 (`README.md`, a `queue.ts` comment), S7b.1 (`aws.md` MiniStack list), S8 (a comments-only round), this run's Spec list (eight stale passages) | `implementer.md`: before the report, `git grep` every removed or renamed identifier and every changed number across code, `README.md`, `docs/knowledge` and the ticket folder, and list each hit fixed or left | yes |
| Ticket docs were amended by appending notes, so a decision's body kept the superseded design and readers met two truths | D1, D2 (memory transport), D9 (second tag), `chat-core` D23 | `ticket-implement/SKILL.md` step 5: an amendment also edits the decision's body where it now misleads, and the note keeps only the rejected alternative | yes |
| A chained cleanup ran after a failed git command and removed a worktree; `index.lock` broke commits twice while another session ran git | S8 cleanup, S5c and S7b commits | `ticket-implement/SKILL.md › Parallel steps`: remove a worktree only after `git log` shows its rounds on the ticket branch and its status is clean, never in the same chained command as the commit | yes |
