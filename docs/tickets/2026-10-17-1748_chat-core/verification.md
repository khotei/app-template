# Chat core — verification

> Ticket: `2026-10-17-1748_chat-core` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-10-20 — run 1

**Verdict:** pass

Branch `feat/chat-core` at `0b86161`, 48 commits over `origin/main` (`196c1ba`). `make check`:
Biome 156 files, `tsc -b` clean, vitest 26 files / 290 tests. The verifier ran `api` (`:3100`),
`worker` and `web` (`:3101`) on an isolated `STORE_PATH` and `QUEUE_SQLITE_PATH` under its
scratchpad; the repository's `.data` was not touched and every probe was deleted. The reports
below are condensed from the three agents' (verifier, Standards reviewer, Spec reviewer) output;
every path is theirs.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | `POST /users` → `201`, `set-cookie: user_secret=…; Max-Age=31536000; HttpOnly; SameSite=Lax`, `Secure` only under `NODE_ENV=production`; the store holds `credentials/secret/<sha256>` → user id, no plaintext secret (`grep -rl`) |
| R2 | pass | a second `POST /users` with the cookie → the same id, cookie re-set; two `users/*` keys after three requests from two visitors |
| R3 | pass | `GET /chats` without the cookie → `401 UserUnknownError`; `GET /health` → `200` |
| R4 | pass | under another user's cookie: chat, message, attachment, `PATCH` → `404` with the `*NotFoundError` tag |
| R5 | pass | `POST /chats` → `{id: <uuid v7>, title: null, createdAt, updatedAt}` |
| R6 | pass | `GET /chats`: the chat with a send first, `title: null`, `activeMessage: {id, stage: "queued"}`, no `messages` |
| R7 | pass | `GET /chats/:id`: `messages[]` in order, `attachments[]` with metadata on the user message, `activeMessage` |
| R8 | pass | `"  "` → `400 path ["title"] "at least 1"`; 121 chars → `400 "at most 120"`; `" Trip "` → `200 title "Trip"`, `updatedAt` moved |
| R9 | pass | `DELETE` while `generating` → `204`, then `GET` → `404`, zero chat and message keys, the queue row `completed, attempts: 1`; "deleted before the take" is a Seam 6 test |
| R10 | pass | `activeMessage` present or `null` on the wire; the stored `chats/<id>` has no such field; Seam 2 test |
| R11 | pass | a send with two attachments → `202 {userMessage: completed, assistantMessage: queued}`, both bound, `updatedAt` moved |
| R12 | pass | a second send → `409 ChatBusyError {id}` |
| R13 | pass | a bound attachment → `409 AttachmentBoundError`; an unknown one → `404 AttachmentNotFoundError` |
| R14 | pass | `GET …/messages/:id` while `queued`: `text: ""`; while `generating`: a growing `text` (R16) |
| R15 | pass* | the schema is a Seam 1 test; the acceptance grep for `'system'\|'tool'` finds one hit, `application/chat/chat-title.job.test.ts:243`, an assertion on a prompt role, not code |
| R16 | pass | polled every 300 ms: `queued` → `generating` 7 → 28 → 58 → 73 chars → `completed` 106; the message's `updatedAt` on every snapshot, the chat's only at `completed` |
| R17 | pass (tests) | Seam 6: every completed message in order, a file part per attachment, text alone when an attachment lost its bytes |
| R18 | pass (tests) | Seam 6: retries from `preparing` and fails with the cause on the last reply; fails a reply the last attempt left active without calling the model; Seam 7: a failed reply carries reason and message, never the cause |
| R19 | pass | three sends with the worker stopped stay `queued`; after `worker started` all complete within ~2–4 s, rows `attempts: 1` |
| R20 | pass | two PNGs → `201` with `messageId: null`, sizes 1048576 and 2048 |
| R21 | pass | 11 MiB → `413`; `.zip` → `415`; six files → `400 "at most 5 files"`; a field → `400 path ["files", 0]`; an empty multipart → `400 "at least 1 file"`; no new keys |
| R22 | pass | metadata; download `Content-Type: image/png`, `inline; filename="b.png"`, bytes equal by `cmp`; a Cyrillic name → ASCII fallback plus `filename*=UTF-8''…` |
| R23 | pass | a bound attachment → `409`; an unbound one → `204`, then `404` |
| R24 | pass | one `chat-title` row per chat, `id = chatId`, payload `{chatId, messageId}`; a second send adds no row |
| R25 | pass | chats titled `"Stub chat title"`; a renamed chat keeps `Trip` (`chat title skipped: already titled`); an attachment-only send logs `nothing to title`, `attempts "1/5"`, `title: null`, row `completed` |
| R26 | pass | `http-api` imports only `effect*`, `@app-template/domain/*`, `#http-api/*`; a probe import of `infrastructure` fails `noRestrictedImports`; the spec carries the cookie scheme, `401` on `chats`/`attachments`, `400 RequestInvalidError`, multipart and octet-stream |
| R27 | pass | `GET /openapi.json` → `openapi 3.1.0`; `GET /docs` → `200 text/html` |
| R28 | pass | `{"title": 123}` → `400 "Expected string"`; 20 001 chars plus a bad `attachmentIds[2]` → both issues; SIGTERM → `api stopped`, exit |
| R29 | pass | Seam 7: `ChatNotFoundError`, `HttpClientError` on a stopped server, six files → `RequestInvalidError` through `ApiClient`; a status table without `SchemaError` → `TS2741`; bundle 57 719 B gzip |
| R30 | pass | client imports only `effect`, `@app-template/http-api`, `@app-template/ui`; a probe import of `config` under `features/` fails lint; headless Chrome shows `API status: ok` and the unreachable message |
| R31 | pass | both `.job.ts` export `enqueue` and `static worker`; `apps/worker/src` is 31 lines of layer assembly |
| R32 | pass | `chat.queue.ts` schemas `{chatId, messageId}` |
| R33 | pass | `.env` moved away → 290 tests pass; no `STORE_PATH` → `ConfigError … ["STORE_PATH"]`, exit 1; `.data` is ignored; the store layout is `users/…`, `chats/<id>/messages`, `attachments/<id>/bytes` |
| R34 | pass* | SIGTERM on the worker at `generating` 7 → `worker stopped`, the message stays `generating`, the chat busy; a restart completes it, row `attempts: 1`; the `--hot` reload of `api` not exercised |
| R35 | pass | `Date.now`, `new Date(`, `randomUUID` absent from `domain`; tests on `TestCrypto` |
| R36 | pass | `packages/{db,storage}`, `outbox.repository.ts` gone; `example` outside `docs/tickets` is prose and `.env.example` |
| R37 | pass* | `effect.md` is 23 lines but split into five files of ≤ 69 lines; recorded in S17, not in `feature.md` (Spec finding) |
| R38 | pass | roadmap row 3 links the ticket; `Where things live` and `Add a new entity` are on `chat` |

