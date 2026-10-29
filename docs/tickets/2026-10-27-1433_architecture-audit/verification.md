# Architecture audit — verification

> Ticket: `2026-10-27-1433_architecture-audit` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-10-29 — run 1

**Verdict:** fail — every requirement passes, but one behaviour change that `feature.md › Out of
scope` forbids is unrecorded (Simplification 1). Recording it, or restoring the old answer, turns
the verdict to pass.

Base: the branch is stacked on the unmerged `feat/postgres-drizzle` (`2e90fb72b2`), so every check
compared against it (69 commits); `repos/` and `bun.lock` were read as vendored, not ticket code.
`make check` passed: lint, typecheck, migration-check, unit (21 files, 179 tests), e2e (17 files,
80 tests), bundle-check, ids, doc-names.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | `ls domain/*/*.port.ts`: assistant, attachment, chat, message, user ports, none holding a `Layer`; `infrastructure/` declares only `Db` and `Transaction` (`infrastructure/db/db.client.ts:28`, `:40`), no port |
| R2 | pass | no `application/*/*.service.ts`; `DateTime.now`/`Crypto.Crypto` only in the four domain services; the use cases' only repository writes are the chat's `updatedAt` (`send-message.use-case.ts:68`, `generate-assistant-message.use-case.ts:129`), one rule-free write each |
| R3 | pass | each of the four use cases imports a domain service plus `Transaction`, `QueueClient`, `Assistant` or `AttachmentBucket` |
| R4 | pass | `apps/api/chat/chat.handler.ts`: `create`, `list`, `get`, `rename` call `ChatService`, `getMessage` calls `MessageService`; no one-call use case |
| R5 | pass | `grep "messages\.(update\|insert)"` over `application/` and `apps/` outside the suites is empty; the reply use-case suite passes |
| R6 | pass | `apps/worker/chat/{assistant-message,chat-title}.handler.ts`; `find -name "*.job.ts"` is empty |
| R7 | pass | the unit case "the first send queues the reply and the title jobs…"; `application/e2e/chat/send-message.use-case.e2e.ts` refuses the title job's outbox row and finds no message, bind, chat change or outbox row |
| R8 | pass | no `chat.llm.ts`; `buildChatTitle` at `domain/chat/chat.model.ts:37`, its 300-grapheme and blank cases in `domain/tests/chat/chat.model.test.ts`; the prompt only in `assistant.llm.ts` |
| R9 | pass | `infrastructure/outbox/outbox.relay.ts` exports a `Layer` and imports `Db`, the outbox, `QueueTransport` and config only |
| R10 | pass | the nine files of R10 in `domain/chat`; no `message` folder outside `repos/` |
| R11 | pass | `grep "ensureFound\|isInChat\|isTitledChat\|isOwnedBy"` is empty; `selectOne` on the chat, message and attachment ports |
| R12 | pass | read, no Biome rule: `streamReply`, `relayBatch`/`poll`, `upload`, `readHistory`, `openUpload` each one pipeline |
| R13 | pass | `grep "unknown\|Struct.evolve"` over the repositories is empty; `columns.ts` exports `SetColumns`, `WhereColumns`, `buildSet`, `buildWhere`, used by three repositories |
| R14 | pass | `bun pm ls --all`: `effect`, `@effect/platform-bun`, `@effect/sql-pg`, `@effect/vitest` at 4.0.6 only; no 4.0.5 in `bun.lock` |
| R15 | pass | `packages/s3/e2e/bucket.e2e.ts`: 0 B and 5 MiB without parts, 5 MiB + 1 in two parts, 12 MiB in three and read back, a stream failing after 11 MiB leaves no object and no open upload; `attachment.bucket.ts` is 58 lines |
| R16 | pass | migration `20261027172050_outbox_body_jsonb`, no index on `body`; the relay e2e passes |
| R17 | pass | unit suites for 4 domain services, 4 use cases, 4 api and 2 worker handlers; no `*.test.ts` outside `tests/`; `--project unit` passes with `DOCKER_HOST` pointing nowhere |
| R18 | pass | the e2e set matches, none in `apps/`; two concurrent e2e runs 80/80, one with `AWS_ENDPOINT_URL`, `STAGE`, `DATABASE_URL` pointing nowhere. The acceptance grep hits `S3BucketTest` (`packages/s3/e2e/bucket.e2e.ts:15`), a real `S3Bucket.layer` on MiniStack, not a memory layer |
| R19 | pass | `make help` lists `test`, `test-unit`, `test-e2e`; one `vitest.config.ts` with two projects; `check` runs `test` |
| R20 | pass | the glossary's "Architecture language" holds the 15 terms, each with `_Avoid_`; `grep "interactor\|orchestrator\|controller"` over `.claude/rules/` is empty |
| R21 | pass | `layering.md` present, `use-cases.md` gone; the old-model grep over rules, `CLAUDE.md`, `README.md` and `docs/knowledge/` is empty but for `docs/knowledge/roadmap.md:117`, the closed `chat-core` entry's history |
| R22 | pass | no `apps/*/src`; `make dev-api` answered `GET /health` 200, `make dev-worker` logged `worker started`, `make dev-web` answered 200 |
| R23 | pass | `domain/package.json` has `"sideEffects": false`; `bundle-check` green; a probe bundle of `domain/chat/index.ts` (scratchpad) made the same grep find `ChatService`, `MessageService`, `ChatRepository`, `MessageRepository`, `Assistant` |

