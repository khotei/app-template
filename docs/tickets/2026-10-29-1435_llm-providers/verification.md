# LLM providers — verification

> Ticket: `2026-10-29-1435_llm-providers` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-10-30 — run 1

**Verdict:** pass (R1's live half not verifiable here)

Branch `feat/llm-providers` at `d2490d5e07`. `make check` green with `ANTHROPIC_API_KEY` unset:
unit 20 files, 194 tests; e2e 17 files, 90 tests; lint, types, `migration-check`, `doc-names`,
`bundle-check`. The review covers the whole branch from `e5838e1a98` (`git merge-base HEAD
origin/main`), as it will be squash-merged: 87 commits, 167 files, about 60 of them refactors
scoped `chat`, `domain`, `queue`, `attachment`, `rules`, `db`, `user` with no `Refs`.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass (unit) | `infrastructure/tests/chat/assistant.llm.test.ts:155`, `:183`: the reply goes to `claude-sonnet-5-5`, the title to `claude-haiku-5-5`; the live run is below |
| R2 | pass | `make dev` on `LLM_PROVIDER="stub"`, a message sent by curl: `queued` → `generating` (empty text) → `done` with the stub's text; the chat titled `Stub chat title` |
| R3 | pass | `apps/worker/main.ts` on copies of `.env`, exit 1 each time: no `LLM_PROVIDER` and `openai` → `Expected "stub" \| "anthropic" at ["LLM_PROVIDER"]`; `anthropic` without the key → `at ["ANTHROPIC_API_KEY"]`; without the title model → `at ["LLM_TITLE_MODEL"]` |
| R4 | pass | `make test` with no key and `HTTPS_PROXY=http://127.0.0.1:9` for every host but localhost; Anthropic is built only over a fake `HttpClient` (`assistant.llm.test.ts:77`); the e2e stand runs the stub (`e2e/testing/stand.test-layer.ts:40`) |
| R5 | pass | `application/tests/chat/generate-assistant-message.use-case.test.ts:123`: `generating` with no text while the reply runs, then one `done` write; `preparing` shows through the `generating` write's guard; seen live too |
| R6 | pass | `domain/tests/chat/assistant.model.test.ts` rejects a blank text; `assistant.llm.test.ts:241` finds the field's description in the JSON Schema sent |
| R7 | — | dropped at architecture |
| R8 | pass | use-case test `:204`: a failed and the current message stay out of the history; adapter test `:211`: system first, user turns with text and images, assistant turns as text |
| R9 | pass | `infrastructure/chat/assistant.llm.ts:51-55` holds the role and rules only; `assistant.llm.test.ts:236`: the same `system` for two chats |
| R10 | pass | `assistant.llm.test.ts:155`: `cache_control` `{ type: 'ephemeral' }`, no `ttl` |
| R11 | pass | reply 16 000 tokens with default effort and thinking; title 1 000 tokens, `effort: 'low'`, thinking disabled |
| R12 | pass | local DB: the `assistant-message` outbox row's body holds `provenance` `{ provider: 'stub', model: 'stub', instructionsHash: 'fee852bb…' }`, marked sent and kept; the `chat-title` row has none; `messages` has no such column; no `provenance` in `http-api` or `domain`; the hash moves with the prompt and the schema (`assistant.llm.test.ts:496`), read without the key (`:518`, `packages/config/tests/config.test.ts:99`) |
| R13 | pass | 401, 403, 400 → `AssistantFailedError` after one request (`assistant.llm.test.ts:262`) → `failed` with `ReplyFailed` (use-case test `:171`) |
| R14 | pass | under `TestClock`: 429 with `retry-after: 5` → requests at 0, 5 000, 10 000 ms; with 60 → one request |
| R15 | pass | 529, 500, a `max_tokens` cut and a blank text → requests at 0, 1 000, 3 000 ms |
| R16 | pass | a refusal, as JSON or not, ends after one request; the use case writes `failed` with `ReplyRefused`, text `''`, its own sentence (`domain/chat/message.model.ts:158`) |
| R17 | pass | the 400 `prompt is too long` case, one request |
| R18 | pass | `cause` keeps the provider's text (`assistant.llm.test.ts:364`); the api's message error has `reason` and `message` only (`http-api/chat/chat.http.ts:37`, `apps/api/tests/chat/chat.handler.test.ts:151`) |
| R19 | pass | a 121-character and a blank title retried at 0, 1 000, 3 000, 7 000, 15 000 ms; a valid one trimmed and stored; 401 and a refusal stop after one request; the use case leaves the chat untitled and logs (`generate-chat-title.use-case.test.ts:116`) |
| R20 | pass | `docs/knowledge/ai.md` has a row for each of the 22 files of `repos/effect/packages/effect/src/ai/` but `index.ts`, and the 7 of `@effect/ai-anthropic`; it says how to change the prompt and the schema and what each does to the cache |
| R21 | pass | `.env.example:28-31`: `LLM_PROVIDER="stub"`, the key and both models commented out |

**Not verifiable:** R1's live half: `make dev` with a real key, a reply in the question's
language and a title from the real model. No key is set in `.env` or the environment; `plan.md`
leaves it to the user's manual check.

### Review

#### Standards

No hard-violation clusters; sampled the code, not most tests, docs or migrations.

- **Hard:**
  - `domain/testing/assistant.test-fake.ts:27` uses `??` on a value, where `effect.md` asks for
    `UndefinedOr`.
  - `infrastructure/chat/assistant.llm.ts:182` exports `generateInstructionsHash` for its test
    only (`deep-modules.md › Caller`); `build` would fit a pure derivation (`naming.md`).
- **Judgement:**
  - `packages/config/config.ts`: two parallel provider tables, `llmSettings` and
    `replyModelSettings`.
  - `assistant.llm.ts` holds prompts, schemas, the finish-reason hook, retries, the hash,
    `CurrentReplyProvenance` and the adapter (Divergent Change).
  - An inline `&&` inside `failOnEarlyFinish`'s `Arr.findFirst`, where `effect-style.md` asks for
    a named predicate.
  - `failOnEarlyFinish`'s `MutableRef` side channel, commented and justified.
  - `ReplySkip` and its log table carry a string key.
  - `settleWith(end: typeof idleChat)` takes its type from a function.
- **Clean:** imports, no `Effect.Do`, `Schema.TaggedError` domain errors, comments mostly the why,
  a `where` on every write and one `transaction.run`.

#### Spec

No requirement missing outright; R1–R6, R8–R21 and the amended `chat-core` R16–R19, R25 and
`postgres-drizzle` R7 are recorded.

- **(a) Partial:**
  - R12's acceptance reads the outbox body in an e2e test, but `infrastructure/e2e/shared/queue.client.e2e.ts:28-50`
    reads a hand-built provenance and the journey never reads it, so the api's
    `CurrentReplyProvenance.layerFromConfig` wiring is checked by the type checker only.
  - R19's title suite covers a 401 and a refusal, not a 400 or a rate limit; it runs the same
    `askWithin` as the reply.
- **(b) Not asked for:**
  - `make idioms` and its CI step (`80c4ae5e6f`); the `.fdignore` entry.
  - The api now needs `LLM_PROVIDER` to start; R3 names the worker only (accepted in Risks).
  - The refactors, by theme:
    - chat and domain: the chat status stored as `idle|queued|failed`, `MessageService` and
      `activeMessage` gone, `stage` → `status`, `completed` → `done`. Amended in `chat-core` R6,
      R7, R10, R15, and R5 and D3 here depend on them. The squash-merged PR changes the api
      contract, although `architecture.md` says "**Wire**: unchanged".
    - queue: `QueueSender` and `QueueConsumer` split, two `aws-local` fixes. This contradicts D1's
      wording ("`packages/queue` does not change"), not its design.
    - attachment, s3, user, db: reads and deletes by one `where`, and a write that misses dies.
      All migrations squashed into one init (`6b4b4ff889`), which cannot be undone for an
      existing database.
    - rules and tooling docs.
- **(c) Looks wrong:**
  - A reply job queued before the deploy that made `provenance` required never decodes.
    `23d0b94761` retries an undecodable body, forever on the dead-letter queue, so
    `handleDeadLettered` never fails the message, the chat stays `queued`, and every send answers
    `409 ChatBusyError`.
  - D6 accepted a decode failure, not a chat the user cannot use again.

### Simplifications

Accepted: 1 and 2 as plan step S9, 3 and 4 as S10.


1. **A job schema change must decode the bodies already queued.** Make `GenerateAssistantMessage.provenance`
   decode a body without it (`infrastructure/chat/chat.queue.ts:40`), or have the dead-letter
   path fail the message of a body that will never decode. Gain: no chat stuck `queued` after a
   deploy that adds a job field. Today no deployed queue exists, so it bites the first deploy
   that carries an old job.
2. **The journey reads the reply job's provenance from the outbox** (`e2e/chat.e2e.ts`). Gain:
   R12's acceptance covers the api's real `CurrentReplyProvenance.layerFromConfig`, not a
   hand-built value.
3. **`UndefinedOr` for the fake's `??`** (`domain/testing/assistant.test-fake.ts:27`), and a named
   predicate for the inline `&&` in `failOnEarlyFinish` (`infrastructure/chat/assistant.llm.ts`).
   Gain: two rule breaches gone.
4. **`architecture.md` matches the branch:** "**Wire**: unchanged" and D1's "`packages/queue` does
   not change" are false once the refactors are in. Gain: the PR's reader is not misled. The PR
   body names the api contract changes.

### Lessons

#### L1 — A step's Files list misses the suites and docs that the change reaches

- **Evidence:**
  - S2: `e2e/chat.e2e.ts` and `docs/knowledge/roadmap.md`.
  - S4: `docs/knowledge/glossary.md`.
  - S6: the step's Files list fixed at approval.
  - S7: `e2e/chat.e2e.ts`, `apps/worker/tests/chat/assistant-message.handler.test.ts`, and every
    suite that builds a `GenerateAssistantMessage`.
- **Cost:** a finding per step and a Files rewrite at each approval. In S7 the unlisted suites
  pushed the round past its line budget unforeseen.
- **Proposed change:** `.claude/skills/ticket-plan/SKILL.md`: a step's Files names every suite
  that builds or asserts on a changed type, found by grepping its constructor, and every
  `docs/knowledge/` page that names a changed symbol (`make doc-names` lists them).
- **Applied:** yes, `.claude/skills/ticket-plan/SKILL.md`

#### L2 — The contract put a JSON Schema description where the emitted document drops it

- **Evidence:**
  - S3: `annotate` on a checked field landed on the check.
  - S6: `annotateKey` over `decodeTo`/`Schema.Trim` was replaced by `Schema.Trim`'s own text.
  - Both times `architecture.md`'s contract was wrong, and the implementer found it by probe.
- **Cost:** a contract fix in two steps, and a finding each.
- **Proposed change:** `.claude/rules/effect-schema.md`: an annotation meant for a JSON Schema
  sits on the encoded side, on the key of a checked field; its test reads it back from
  `Schema.toJsonSchemaDocument`.
- **Applied:** yes, `.claude/rules/effect-schema.md`

#### L3 — The local stand ran behind the committed migrations

- **Evidence:**
  - S2: the manual check needed `make migrate`.
  - S6: `make dev` failed with `column "status" … does not exist`, and the manual check was
    skipped.
  - S7: `make migrate` failed with `type "message_author" already exists` until the user's reset.
- **Cost:** two manual checks skipped or delayed, a reset of local data, and a step marked done
  without its Verify.
- **Proposed change:** a mechanical check. `make dev` runs `make migrate` first and stops on its
  error, which names the reset when a squash made the stand unrecoverable.
- **Applied:** yes, `make dev`, `dev-api` and `dev-worker` run `make migrate` first

#### L4 — The implementer took a stale or unclear word for the step's approval

- **Evidence:** S5. Twice a resumed implementer read the user's "нуы" as approval of the step.
- **Cost:** a correction to the user each time; a risk of a commit or `plan.md` edit without the
  gate.
- **Proposed change:** `.claude/skills/ticket-implement/SKILL.md` step 5: every message sent to
  the implementer for a next round opens with "Round S<n>.<k>: review feedback, not an approval".
- **Applied:** no: both slips came in one step, below the two-step bar; the round briefs already
  open with "review feedback, not an approval"