**Not verifiable:** R34's `--hot` acceptance (two edits, one listener, one `api stopped` each)
needs an edit of a tracked file, which the verifier may not make; S13's findings stand for it.
R17 and R18 at runtime: the stub neither fails nor exposes the prompt; Seam 6 covers both.

**Deviations that changed a requirement** (all recorded as *Amended in S…* in `plan.md`): R8,
R10, R16, R17, R18/R19 (D23), R21, R22, R24, R25, R26–R29, R30, R33, R34 (D30), R35, R37.

**Beyond feature.md on the branch:** the README rewrite; `/explain` and `explainer`
(`85709c3`); the `2026-10-19-1448_aws-local` ticket artifacts (`11da5c5`); `sdd.md`, the
`/ticket-implement` skill and the `implementer` agent (`0653d14`, `4bd5c8f`); `comments.md`,
`reviewer.md`; an `effect` patch added and removed; `packages/testing`,
`domain/shared/guard.ts`, `use-cases.md`; the S18 style pass; `772177e` (roadmap).

> Environment: the local `.env` lacks `STORE_PATH` (present in `.env.example`), so `make dev-api`
> and `make dev-worker` fail with `ConfigError` as R33 asks; add the variable.

### Review

#### Standards

The branch is disciplined: `as const satisfies` tables, proof values, `Effect.fn` spans, ports
without an error channel. The violations are mostly local and mechanical; one is systemic.

Violations, by severity:

1. **Hard, `effect-style.md › Control flow` "one `yield*` per statement":** 17 sites outside the
   tests remain after `133da4a` claimed the rule, e.g. `return toChat(yield* chats.create(user.id))`:
   `application/chat/chat.service.ts:118,136,206,221`, `application/chat/assistant-message.job.ts:171`,
   `application/attachment/attachment.service.ts:94`, `application/user/user.service.ts:49`,
   `infrastructure/kv/kv-collection.ts:56`, `infrastructure/chat/message.repository.ts:35,37`,
   `apps/api/src/chat/chat.handler.ts:52,59,66,73,98`,
   `apps/api/src/attachment/attachment.handler.ts:62,115`,
   `application/testing/chat.harness.ts:90–96`.
2. **Hard, `effect-schema.md` "`Schema.Class` is `Data`: never field by field":**
   `domain/user/user.model.test.ts:28` (`{ ...decoded.value }`),
   `domain/chat/chat.service.test.ts:301` (`({ ...error })`), a spread of a class instance for
   `deepStrictEqual`.