**Not verifiable:** Docker stopped (R17), replaced by an unreachable `DOCKER_HOST`; the local stand
stopped (R18), replaced by its variables pointing nowhere; two worktrees (R18), replaced by two
concurrent runs in one tree; the R23 probe inside `apps/web`, replaced by a bundle in the
scratchpad. An interrupted S3 upload (R15) is aborted by `Effect.acquireRelease` on every
non-success exit, by reading; only a failing stream is tested.

### Review

#### Standards

No documented-standard breach but one; five judgement calls; read: the sources of `domain`,
`application`, `apps/worker`, `infrastructure`, `packages/{s3,queue,aws}`, `apps/api/layer.ts`.

**Violation**

- `domain/testing/index.ts` declares the layer `RepositoryStackTest`
  (`Layer.mergeAll(...).pipe(Layer.provideMerge(...))`) in the barrel; `naming.md › Files` puts a
  test layer in a `.test-layer` file, as `infrastructure` does with
  `repository-stack.test-layer.ts`. Hard, small.

**Judgement calls**

1. Duplicated Code: `filterOf` (`({ id: where.id, userId: skipUndefined(where.userId) })`) in both
   `infrastructure/chat/chat.repository.ts` and `message.repository.ts`; `replySkipLogs` in
   `generate-assistant-message.use-case.ts` repeats `titleSkipLogs`; inside the reply use case
   `generate` returns `replySkipLogs.chatDeleted` directly and `fail` goes through
   `skipped('chatDeleted')`.
2. Data Clumps: `{ readonly text: string; readonly at: DateTime.Utc }` and
   `Pick<MessageFailure, 'reason' | 'cause'> & { at }` appear in `Shape` and the implementation in
   `domain/chat/message.service.ts` and again in `completeMessage`/`failMessage` of
   `message.model.ts`.
3. `comments.md` (Gate A): "Providers reject an empty text block" twice in
   `infrastructure/chat/assistant.llm.ts`, over `toTextParts` and inside `suggestTitle`.
4. `packages/s3/bucket.ts`: `get` catches `Effect.catchTag('NoSuchKey')`, `untag`
   `catchIf(isNoSuchKey)`, for one error; the comment over `isNoSuchKey` does not say why.
5. `effect-services.md` ("a transition is one row and one call"): `snapshotMessage` sets
   `stage: 'generating'` outside the `transitions` table, guarded by the `write(..., 'generating')`
   condition; a second way to move a stage.
6. `Transaction` lives in `infrastructure/db/db.client.ts`, whose `.client` suffix means client
   wiring; `naming.md` has no suffix for such a service.

Checked and conforming: the layers of `ChatService`, `MessageService` and the use cases by
`layering.md`; writes through services, the one direct `chats.update` the rule-free write;
`transaction.run` and `QueueClient.send`; `transitions` and `failureMessages` as
`as const satisfies`; the four test suffixes; no relative imports; no ticket ids in comments.

#### Spec

No requirement missing. One behaviour change the spec forbids, one check it did not ask for, two
acceptance greps that hit correct code.

**Implemented, but wrong**

1. The `getMessage` contract changed. `http-api/chat/chat.http.ts:99` drops `chatNotFound`; a
   foreign or deleted chat now answers `MessageNotFoundError` instead of `ChatNotFoundError`, both
   404. `feature.md › Out of scope`: "The HTTP contract (`http-api`) and the web client:
   unchanged", and flows "do what they do today". S10 made the error unreachable, S11 removed it
   (commit `0859909545`); `sdd.md` asks for the `feature.md` edit when a deviation changes what it
   asks, and none was made. `apps/web` does not call `getMessage`.
2. R18's acceptance grep `(Repository|RepositoryStack|Bucket|Transaction)Test\b` over `*.e2e.ts`
   must be empty and hits `packages/s3/e2e/bucket.e2e.ts:15` (`const S3BucketTest =
   S3Bucket.layer(...)`), a real layer on MiniStack.
3. R21's acceptance grep must hit "only the glossary's `_Avoid_` lines" and hits
   `docs/knowledge/roadmap.md:117` ("`application/chat` services and the job"), history of a
   closed ticket.

**Beyond the spec**

4. S25: the `claude-md.md` line and `make doc-names` in `make check`; neither `feature.md` nor
   `architecture.md` names them. Roadmap entry 17 `docs-diet` rests on nothing in the spec;
   entry 16 `shared-files` on "Shared files … a later ticket".