3. **Hard, `comments.md › Gate A`:** `application/chat/delete-chat.use-case.ts:22–23` retells
   `use-cases.md › Use cases`; `apps/api/src/layer.ts:31–34` retells the `Layer` type.
4. **Hard, `commits.md`:** `0b86161` subject is 51 characters; `85709c3` and `772177e` carry no
   `Refs:` (no ticket exists for them, a judgement call).
5. *Judgement, `claude-md.md` "no ticket numbers" in rules:* `.claude/rules/sdd.md:34–37` uses
   `S11.1`/`S11.2` as an example, one ticket's step id in a repository rule.
6. *Judgement, `effect-style.md` "Prefer `Arr`":* `apps/api/src/shared/security.ts:33–34` native
   `.map`; `infrastructure/chat/chat.llm.ts:33` a spread instead of `Arr.appendAll`.
7. *Judgement, `http-api/CLAUDE.md › Layout`:* `AttachmentTooLargeError` and
   `AttachmentTypeUnsupportedError` in `http-api/shared/errors.ts:16–26` serve one group, while
   the same file asks for `httpApiStatus` errors in `shared/errors.ts`; the rule argues with
   itself.
8. *Judgement, `use-cases.md` "one writer per aggregate":* the jobs write the ports directly,
   `assistant-message.job.ts:108,131,136`, `chat-title.job.ts:56`; the same folder, so formally
   their own aggregate, but the single writer is spread over the service, `touchChat` and two jobs.
9. *Judgement, `naming.md › Symbols` verb first:* `roleOf`, `withAttachments`, `credentialKey`,
   `bytesKey`, `userChatsKey`, `chatMessagesKey`, `apiClientWithJar`.

Smells (Fowler): **Duplicated Code**, `AssistantMessageJob.layer` ≡ `ChatTitleJob.layer`
(`assistant-message.job.ts:228–242`, `chat-title.job.ts:66–80`), and `const user = yield*
CurrentUser` eleven times in the handlers. **Shotgun Surgery**, the KV layer list in
`apps/api/src/layer.ts:44–50` and `apps/worker/src/layer.ts:13`. **Data Clumps**, `ChatFile`
(`chat.llm.ts:7`) and `AttachmentDownload` (`attachment.service.ts:26`) are one `{ attachment,
bytes }`. **Speculative Generality**, `limits.chat` (`http-api/shared/limits.ts:18`) unread,
`send` (`packages/queue/queue.ts:157`) used only by its test, `AttemptInfo.maxAttempts` only
logged. **Middle Man**, `ChatService.touch` (`chat.service.ts:230–232`) provides a repository the
service already holds. **Feature Envy**, `chat.handler.ts:16` imports `toAttachment` from the
neighbouring handler; projections belong in `apps/api/src/shared/`.

The reviewer's first three simplifications: one `producer(definition, toJob)` in
`packages/queue` beside `worker`, replacing both job layers; a `RepositoriesKv =
Layer.mergeAll(…)` in `infrastructure` that both `layer.ts` provide; remove `limits.chat` and
`send`, merge `ChatFile` into `AttachmentDownload`, let `touchChat` take the port as a parameter.

#### Spec

R1–R38 are implemented and tested at Seams 1–7; the code contradicts no decision D1–D33 (D2,
D3, D23, D25, D26, D29/D31, D5/D8/D10 checked line by line). The findings concern the branch's
borders and the record of deviations, not behaviour.

1. **Scope creep, hard (`pull-requests.md` "one ticket = one branch = one PR"):** `/explain` and
   `explainer` (`85709c3`); the `2026-10-19-1448_aws-local` artifacts (`11da5c5`, 762 lines, against
   `sdd.md` "a ticket that has not started exists only as an entry in roadmap.md"); the SDD rule
   and skill edits (`0653d14`, `4bd5c8f`, a judgement call: the user's OK is not visible in the
   diff). All of it becomes part of the one squashed `chat-core` commit.
2. **R37, judgement:** the spec asks for one `effect.md` ≤ ~80 lines; the branch has five files,
   218 lines. Recorded in `plan.md:1472` but not amended in `feature.md`, against `sdd.md`
   "`feature.md` when it changes what a requirement asks".
3. **Architecture › Structure, low:** "each `*.service.ts` has its `*.test.ts` beside it";
   `domain/user/user.service.test.ts` is missing (`isOwnedBy`, `buildUser` covered only through
   Seams 5 and 7).