5. `infrastructure/tests/chat/assistant.llm.test.ts`, a unit suite of the `AssistantLlm` adapter;
   R17 lists domain services, use cases and handlers, R18 sends adapters to `e2e/`. S14 recorded
   why (nothing else tests the prompt), `feature.md` was not edited.

**Partial**

6. R1's acceptance expects `Db` and `QueueTransport` as the `Context.Service`s of
   `infrastructure/`; they are `Db` and `Transaction`, `QueueTransport` sits in `packages/queue`.
   The list is stale, the requirement holds.

### Simplifications

1. Record the `getMessage` answer (Spec 1): a line in `feature.md › Out of scope` and a decision in
   `architecture.md › Decisions` (the error was unreachable once the message is read with its
   owner; both answers 404; the web client does not call it). Rejected: restoring `chatNotFound`
   in the contract, which would list an error no handler fails with. Docs only; it turns the
   verdict to pass.
2. Make the acceptance greps true on correct code: R18's grep names the domain fakes
   (`AttachmentBucketTest`, not any `BucketTest`), so `S3BucketTest`, which `naming.md` names
   right, passes; leave `roadmap.md` out of R21's grep; read `Transaction` for `QueueTransport` in
   R1's (Spec 2, 3, 6). Three lines.
3. Move `RepositoryStackTest` out of `domain/testing/index.ts` into
   `domain/testing/repository-stack.test-layer.ts` (the Standards violation).
4. Run `make bundle-check` and `make doc-names` in CI: the `static` and `links` jobs run neither,
   so a service leaking into the bundle or a stale doc name passes CI (S22 and S25 deferred it).
5. One `filterOf` for the chat and message repositories, one skip-log path in the reply use case,
   named types for a snapshot's `{ text, at }` and a failure's input, one empty-text comment in
   `assistant.llm.ts`, one `NoSuchKey` catch in `packages/s3/bucket.ts` (Standards 1–4). One step,
   ~60 lines.
6. Record S25's check and the `AssistantLlm` unit suite in `feature.md` (Spec 4, 5).

Not proposed: Standards 5 and 6 (the snapshot's stage and the `Transaction` file), which no rule
decides.

### Lessons

#### L1 — A Verify or acceptance check that cannot fail, or fails on correct code

- **Evidence:** S1 (`bun pm ls` without `--all` listed nothing; `@effect/` caught `@effect/tsgo`),
  S7b (macOS `git grep -E` ignores `\b`, so the grep always came back empty), S10 (`--include`
  unquoted in zsh), S22 (`+` let the bare `Assistant` key through), S25.2 (a failing `git grep`
  fed an empty pipe that passed), and this run: R18's and R21's acceptance greps hit correct code.
- **Cost:** a check that passed by construction in S7b and S25 until it was noticed; a Verify rewritten in four
  steps; two acceptance checks that fail for anyone who reruns them.
- **Proposed change:** `.claude/skills/ticket-plan/SKILL.md`, step 4: "The researcher also runs
  every Verify and Acceptance command once, on the tree as it stands and on a probe that must make
  it fail; a command that cannot fail, or fails for another reason, is rewritten before the plan
  is presented."
- **Applied:** no

#### L2 — Steps that move suites ran well past the size bound

- **Evidence:** S6 ~470, S10 ~690, S11 ~730, S12 ~900, S15 ~716 changed lines against ~400; each
  finding names the moved and rewritten suites as the bulk.
- **Cost:** S11 and S12 took four rounds each, S9 four; the diffs read in review were up to twice
  the bound.
- **Proposed change:** `.claude/skills/ticket-plan/SKILL.md`, step 2: "Count the lines of each
  suite a step moves or rewrites toward the bound; past it, a `git mv` step lands before the
  rewrite."
- **Applied:** no

#### L3 — A step changed what `feature.md` asks without editing it

- **Evidence:** S10–S11 (the `getMessage` answer, Spec 1), S14–S15 (the `AssistantLlm` unit suite
  against R17/R18), S25 (a check beyond the scope); R3's and R18's acceptance were edited when
  they broke (S7b, S14), the Out of scope never was.
- **Cost:** a `fail` verdict at the end of the ticket and a docs step after it.
- **Proposed change:** `.claude/skills/ticket-implement/SKILL.md`, the spec row of step 3: the
  Spec axis also gets `feature.md › Out of scope` and reports a diff that touches it.
- **Applied:** no

#### L4 — Rule files went over their budget mid-ticket

- **Evidence:** `naming.md` at 83 (S2), 88 (S7b) and 91 lines (S21); `effect-style.md` at 91 (S5);
  each deferred the cut to S23.
- **Cost:** every session loading those rules paid the extra lines from S2 to S23, where the cut
  waited.
- **Proposed change:** a mechanical check in `make check`: fail when a `.claude/rules/*.md` file
  passes 80 lines or a `CLAUDE.md` 40 (`claude-md.md › Hard limits`).
- **Applied:** no