4. *Worth a look, all judgement calls:* **R4**, a message of another user answers
   `ChatNotFoundError`, not `MessageNotFoundError` (`chat.service.ts:175` checks the chat first;
   the status matches, the tag does not; the wording allows both). **R15**, `error` is
   `Schema.Option(MessageFailure)` without a refinement (`chat.model.ts:55`); the invariant holds
   only through the transitions. **R11**, a crash between `addUserMessage` and
   `addAssistantMessage` (`send-message.use-case.ts:59–62`) leaves a completed message without a
   reply or a job; `architecture.md:865` Risks name only the enqueue window. **R3** contradicts
   itself: "any other endpoint → 401" while `POST /users` carries no `Auth` by R26/D6. **R20**
   says "10 MB" where `limits.ts:4` says `10 MiB` and Risks say MiB.

Summary: Standards 4 hard, 5 judgement, 6 smells, the worst the 17 nested `yield*`; Spec 1 hard
(branch borders), 2 judgement, 5 spec wording notes, the worst the un-amended R37.

### Simplifications

*Outcome:* 1, 3 and 4 landed as step S19 (`f3f5ea4`, `6a21e14`; D34 for the grouping by
aggregate); 2 was rejected by the user (two similar job layers read better than one more helper
in `packages/queue`); 5–7 are open.

1. **Finish the one-`yield*` pass:** the 17 sites above; `effect-style.md` already asks for it.
   One `:recycle:` step, no decision.
2. **`producer(definition, toJob)` in `packages/queue`** replacing both job `layer`s: ~30 lines
   less and one `orDie` policy. One step; `D…` for the helper's home.
3. **`RepositoriesKv` in `infrastructure`**, provided by both `apps/*/layer.ts`: a new entity
   edits one file. One step.
4. **Dead code and clumps:** drop `limits.chat` and `queue.send`, merge `ChatFile` into
   `AttachmentDownload`, pass the port to `touchChat`, move `toAttachment` to
   `apps/api/src/shared/`. One step.
5. **Mechanical fixes:** the two class spreads in tests, the two retelling comments, the `Arr`
   sites, `user.service.test.ts` at Seam 1. One step with 4.
6. **Spec record:** amend R37 (five rule files), R3 (`POST /users` is public), R4 (which `404`),
   R20 (MiB) in `feature.md`; add the insert window to `architecture.md › Risks`. Docs only.
7. **Branch borders:** the PR body names, under `Decision:`, that the toolkit commits
   (`/explain`, the rounds rule, `aws-local`) ride on this branch, or they move to their own
   branches before the merge. The user's call.

### Lessons

Mistakes that recurred in two or more steps. Each proposes one change, applied only on the
user's OK.

| Lesson | Evidence | Proposed change | Applied |
|---|---|---|---|
| The plan named files, APIs and shapes before the Effect facts were known, so nearly every step from S3 to S13 carries an *Amended in* note | `plan.md`: ~35 *Amended in S…* notes; S6, S8a, S9, S10b, S12, S13 each re-cut their step | `/ticket-plan`: a step names a file, an API or a signature only after `researcher` confirmed it in `repos/effect`; otherwise it names the goal and the Seam and leaves the names to the implementer | no |
| A rule line landed without a grep for what it forbids, so the rule contradicted code in the same commit | S18.1 review (the `Signatures` rule vs `Shape` methods); `133da4a` claimed one `yield*` per statement with 17 sites left | `implementer.md`: a rule line you add or sharpen comes with a `git grep` for what it forbids, and the diff fixes every hit or the rule names the exception | no |
| Skills say `main`, but the branch has only `origin/main`, so each run began with an "ambiguous argument" and a manual `merge-base` | `/explain` (fixed in its SKILL.md), `/ticket-verify` step 1, `code-review` step 1 | `ticket-verify/SKILL.md`: the fixed point is `git merge-base HEAD origin/main`; the same line in the code-review override table of `/ticket-implement` | no |
| Lines over 100 columns in new docs were caught by hand each time | the `/explain` files, the README, `plan.md` S18, `verification.md` | a `make lint-docs` target (`awk 'length > 100'` over `*.md` outside tables and `repos/`) wired into `make check`, so the hook catches it | no |
| Toolkit changes and another ticket's artifacts rode on the ticket branch | `85709c3`, `11da5c5`, `0653d14`, `4bd5c8f` (Spec finding 1) | `sdd.md › Gates`: a toolkit change (skill, agent, rule) or another ticket's artifact goes on its own `chore/` or `docs/` branch, never on a ticket branch, unless the user says otherwise in the session | no |
| A style pass ran outside the plan twice before it became a step | `133da4a`, `51d0f00` (no step), then S18 with rounds | already applied: `sdd.md › Gates` rounds (`4bd5c8f`); a style pass is a plan step with a rule line per habit | yes |
