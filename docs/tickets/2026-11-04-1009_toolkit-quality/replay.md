# Toolkit quality — replay

> Ticket: `2026-11-04-1009_toolkit-quality` · Requirements: [feature.md](./feature.md) (R11) ·
> Design: [architecture.md › Contracts](./architecture.md#contracts), the replay set, run as D8

Each review pass of S1 and S2, the plan checks of S3 and the briefs of S4, replayed on committed
steps under the new toolkit, a review pass with its reviewer at effort `low`. Each finding, and
each check a plan-time run judged, is read against what later commits changed: `hit` (a later
commit made this change or fixed this failure), `near` (a later commit changed the same code for a
related reason), `miss` (no later commit acted on it, or the run passed over the known defect).

## The passes

| Pass | Step | Findings | Wall time |
|---|---|---|---|
| Design | `llm-providers` S2.1 | 3 (1 hit, 1 near, 1 miss) | 26 s (session 122 s) |
| Design | `postgres-drizzle` S10.1 | 4 (1 hit, 3 miss) | 74 s, on fable (session 177 s) |
| Design | `architecture-audit` S11.1 | 2 (1 near, 1 miss), after a resent report | 43 s (session 152 s) |
| hunt | `architecture-audit` S30.2 | 2 (1 hit, 1 miss), 1 confirmed | 41 s (session 131 s) |
| hunt | `postgres-drizzle` S8.1 | 4 (1 hit, 2 near, 1 miss), 4 confirmed; 2 planted dropped | 80 s (session 241 s) |
| plan-time run | `modular-monolith` S26 | 2 checks: 1 fails as expected, 1 cannot run; L4 miss at the verdict, hit in the researcher's note | 49 s (session 131 s) |
| plan-time run | `modular-monolith` S27 | 2 checks: 2 fail as expected; L4 miss at the verdict, hit in the researcher's note | 62 s (session 129 s) |
| plan-time run | `modular-monolith` S30 | 2 checks: 1 fails as expected, 1 cannot run; L4 miss | 15 s (session 79 s) |
| plan-time run | `modular-monolith` S36 | 2 checks: 2 fail as expected; L4 miss at the verdict, hit in the researcher's note | 57 s (session 118 s) |
| plan-time run | `modular-monolith` S37 | 3 checks: 3 pass (`make check` and `doc-width` on a clean parent, S13); L4 near | 71 s (session 166 s) |
| probes | `modular-monolith` S39 | 50 probes, 50 fail before; 37 no longer fail after, L8's among them | 116 s (session 378 s), rerun 99 s |
| probes per ban | `modular-monolith` S39, four overrides | 18 probes, 18 fail before; 13 no longer fail after, each of L8's four bans among them, 5 still fail | 2.3 s, rerun 2 s, a script with no agent |
| probes of every scope (S13) | `modular-monolith` S39, the whole rewrite | 180 probes, 179 fail before (G1, the plugin's own, passes); 71 of the 176 override probes no longer fail after | 33.6 s for both commits, a script with no agent |
| hunt, again (S9) | `postgres-drizzle` S8.1 | 2 (2 miss), 2 confirmed; the discarded result named, its failure judged handled | 78 s (session 206 s) |
| Design, on opus (S9) | `postgres-drizzle` S10.1 | 4 (1 hit, 1 near, 2 miss) | 19 s (session 125 s) |
| confirmation (S14) | `postgres-drizzle` S8.1 | 1 planted `claimed`, `refuted`: not asked | 67 s (session 96 s) |

Wall time is the pass's: its reviewer's or researcher's `totalDurationMs`, plus a resent round,
plus the confirmations (run in parallel, so their span); the session's `duration_ms` adds the main
session's own reading and writing. The probes add the rerun after the guard's change, which the
skill gives the implementer. The five review sessions ran at the same time, and so did the eight
sessions of the plan checks and the briefs (14:43 to 14:50).

What the problems found later came to:

| Step | Found later | In the replay |
|---|---|---|
| S2.1 | options retyped field by field (`51bc0c3711`) | hit, candidate 1 |
| S2.1 | the worker providing the models' layer itself (`02457604ca`) | near, candidate 3 |
| S2.1 | fields no caller reads (`34c5b53643`) | seen, not raised: the reviewer cites `architecture.md` naming them for a later step |
| S10.1 | a send-only client implementing consume as a die (`9d50a4775a`) | not found |
| S11.1 | one wrapper per message write, a service with no rule of its own (`9a3863c3cb`) | near, candidate 1: the four wrappers seen, a combinator proposed, not the service's removal |
| S30.2 | a failing `perl` piped into `grep .` passes the gate (`f09318d2ce`) | hit, finding 1, `shown` |
| S8.1 | a write's "did it write" answer discarded, a deleted chat ignored (`f6e2561120`) | **not found**: the report says "I found no silent fallback in `ChatRepositoryPg.update`" while `touch` wraps it in `Effect.asVoid` |
| S10.1, on opus (S9) | a send-only client implementing consume as a die (`9d50a4775a`) | hit, candidate 2 |
| S8.1, again (S9) | the same | **named, its failure missed**: listed under "nothing wrong" as "only matters when the chat was deleted at the same time, which the job already handles" |

## The run

Each worktree sat at the round's parent with the toolkit's `.claude/agents/` and `.claude/skills/`
committed on its `wt/<name>` branch and the round's diff, less its ticket's `plan.md` and
`architecture.md`, applied uncommitted. The S8.1 diff's `touch` was re-read first:
`application/chat/chat.service.ts:253-254` is
`Effect.asVoid(chats.update({ updatedAt: sendable.at }, { id: sendable.chatId }))`.

Claude Code 2.1.311, main session `claude-opus-5-5` at the user's default effort (`high`), run in
the worktree as:

```sh
claude -p '<prompt>' --permission-mode acceptEdits --allowedTools "Bash Read Glob Grep Agent Skill" \
  --output-format stream-json --verbose
```

The prompt:

```text
Replay, non-interactive. This worktree holds round <round> of step <step> of
docs/tickets/<ticket>/, uncommitted, at the parent of that round. Act as the main session of
/ticket-implement: read .claude/skills/ticket-implement/SKILL.md and perform its steps 3 and 4
for the <pass> pass alone, whatever its trigger says. Run no implementer, no simplify, no other
pass and no commit; edit no file. Spawn each reviewer with effort low. Where a source the skill
names for the brief is absent from this tree, leave it out of the brief. <planted> Ask the user
nothing: write each question as you would ask it. Print, in this order: ## Brief (each brief you
sent, verbatim), ## Sources absent (each source the skill names that this tree lacks, or none),
## Report (the report of the reviewer, verbatim<then the two appended lines>), ## Confirmations
(each claimed finding with the answer of its researcher, verbatim, or none), ## Presentation
(what you would present to the user).
```

| Worktree (`.claude/worktrees/toolkit-quality-S5-…`) | `<round>` | `<ticket>` | `<pass>` |
|---|---|---|---|
| `design-llm-providers-S2` | S2.1 | `2026-10-29-1435_llm-providers` | Design |
| `design-postgres-drizzle-S10` | S10.1 | `2026-10-22-1915_postgres-drizzle` | Design |
| `design-architecture-audit-S11` | S11.1 | `2026-10-27-1433_architecture-audit` | Design |
| `hunt-architecture-audit-S30` | S30.2 | `2026-10-27-1433_architecture-audit` | hunt |
| `hunt-postgres-drizzle-S8` | S8.1 | `2026-10-22-1915_postgres-drizzle` | hunt |

`<planted>`, in the S8.1 run only:

```text
Before step 4, append these two lines to the report of the hunt, as if its reviewer wrote them,
and treat them as its findings:
- `application/chat/chat.service.ts:161` — bug — the write of rename looks fragile under load — claimed — guard it by the old title
- `application/chat/chat.service.ts:174` — bug — updateTitle on an untitled chat → returns at this line before the write lands, so the title is never stored — claimed — return only after re-reading the chat
```

The first has no scenario; the second is false (line 174 runs after the update has returned).

## Design — `llm-providers` S2.1

- **Brief named:** the step, `git diff HEAD` and the untracked
  `infrastructure/chat/assistant-models.client.ts`, the diff's 21 files and the two use cases
  behind the `Assistant` port, `design-examples.md`, `docs/knowledge/architecture.md`, the
  ticket's D1 and D5. **Lacked:** `.claude/rules/deep-modules.md`, `docs/knowledge/decisions.md`.
- **Read:** the diff of four folders and the untracked file through one `Bash` call, D1 and D5,
  one grep. Not `design-examples.md`, not `docs/knowledge/architecture.md`.
- **Report** (each candidate with a before and an after sketch):
  1. `Narrower interface: derive AnthropicOptions from LlmConfig instead of restating it — Strong`,
     `assistant-models.client.ts:9` — **hit** (`51bc0c3711`, the same `Extract` of the
     `anthropic` arm).
  2. `Plainer implementation: replace the Match pipeline in layerFromConfig with a ternary — Worth
     exploring`, `assistant-models.client.ts:56` — **miss** (the `Match` stays through the
     ticket's squash).
  3. `Coupling: let layerAnthropic provide its own HTTP client — Speculative`,
     `apps/worker/layer.ts:31` — **near** (`02457604ca` stops the worker knowing the models'
     layer; `FetchHttpClient.layer` stays in the worker). Its label names a criterion, not one of
     the four lenses.
- **Confirmations:** none (no behaviour finding).
- **Presentation:** 1 and 2 forwarded as fixes, 2 backed by `effect-style.md` ("two arms stay a
  guard"); 3 asked as a question, recommending the plan's placement.

## Design — `postgres-drizzle` S10.1

- **Brief named:** the step, the diff and its seven untracked files, the diff's files, three
  callers, `design-examples.md`, `docs/knowledge/architecture.md`, the ticket's D1–D4, D9, D10,
  D13, D21. **Lacked:** `.claude/rules/deep-modules.md`, `docs/knowledge/decisions.md`.
- **Read:** 19 tool calls: the diff, each untracked file, the callers, `design-examples.md`, the
  step and its decisions, the dependency rules of `architecture.md`.
- **Model:** the session spawned the reviewer with `model: fable`, against the skill's "the
  agent's own"; the user's memory, which `claude -p` loads, names fable for review depth. Its time
  is not comparable with the opus runs.
- **Report:**
  1. `Composition: wire OutboxRelay to SQS beside QueueClientSqs, not in the app — Strong`,
     `apps/worker/src/layer.ts:18` — **hit** (`171d8b6249`, S10.2: "OutboxRelaySqs … moves beside
     OutboxRelay, so apps/worker drops its @app-template/queue dependency").
  2. `Narrower interface: QueueClientOutbox lives with the outbox, not in shared — Worth
     exploring`, `infrastructure/shared/queue.client.ts:9-10` — **miss**.
  3. `Plainer: one spelling for the Drizzle error in the relay — Worth exploring`,
     `outbox.relay.ts:52` — **miss** (the `catchTag` stays at `9d50a4775a`).
  4. `Plainer: relayBatch answers a count, not the rows — Speculative`, `outbox.relay.ts:34,51,55`
     — **miss**.
- **Not found:** `QueueClientOutbox`'s `consume: () => Effect.die(…)`, the send-only client
  holding the consumer's role, which `9d50a4775a` split into `QueueSender` and `QueueConsumer`.
  No candidate reads the port's two roles.
- **Confirmations:** none.
- **Presentation:** 1 and 3 forwarded; 2 asked, recommending to keep it; 4 rejected as cosmetic.

## Design — `architecture-audit` S11.1

- **Brief named:** the step, the diff and three untracked files, 13 diff files, ten callers,
  `design-examples.md`, `docs/knowledge/architecture.md`, the ticket's D1, D2, D6, D10, D14.
  **Lacked:** `.claude/rules/deep-modules.md`, `docs/knowledge/decisions.md`.
- **First report, rejected by the session:** three candidates at `message.service.ts:547`, `:653`,
  `:669`, in a file of 152 lines: the line numbers of a `cat` of four files in one `Bash` call.
  The reviewer had read three files. The session resent it through `SendMessage`: "Read the
  sources the brief names, then re-issue the report … with lines that exist in the file".
- **Second report** (read: `design-examples.md`, `architecture.md`'s domain services, the five
  decisions):
  1. `Composition: build the four stage moves from one combinator — Strong`,
     `domain/chat/message.service.ts:111` (`:119`, `:132`, `:140`) — **near** (`9a3863c3cb` drops
     `MessageService`: its four moves wrap one write each and hold no rule of their own).
  2. `Narrower interface: the message builders take the fields they read, not SendableChat —
     Worth exploring`, `message.service.ts:34` — **miss** (the service goes in `9a3863c3cb`).
- **Confirmations:** none.
- **Presentation:** 1 forwarded as S11.2; 2 asked, since the ticket's contract names
  `addUserMessage(sendable: SendableChat)`; recommends keeping it.

## hunt — `architecture-audit` S30.2

- **Brief named:** the diff (no untracked files), its six files, the `check` target and the CI job
  that run `make service-use`. **Lacked:** none; the hunt names neither trap file.
- **Report:**
  - `Makefile:151` — bug — if perl cannot run, or cannot open a file, the gate still passes … —
    shown: `perl -0777 -ne '…' /tmp/t.ts /nonexist.ts | grep .; echo $?` printed the hit and the
    warning, then `exit=0` — fix: capture perl's output first and fail when perl fails — **hit**
    (`f09318d2ce`, the same fix, `|| exit 2`).
  - `Makefile:150` — bug — the new regex dropped the old `\(` … `Effect.map(Config.port, f)` fails
    with "Reach a service by Service.use" — claimed — narrow the first argument, or name the limit
    — **miss** (the regex is unchanged at `f09318d2ce`).
- **Confirmation** of `Makefile:150`, researcher on opus, 19 s: `confirmed`, by running both
  regexes on four sample lines: the new one matches all four, the old one only the lambda.
- **Presentation:** the shown finding forwarded; the confirmed one asked with two options.

## hunt — `postgres-drizzle` S8.1

- **Brief named:** the diff (no untracked files), its 28 files, nine callers, the fake
  `AttachmentRepositoryYielding` and its adapter `AttachmentRepositoryPg`. **Lacked:** none.
- **Report** (line numbers are positions in the `git diff` output; each researcher gave the
  file's own):
  - `send-message.use-case.ts:775` (file `:70`) — the enqueues now run inside
    `sql.withTransaction`, while the api sends through `QueueClientSqs`: a worker reads no message
    and logs "chat deleted", reply and title lost — claimed — **hit** (`3104adafc1`, S8.2: "the
    jobs are enqueued once it commits").
  - `chat-title.job.ts:466-468` (file `:25-27`) — a missing first message is logged as
    `chatDeleted` — claimed — **near** (the same cause, closed by `3104adafc1`).
  - `chat.service.ts:611` with `:642` (file `:152-164`, `:253-255`) — `rename` lost the lock, and
    `touch` sets `updatedAt` back from T2 to T1 — claimed — **near** (`f6e2561120` drops `touch`
    and writes `updatedAt` inside `addUserMessage`, for a deleted chat, not for the time).
  - `attachment.service.ts:227` (file `:175`) — `store.keep` before the conditional `bind`, so a
    rolled-back send leaves objects kept forever — claimed — **miss**.
  - The two planted lines, after the report's closing "I found no silent fallback in
    `ChatRepositoryPg.update` or `AttachmentRepositoryPg.bind`".
- **Not found:** the swallowed construct. `touch` discards `update`'s answer (`Effect.asVoid`), so
  a send to a chat deleted in the meantime goes on to a foreign-key failure; the report states the
  opposite.
- **Confirmations**, researchers on opus, launched in one message, 12:20:08 to 12:20:48 (41 s):
  `confirmed` for each of the four real findings, each correcting its line numbers, the fourth
  also narrowing it ("the row itself does expire … what never goes away is the object");
  `refuted` for the planted `:174`, by the trace and
  `bunx vitest run application/chat/chat.service.test.ts -t "updateTitle"` →
  `Tests  4 passed | 11 skipped (15)`. The planted `:161` was sent to no researcher: "there is no
  scenario … so by step 4 it is not shown".
- **Presentation:** the four confirmed findings, three asked as questions; `:174` reported as
  refuted and `:161` as not shown, neither among the findings.

## The runs of S9

Two runs after `reviewer.md`'s hunt also names a discarded result, in
`.claude/worktrees/toolkit-quality-S9-hunt-s8-1` and `…-S9-design-s10-1`, set up as above. The
step's `reviewer.md` was copied into each and marked `git update-index --skip-worktree`, so the
session spawned it while `git diff HEAD` showed only the round; the hunt reviewer's transcript
holds the new line. The prompt is the one above with
"Spawn every agent, reviewer and researcher alike, with model opus." after the effort sentence,
no `<planted>` lines and no appended ones. Both ran at once, 14:52 to 14:55; Claude Code 2.1.311.

## hunt — `postgres-drizzle` S8.1, again (S9)

- **Brief named:** the diff (no untracked files), its 28 files, seven callers. **Lacked:** none.
  The reviewer `opus`, effort `low`, 41 s, seven `Bash` calls over `git diff` and `grep`.
- **Report:**
  - `attachment.service.ts:174` — `store.keep` runs inside the send's transaction, which cannot
    undo it, so a rolled-back send leaves bytes kept forever — claimed — **miss** (S5's fourth
    finding again; `store.keep` still precedes the bind at `f6e2561120`,
    `attachment.service.ts:175`).
  - `chat-title.job.ts:25` — the job calls the model before learning that a rename titled the
    chat, one LLM call wasted — claimed — **miss** (the job is unchanged at `f6e2561120`; the plan
    asked it to drop its chat reads).
  - Under "I checked these and found nothing wrong": "**Ignored write results:** `touch` and
    `writeSettled` drop the 'wrote or not' answer. That only matters when the chat was deleted at
    the same time, which the job already handles as 'chat deleted'."
- **The discarded result:** named, with the input that matters, a chat deleted beside the send.
  The outcome is wrong: `touch` runs in the send, not in a job, and the deletion surfaces as the
  foreign key's failure, a 500, which `f6e2561120` turns into `ChatNotFoundError` by reading the
  update's answer. **A miss on the failure it hides** (R4).
- **Lost:** S5's hit, the enqueues inside the transaction while the api sends through
  `QueueClientSqs`. The reviewer grepped `apps/api/src/layer.ts` (`QueueClientSqs`), then
  `queue.client.ts` for `outbox|insert`, and wrote "both jobs go through `QueueClientSqs`, which
  writes to the `outbox` table": the insert it saw is `QueueClientOutbox`'s.
- **Confirmations**, researchers on opus, launched as background agents: `confirmed` for both,
  37 s and 21 s, in parallel; the first narrows the fix ("covers a lost bind race, but not a
  rollback caused by `addAssistantMessage`, `touch` or `enqueue` after `keep`").
- **Presentation:** both asked as questions, the first recommending `keep` last before the
  commit, the second keeping the plan's choice.

## Design — `postgres-drizzle` S10.1, on opus (S9)

- **Brief named:** as S5's, the same seven untracked files, four callers, `design-examples.md`,
  `docs/knowledge/architecture.md`, D2–D4, D9, D10, D13, D21. **Lacked:**
  `.claude/rules/deep-modules.md`, `docs/knowledge/decisions.md`.
- **Model:** `opus`, effort `low`, in the session's `Agent` call and in every assistant message
  of the reviewer's transcript (`claude-opus-5-5`); 19 s, one `Bash` call (`git diff` of four
  paths and `cat` of the untracked files). Not `design-examples.md`.
- **Report** (each candidate with a before and an after sketch and a strength):
  1. `Plainer implementation: move QueueClientOutbox into infrastructure/outbox/ — Strong`,
     `infrastructure/shared/queue.client.ts:32` — **miss** (S5's candidate 2; `QueueSenderOutbox`
     is still in `shared/queue.client.ts` at `9d50a4775a`). Its lens is a move, not a plainer body.
  2. `Narrower interface: give the api a send-only port instead of a consume that dies — Worth
     exploring`, `queue.client.ts:53` — **hit** (`9d50a4775a`, `QueueSender` and `QueueConsumer`):
     the defect S5's fable run did not find.
  3. `Composition: have shared export one SQS transport layer for the worker — Worth exploring`,
     `apps/worker/src/layer.ts:18` — **near** (`171d8b6249` moves `OutboxRelaySqs` beside
     `OutboxRelay`, out of the app; the candidate keeps the relay's wiring in the app).
  4. `Plainer implementation: store the full queue name in the outbox row — Speculative`,
     `outbox.relay.ts:39` — **miss** (the relay still builds the name at `9d50a4775a`).
- **Confirmations:** none.
- **Presentation:** 1 asked, recommending the move; 2 asked, recommending to keep D4's `consume`
  that dies; 3 forwarded; 4 rejected.

## An unclear confirmation, attempted (S14)

A `claimed` finding whose code path is real and whose trigger only production shows, a limit of
S3, so that neither a trace nor a run in the tree settles it. In
`.claude/worktrees/toolkit-quality-S14-unclear`, set up as above on S8.1 with the toolkit of
`e6eceeb643`; one session, 20:58:41 to 21:00:20, Claude Code 2.1.311. The prompt runs step 4
alone on a report the prompt holds, so no reviewer ran:

```text
Replay, non-interactive. This worktree holds round S8.1 of step S8 of
docs/tickets/2026-10-22-1915_postgres-drizzle/, uncommitted, at the parent of that round. Act as
the main session of /ticket-implement: read .claude/skills/ticket-implement/SKILL.md and perform
its step 4 alone, taking the report below as the report of the hunt, whatever its trigger says.
Run no implementer, no reviewer, no simplify, no other pass and no commit; edit no file. Ask the
user nothing: write each question as you would ask it. Print, in this order: ## Confirmations
(each claimed finding with the brief you sent its researcher and its answer, verbatim, or none),
## Presentation (what you would present to the user).

The report of the hunt:

- `application/attachment/attachment.service.ts:175` — bug — a send with attachments during a
  burst of sends in production → S3 answers `DeleteObjectTagging` with `503 SlowDown` once the
  bucket's `attachments/` prefix passes its request rate, past the SDK's default retries;
  `keep`'s `Effect.orDie` makes it a defect inside the send's transaction, which rolls back, so
  the user gets a 500 and the message is not stored — claimed — retry `keep` with backoff, or
  keep the bytes after the commit
```

- **Confirmation:** one `researcher`, `model: opus`, its brief the finding verbatim, the worktree
  and `git diff HEAD` plus the untracked files; 67 s, 17 tool calls. The answer, verbatim:

  ```text
  Verdict: refuted
  Evidence: The code does what the finding traces. A failed `keep` dies
  (`infrastructure/attachment/attachment.storage.ts:216-221`). `bind` calls it at
  `application/attachment/attachment.service.ts:175`. `send` runs inside `sql.withTransaction`
  (`application/chat/send-message.use-case.ts`, diff), so the send rolls back. But that rollback
  is the behaviour the ticket requires: `docs/tickets/2026-10-22-1915_postgres-drizzle/feature.md:157-158`
  (R6) says "IF any write of the send fails, THEN THE SYSTEM SHALL leave no message, bind, chat
  change or outbox entry behind". This diff also did not add the `keep`-then-die path. `git diff
  HEAD` shows that HEAD already ran `store.keep` with `Effect.orDie` inside `bind`, outside any
  transaction, so the same S3 failure already returned a 500 and left the user message stored
  half-done. Last, the S3 client adds no retry settings (`infrastructure/shared/aws.client.ts:15-18`),
  so the SDK defaults apply. In the installed SDK, `node_modules/.bun/@smithy+core@3.36.1/node_modules/@smithy/core/dist-cjs/submodules/retry/index.js`
  lists `"SlowDown"` among `THROTTLING_ERROR_CODES` (line 28) and sets `DEFAULT_MAX_ATTEMPTS = 3`
  and `DEFAULT_RETRY_MODE = RETRY_MODES.STANDARD` (lines 433-434). So `SlowDown` is already
  retried with backoff, and nothing in the repo shows that a chat send burst would pass S3's
  per-prefix request rate.
  ```

- **Read against the claim:** the trace holds, and the researcher says so. It refutes the wrong
  outcome instead: the rollback and the 500 are what the ticket's R6 asks of a failed write. The
  trigger it leaves unsettled ("nothing in the repo shows … would pass S3's per-prefix request
  rate") and still answers `refuted`, not `unclear`; `researcher.md` gives `unclear` only to what
  a new test would settle, which a production limit is not.
- **Presentation:** "Раунд S8.1 можно коммитить: единственную находку ревью проверка отклонила";
  the finding listed under the hunt as rejected, with the three reasons; no question.
- **Wall time:** 67 s for the confirmation (session 96 s, wall 99 s).

## The plan checks: the run

Each plan-time worktree sat at the parent of its step's implementation with the toolkit's
`.claude/agents/` and `.claude/skills/` committed on its `wt/<name>` branch and nothing else
changed, so its `plan.md` held the step as it stood then. The S36 and S37 pairings were checked
first: `35c69b96e4` opens "S36.1: the reply's rollback through the api", and its parent
`6fe0b488c4` opens "S37.1: the branch review found docs naming what the code lacks". The ground
truth is L4 and L8 of `modular-monolith`'s `verification.md`.

The same `claude -p` command as the review passes, the main session `claude-opus-5-5` at the
user's default effort. Every researcher was spawned with no `model` and ran on
`claude-sonnet-5-5`, as its file states; the brief runs spawned nothing.

The plan-time prompt:

```text
Replay, non-interactive. This worktree sits at the parent of step <step> of
docs/tickets/2026-10-31-0926_modular-monolith/, before the step was implemented; its plan.md
holds the step as it stood then, and this worktree is the main tree the skill names. Act as the
main session of /ticket-plan: read .claude/skills/ticket-plan/SKILL.md and perform its step 4 for
step <step> alone, and of step 4 the Red list alone: no Exists or Conforms list, no probes. Read
the Status table and the step section of plan.md by grep -n and offset. Spawn one researcher, on
the model its file states (sonnet; pass no model), with the Red list. Edit no file and commit
nothing; write each fix to plan.md as you would make it instead of making it. Ask the user
nothing. Print, in this order: ## Red list (each check you sent, verbatim), ## Brief (the brief
you sent the researcher, verbatim), ## Report (the report of the researcher, verbatim), ## Fixes
(the plan.md fix for each check that passes or cannot run, or none).
```

`<step>` is S26, S27, S30, S36 and S37, each in `.claude/worktrees/toolkit-quality-S6-plan-<step>`.

The probes prompt, in `.claude/worktrees/toolkit-quality-S6-s39-probes` at `8572da12bf`:

```text
Replay, non-interactive. Step S39 of docs/tickets/2026-10-31-0926_modular-monolith/ rewrites the
guard biome.json; read it in plan.md by grep -n and offset. This worktree sits at the parent of
S39 and is the worktree <slug>-plan-probes the skill names, set up already: skip its creation,
make worktree and its removal. Act as the main session of /ticket-plan: read
.claude/skills/ticket-plan/SKILL.md and perform the probes of its step 4 alone, for the guard as
biome.json holds it in this worktree: write one probe per ban in the Probes shape of
docs/tickets/_template/plan.md, then spawn one researcher, on the model its file states (sonnet;
pass no model), with the probes and the path of this worktree; it plants each probe here, runs
the command the probe names, quotes the failing line, and deletes every probe file before it
reports. Edit no other file and commit nothing. Ask the user nothing. Print, in this order:
## Probes (the list in the Probes shape, each with the failing line the researcher quoted),
## Brief (the brief you sent the researcher, verbatim), ## Report (the report of the researcher,
verbatim), ## Probes that did not fail (or none).
```

## The plan-time run

### S26 — the apps' layers exported to the e2e as test support

- **Red list:** (1) `git grep -n "api/layer'\|worker/layer'" ':!docs/tickets' ':!repos'` finds
  nothing outside the tickets; (2) a throwaway import of `@app-template/worker/testing` into
  `apps/api/` fails Biome naming "Independent apps".
- **Report:** (1) `fails as expected`, five lines, three of them the internal `#api/layer` and
  `#worker/layer` imports that stay, so "after the step the check still finds three lines, so
  'finds nothing' can never be true"; it proposes `@app-template/\(api\|worker\)/layer'`.
  (2) `cannot run`: "Biome 2.5.15 in stdin mode (`--stdin-file-path`) reports no lint diagnostics
  at all", `debugger` as a control included; and the ban `@app-template/worker/**` already matches
  `…/worker/testing` today, so the check cannot tell the step's state.
- **Fixes:** both checks rewritten, (2) as a grep of `"./layer"` in the apps' `package.json`.
- **Against L4: miss at the verdict, hit in the researcher's note.** S26's own finding: "Verify's
  grep was narrowed to `@app-template/(api|worker)/layer`: the written one matched the internal
  `#api/layer` imports `main.ts` keeps". Check 1 came back `fails as expected`; its `cannot run`
  is check 2's, another defect.

### S27 — the packages one workspace, the kernel's parts one entry each

- **Red list:** (1) `git grep -nE "'@app-template/(kernel/data/|kernel/aws/resources|(aws|db|llm|queue|s3|testing|ui)['/])" -- ':!docs/tickets' ':!repos'`
  finds nothing; (2) a throwaway import of `ChatService` into `apps/web/app/main.ts` fails
  `make bundle-check` naming the file's path.
- **Report:** both `fails as expected`. (1) 172 lines, but the pattern's `kernel/data/` matches
  `'@app-template/kernel/data/testing'`, which S27 keeps (six imports), so "check 1 could never
  reach zero". (2) a package import of `ChatService` stops at `bun build` ("Could not resolve"); a
  relative one fails the grep on a service key, not a path. The researcher ran (2) in a detached
  worktree under `/tmp`, removed after; `git worktree list` shows none.
- **Fixes:** "Нет" (none) by the rule, since no check came back `passes` or `cannot run`; the
  session still wrote both rewrites below it.
- **Against L4: miss at the verdict, hit in the researcher's note.** S27's Verify names the
  stores, `kernel/data/(attachment|chat|file|job|user)['/]`, the researcher's option 1. Its "finds
  only the repositories' service keys" was not seen.

### S30 — a Biome list per workspace

- **Red list:** (1) a script lists every `@app-template/<folder>` import with its workspace and
  finds each in that workspace's list; (2) `git ls-files 'packages/**/tsconfig.json'` finds
  `packages/tsconfig.json` alone.
- **Report:** (1) `cannot run`: no script exists and "the plan's 'workspace's list' is not a
  defined object in this tree". (2) `fails as expected`: it lists the seven per-package files.
- **Fixes:** (1) dropped, its sense moved into `make check`'s lint.
- **Against L4: miss.** The glob never matches `packages/tsconfig.json`: on today's tree, where the
  file exists, `git ls-files 'packages/**/tsconfig.json'` prints nothing (checked: 0 lines), so
  check 2 could not pass after the step. The researcher ran it on the state before alone.

### S36 — the branch review's test fixes

- **Red list:** (1) `make test-e2e` counts one case more; (2) `git grep -n 'sortById\|LayerTest\b'`
  finds none outside the ticket.
- **Report:** both `fails as expected`. (1) relative: the researcher ran the e2e (Docker up) and
  got `Tests  102 passed (102)`, a count the plan does not give. (2) the hits include
  `repos/effect/ai-docs/src/80_cluster/10_entities.ts:76,91` (`ClusterLayerTest`) and another
  ticket's plan, which stay after the step: "As written, the check can never come back empty."
- **Fixes:** `Tests  103 passed (103)` named, the pathspec `-- . ':!docs/tickets' ':!repos'` added.
- **Against L4: miss at the verdict, hit in the researcher's note** (the vendored `repos/effect`).

### S37 — the docs the branch review found out of step with the code

- **Red list:** `make check`, `make doc-width`, `make doc-names`.
- **Report:** `make check` and `make doc-width` `fail as expected`, but on
  `.claude/skills/ticket-implement/design-examples.md:56: 118` and `:105: 113`, the file this
  replay copied in, a setup artifact.
  `make doc-names` `passes`, and cannot fail on any of the step's stale lines: it reads neither
  `docs/tickets/` nor `roadmap.md` (`Makefile:118-119`).
- **On a clean parent (S13):** `make check` and `make doc-width` `pass`, so all three checks do.
  Run on a `git archive` export of `17c552af21` with nothing copied in, `make doc-width` exits 0
  over 42 Markdown files; a planted line of 150 characters in `docs/knowledge/` fails it (exit 2).
  `make check`, which runs `doc-width` (`Makefile:108`), exits 0 with `Tests  213 passed (213)`
  and, in the e2e, `Tests  102 passed (102)`. It needs an index (`git init` and `git add -A`: on a
  bare `git init`, `doc-names` fails on `docs/knowledge/tooling.md:88`), `bun install
  --frozen-lockfile` and Docker running. The session read both as failing and proposed no fix for
  either.
- **Fixes:** one grep per stale spot, among them the bundle check's row: `Makefile:253` greps
  "only `Assistant|Provenance`", and "a widened grep instead fails its probe port".
- **Against L4: near.** S37's finding: "a probe port `Clock` passed the old grep and failed the
  new". The replay named the narrow grep and asked for a probe port, without running one.

## The probes — `modular-monolith` S39

- **The list:** one probe per override of `biome.json` at `8572da12bf` (48) and one per root rule
  that bans an import (relative paths, `noImportCycles`), each run by `bunx biome lint <probe>`.
  A ban here is one override, as `/ticket-plan` step 3 defines it ("one scope of the guard (a
  Biome override …)"), not one of the overrides' 176 ban groups: `apps/api/**` has four, and P41
  plants only the repository one. R8's "one probe per ban the guard enforces" is observed in part.
  The template there has no Probes shape (the replay copies only `.claude/agents/` and
  `.claude/skills/`), so the session wrote its own; the list below puts it in the ticket's shape.
- **Before:** 50 of 50 fail, each with exit 1 and the ban on the planted line; `git status
  --porcelain` empty after.
- **After:** S39's change applied uncommitted (`git diff 8572da12bf dbb29d488a | git apply`: nine
  overrides and the plugin `biome-imports.grit`), then the same probes rerun by the implementer
  from a copy of the researcher's runner, with `bunx biome lint` and `bunx biome check`. A probe
  fails when a ban stands on it (`noRestrictedImports`, `noImportCycles` or the plugin), since
  `check` exits 1 on formatting alone (P42, P45, P48). The copy reproduced 50 of 50 before the
  change. 13 still fail (P1, P19 and P21 through the plugin); 37 no longer fail.
- **Against L8:** the probes of each override L8 names no longer fail: `apps/api` (P41–P43),
  `apps/worker` (P44–P46), `deployment` (P49) and the layer tests' (P9). S43 (`89fdbcf073`)
  restores the bans on another app or `deployment` in the apps, the bans in `deployment`, and
  each layer's override over its tests. The other 29 S39 meant to leave to the manifests and
  `tsc -b`; the probes ran against Biome alone (the plan's trap), so whether another tool holds
  each is not checked here.
- **L8's bans with no probe of their own:**
  - `apps/api/**`'s "the apps never import each other or deployment": probed only through
    `apps/api/layer.ts` (P42), another override;
  - `apps/worker/**`'s same group: P44 and P45 plant `@app-template/http-api`, not another app or
    `deployment`;
  - `apps/web`'s: no probe imports another app or `deployment` (P47 a module, P48 `http-api`);
  - `deployment/**`'s "may import only packages/* and of the kernel its config, the inventory
    (/aws) and /data": P49 plants the `unboundTag` group alone;
  - the domain tests': no override at `8572da12bf` covers `__tests__/domain/`, so there was none
    to probe; P9 covers the infrastructure tests' override.

- **Probes** (`biome.json`, run at plan time; `bunx biome lint <path>`):
  - P1 root, relative path — `probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its #<workspace>/… subpath, never a relative path" — after: fails (plugin)
  - P2 root, `noImportCycles` — `application/chat/domain/probe-a.ts` and `probe-b.ts`, each importing the other → `1:19` "This import is part of a cycle." — after: fails
  - P3 `http-api/**` — `http-api/probe.ts`: `import { ChatService } from '@app-template/application/chat'` → `1:10` "of a module's entry http-api takes only its contract and its domain" — after: fails
  - P4 `application/chat/domain/**` — `application/chat/domain/probe.ts`: `import { x } from '#chat/services/x'` → `1:19` "a module's domain imports neither its services nor its infrastructure" — after: fails
  - P5 `application/chat/services/**` — `application/chat/services/probe.ts`: `import { x } from '#chat/infrastructure/x'` → `1:19` "a module's services reach its infrastructure only through a port" — after: fails
  - P6 `application/chat/infrastructure/**` — `application/chat/infrastructure/probe.ts`: `import { x } from '#chat/services/x'` → `1:19` "a module's infrastructure implements its domain's ports and never calls its services" — after: fails
  - P7 `application/chat/__tests__/**` — `application/chat/__tests__/probe.test.ts`: `import { x } from '#testing/chat/e2e/x'` → `1:19` "a unit test and its support import no e2e support" — after: passes
  - P8 `application/chat/__tests__/testing/**` — `application/chat/__tests__/testing/probe.ts`: `import { x } from '@app-template/kernel/aws'` → `1:19` "a module's test support imports no workspace but @app-template/packages/testing, …" — after: passes
  - P9 `application/chat/__tests__/infrastructure/**` — `application/chat/__tests__/infrastructure/probe.test.ts`: `import { x } from '#chat/services/x'` → `1:19` "a module's infrastructure implements its domain's ports and never calls its services" — after: passes
  - P10 `application/chat/index.ts` — appended to `application/chat/index.ts`: `import { x } from '@app-template/kernel/data'` → `4:19` "a module's entry re-exports its own layers' barrels and imports no workspace" — after: fails
  - P11 `application/identity/contract/**` — `application/identity/contract/probe.ts`: `import { x } from '#identity/domain/x'` → `1:19` "a module contract imports none of its module's other files" — after: fails
  - P12 `application/identity/domain/**` — `application/identity/domain/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a module's domain is pure and ships to the browser: it imports no workspace but …" — after: passes
  - P13 `application/identity/services/**` — `application/identity/services/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a module's services import no workspace but @app-template/packages/db …" — after: passes
  - P14 `application/identity/__tests__/**` — `application/identity/__tests__/probe.test.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a module's tests import no workspace but @app-template/packages/testing, …" — after: passes
  - P15 `application/identity/index.ts` — appended to `application/identity/index.ts`: `import { x } from '@app-template/kernel/data'` → `4:19` "a module's entry re-exports its own layers' barrels and imports no workspace" — after: fails
  - P16 `application/use-cases/**` — `application/use-cases/probe.ts`: `import { x } from '@app-template/kernel/llm'` → `1:19` "the use cases import no workspace but a module's entry, the data layer … and packages/*" — after: fails
  - P17 `application/use-cases/__tests__/**` — `application/use-cases/__tests__/probe.test.ts`: `import { x } from '@app-template/kernel/llm'` → `1:19` "the use cases import no workspace but …, and their test support" — after: passes
  - P18 `kernel/**` — `kernel/probe/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a kernel part with no override of its own imports no workspace but packages/*" — after: passes
  - P19 `kernel/data/**` — `kernel/data/probe.ts`: `import { x } from '#kernel/config/config'` → `1:19` "the data layer imports no other kernel part" — after: fails (plugin)
  - P20 `kernel/*/__tests__/**` — `kernel/aws/__tests__/probe.test.ts`: `import { x } from '#testing/aws/e2e/x'` → `1:19` "a unit test and its support import no e2e support" — after: passes
  - P21 `kernel/data/__tests__/**` — `kernel/data/__tests__/probe.test.ts`: `import { x } from '#kernel/config/config'` → `1:19` "the data layer and its memory repositories import no other kernel part" — after: fails (plugin)
  - P22 `kernel/*/__e2e__/**` — `kernel/config/__e2e__/probe.e2e.ts`: `import { x } from '@app-template/kernel/aws'` → `1:19` "the e2e of a kernel part with no override of their own import no workspace but packages/* …" — after: passes
  - P23 `kernel/aws/**` — `kernel/aws/probe.ts`: `import { x } from '@app-template/kernel/data'` → `1:19` "kernel/aws and its e2e support import no workspace but packages/*, …" — after: passes
  - P24 `kernel/llm/**` — `kernel/llm/probe.ts`: `import { x } from '@app-template/kernel/data'` → `1:19` "kernel/llm imports no workspace but packages/* and of the kernel /config" — after: passes
  - P25 `kernel/postgres/**` — `kernel/postgres/probe.ts`: `import { x } from '@app-template/kernel/aws'` → `1:19` "kernel/postgres and its e2e import no workspace but packages/* …, and of the kernel /config and /data" — after: passes
  - P26 `kernel/queue/**` — `kernel/queue/probe.ts`: `import { x } from '@app-template/kernel/llm'` → `1:19` "kernel/queue, its e2e and their support import no workspace but packages/* …" — after: passes
  - P27 `kernel/config/**` — `kernel/config/probe.ts`: `import { x } from '@app-template/kernel/aws'` → `1:19` "kernel/config and its tests import no workspace but packages/* and their test support" — after: passes
  - P28 `kernel/data/__e2e__/**` — `kernel/data/__e2e__/probe.e2e.ts`: `import { x } from '@app-template/kernel/llm'` → `1:19` "the e2e of the data layer and their support import no workspace but packages/* …" — after: passes
  - P29 `packages/**` — `packages/probe/probe.ts`: `import { x } from '@app-template/kernel/config'` → `1:19` "a package with no override of its own imports no workspace but none" — after: passes
  - P30 `packages/*/__tests__/**` — `packages/llm/__tests__/probe.test.ts`: `import { x } from '@app-template/kernel/config'` → `1:19` "the tests of a package with no override of their own import no workspace but @app-template/packages/testing" — after: passes
  - P31 `packages/aws/**` — `packages/aws/probe.ts`: `import { x } from '@app-template/packages/db'` → `1:19` "packages/aws imports no workspace but none" — after: passes
  - P32 `packages/aws/__tests__/**` — `packages/aws/__tests__/probe.test.ts`: `import { x } from '@app-template/packages/db'` → `1:19` "the tests of packages/aws import no workspace but @app-template/packages/testing" — after: passes
  - P33 `packages/db/**` — `packages/db/probe.ts`: `import { x } from '@app-template/packages/aws'` → `1:19` "packages/db imports no workspace but @app-template/packages/testing, for its e2e support" — after: passes
  - P34 `packages/db/__tests__/**` — `packages/db/__tests__/probe.test.ts`: `import { x } from '@app-template/packages/aws'` → `1:19` "the tests of packages/db import no workspace but @app-template/packages/testing" — after: passes
  - P35 `packages/llm/**` — `packages/llm/probe.ts`: `import { x } from '@app-template/packages/aws'` → `1:19` "packages/llm imports no workspace but none" — after: passes
  - P36 `packages/queue/**` — `packages/queue/probe.ts`: `import { x } from '@app-template/packages/db'` → `1:19` "packages/queue imports no workspace but @app-template/packages/aws …" — after: passes
  - P37 `packages/queue/__tests__/**` — `packages/queue/__tests__/probe.test.ts`: `import { x } from '@app-template/packages/db'` → `1:19` "the tests of packages/queue import no workspace but @app-template/packages/aws, @app-template/packages/testing" — after: passes
  - P38 `packages/s3/**` — `packages/s3/probe.ts`: `import { x } from '@app-template/packages/db'` → `1:19` "packages/s3 imports no workspace but @app-template/packages/aws …" — after: passes
  - P39 `packages/testing/**` — `packages/testing/probe.ts`: `import { x } from '@app-template/packages/aws'` → `1:19` "packages/testing imports no workspace but none" — after: passes
  - P40 `packages/ui/**` — `packages/ui/probe.ts`: `import { x } from '@app-template/packages/aws'` → `1:19` "packages/ui imports no workspace but none" — after: passes
  - P41 `apps/api/**` — `apps/api/probe.ts`: `import { x } from '@app-template/kernel/data'` → `1:19` "a handler calls one service method or one use case, never a repository" — after: passes
  - P42 `apps/api/layer.ts` — appended to `apps/api/layer.ts`: `import { x } from '@app-template/worker'` → `73:19` "apps/api imports no workspace but …: the apps never import each other or deployment" — after: passes
  - P43 `apps/api/__tests__/**` — `apps/api/__tests__/probe.test.ts`: `import { x } from '#testing/api/e2e/x'` → `1:19` "a unit test and its support import no e2e support" — after: passes
  - P44 `apps/worker/**` — `apps/worker/probe.ts`: `import { x } from '@app-template/http-api'` → `1:19` "apps/worker imports no workspace but …: the apps never import each other or deployment" — after: passes
  - P45 `apps/worker/layer.ts` — appended to `apps/worker/layer.ts`: `import { x } from '@app-template/http-api'` → `45:19` the message of P44 — after: passes
  - P46 `apps/worker/__tests__/**` — `apps/worker/__tests__/probe.test.ts`: `import { x } from '@app-template/http-api'` → `1:19` "the tests of apps/worker import no workspace but …" — after: passes
  - P47 `apps/web/**` — `apps/web/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "web client code may import only @app-template/http-api and @app-template/packages/ui" — after: fails
  - P48 `apps/web/main.ts` — appended to `apps/web/main.ts`: `import { x } from '@app-template/http-api'` → `33:19` "the web server entry imports only @app-template/packages/ui and @app-template/kernel/config …" — after: passes
  - P49 `deployment/**` — `deployment/probe.ts`: `import { Db } from '@app-template/kernel/data'` → `1:10` "of @app-template/kernel/data deployment takes only the files' key, unboundTag" — after: passes
  - P50 `apps/e2e/**` — `apps/e2e/probe.ts`: `import { x } from '@app-template/deployment'` → `1:19` "the e2e import no workspace but the processes' test support …: never web or deployment" — after: passes

## The probes per ban — `modular-monolith` S39, again (S8)

- **The list:** one probe per ban group, as `/ticket-plan` step 3 now defines a ban, of the three
  overrides L8 names (`apps/api/**`, `apps/worker/**`, `deployment/**`, four groups each) and of
  the domain tests' override. No override of its own covers `__tests__/domain/` at `8572da12bf`;
  `application/chat/__tests__/**` (six groups) does, so its probes sit in `__tests__/domain/`.
  18 probes for 18 groups, where the list above has four (P41, P44, P49, P7).
- **The run:** the implementer wrote the list from the skill's definition and planted it by a
  script, with no `claude -p` session and no researcher, in `git archive` exports of
  `8572da12bf` and `dbb29d488a` (S39's commit) in the session's scratch folder, outside the
  repository; each probe a file of its own, `import` and `export const y = x`, run by `biome lint
  --vcs-enabled=false <probe>` and deleted. Three imports each ban allows (`kernel/config` in
  `apps/api`, `unboundTag` in `deployment`, `packages/testing` in the domain tests) pass, so a
  probe fails on its ban, not on the planting.
- **Before:** 18 of 18 exit 1 on `noRestrictedImports` alone, each with its own group's message:
  the distinct messages per override are 4, 4, 4 and 6, its group count.
- **After:** 13 no longer fail; five still fail, through the plugin `biome-imports.grit`: the
  four relative paths (A4, W4, D4, T6) and the cross-module file (T5).
- **Against L8:** every one of its four lost bans has its own probe now, and each no longer fails
  after S39: A1 and W1 (another app), D1 (a kernel part outside `deployment`'s three), T1–T4 (the
  domain tests' workspace, client, store and e2e bans).

- **Probes** (`biome.json`, run at plan time; `biome lint <path>`):
  - A1 `apps/api/**`, the apps never import each other — `apps/api/probe-a1.ts`: `import { x } from '@app-template/worker'` → "apps/api imports no workspace but … the apps never import each other or deployment" — after: passes
  - A2 `apps/api/**`, no repository — `apps/api/probe-a2.ts`: `import { x } from '@app-template/kernel/data'` → "a handler calls one service method or one use case, never a repository" — after: passes
  - A3 `apps/api/**`, no mapper — `apps/api/probe-a3.ts`: `import { chatFromEntity as x } from '@app-template/application/chat'` → "a handler never maps an entity: the module's services own the mappers" — after: passes
  - A4 `apps/api/**`, relative path — `apps/api/probe-a4.ts`: `import { x } from './x'` → "inside a workspace import through its #<workspace>/… subpath, never a relative path" — after: fails (plugin)
  - W1 `apps/worker/**`, the apps never import each other — `apps/worker/probe-w1.ts`: `import { x } from '@app-template/api'` → "apps/worker imports no workspace but … the apps never import each other or deployment" — after: passes
  - W2 `apps/worker/**`, no repository — `apps/worker/probe-w2.ts`: `import { x } from '@app-template/kernel/data'` → "a handler calls one service method or one use case, never a repository" — after: passes
  - W3 `apps/worker/**`, no mapper — `apps/worker/probe-w3.ts`: `import { chatFromEntity as x } from '@app-template/application/chat'` → "a handler never maps an entity" — after: passes
  - W4 `apps/worker/**`, relative path — `apps/worker/probe-w4.ts`: `import { x } from './x'` → the message of A4 — after: fails (plugin)
  - D1 `deployment/**`, its workspaces — `deployment/probe-d1.ts`: `import { x } from '@app-template/kernel/llm'` → "deployment may import only packages/* and of the kernel its config, the inventory (/aws) and the files' key (/data)" — after: passes
  - D2 `deployment/**`, no configured client — `deployment/probe-d2.ts`: `import { sqsClientFromConfig as x } from '@app-template/kernel/aws'` → "of @app-template/kernel/aws deployment takes only the inventory and its naming rule, never a configured client" — after: passes
  - D3 `deployment/**`, only `unboundTag` — `deployment/probe-d3.ts`: `import { Db as x } from '@app-template/kernel/data'` → "of @app-template/kernel/data deployment takes only the files' key, unboundTag" — after: passes
  - D4 `deployment/**`, relative path — `deployment/probe-d4.ts`: `import { x } from './x'` → the message of A4 — after: fails (plugin)
  - T1 `application/chat/__tests__/**`, its workspaces — `application/chat/__tests__/domain/probe-t1.test.ts`: `import { x } from '@app-template/kernel/llm'` → "a module's tests import no workspace but @app-template/packages/testing, …" — after: passes
  - T2 the same, no configured client — `…/probe-t2.test.ts`: `import { s3ClientFromConfig as x } from '@app-template/kernel/aws'` → "of @app-template/kernel/aws a module's tests take only the inventory" — after: passes
  - T3 the same, no client `Db` — `…/probe-t3.test.ts`: `import { Db as x } from '@app-template/kernel/data'` → "of @app-template/kernel/data a module's tests take only the stores" — after: passes
  - T4 the same, no e2e support — `…/probe-t4.test.ts`: `import { x } from '#testing/chat/e2e/x'` → "a unit test and its support import no e2e support" — after: passes
  - T5 the same, another module's file — `…/probe-t5.test.ts`: `import { x } from '#identity/domain/x'` → "a module reaches its own files through #<module>/… and another module … only through its entry" — after: fails (plugin)
  - T6 the same, relative path — `…/probe-t6.test.ts`: `import { x } from './x'` → the message of A4 — after: fails (plugin)

## The probes of every scope — `modular-monolith` S39 (S13)

- **The list:** [probes-s39.md](./probes-s39.md), one probe per ban of every scope, since S39
  rewrites the guard whole: the 176 groups of the 48 overrides at `8572da12bf`, the root's two
  bans and the plugin's two diagnostics as an added scope's own, 180 in all.
- **The run:** a script with no agent, the same `git archive` exports and `biome lint` as S8's;
  360 runs, one per probe and commit, in 33.6 s, after about ten minutes choosing the imports.
- **Before:** 179 of 180 fail, each with its own message; the distinct messages per override equal
  its groups in all 48. Seven probes also draw a second group's message, since the module source's
  `#testing/**` group never refuses an import alone. G1, the plugin's cross-unit diagnostic,
  passes. G2, its relative path, already fails on the root's pattern.
- **After:** of the 176 override probes, 71 pass, 85 fail on the plugin alone, 13 on their own
  message and 7 on a group S39 reworded. Each of the 15 bans of the nine overrides S39 leaves has
  a probe that fails on that ban's message alone
  ([probes-s39.md › After S39's bans](./probes-s39.md#after-s39s-bans)). G1 and G2 fail on
  the plugin. Every group of L8's four overrides has its own probe; each passes after S39 but the
  ones the plugin holds.

## The briefs

Each session printed the briefs `/ticket-implement` steps 2 and 3 would send, spawning nothing:

```text
Replay, non-interactive. <the tree>. Act as the main session of /ticket-implement: read <the
skill> and print the briefs its steps 2 and 3 would send for this step; skip the branch and
clean-tree checks of step 1, since the change is the uncommitted <round|step>. Spawn no agent,
run no skill that spawns one, run no simplify, no make check and no commit, and edit no file.
Name with each brief the agent, model and effort the skill states for it. Ask the user nothing.
Print, in this order: ## Passes (implementer, simplify, Standards, Spec, hunt, Design: each with
run or not run and the line of the skill that decides it), ## Briefs (each brief you would send,
verbatim, headed by its agent, model and effort).
```

- **S22**, in `toolkit-quality-S6-brief-S22` at `c57cf517b4` with `8b6e947cca`'s diff applied
  uncommitted. `<the tree>`: "This worktree holds round S22.1 of step S22 of
  docs/tickets/2026-11-02-1820_lean-instructions/, uncommitted, at the parent of that round. Its
  .claude/ is that round, not the toolkit under test: read the skill from
  /Users/v/lab/app-template/.claude/skills/ticket-implement/SKILL.md, the files beside it from
  that folder, and the agents it names from /Users/v/lab/app-template/.claude/agents/, never the
  copies in this worktree." **A deviation from the plan's setup:** S22's diff edits
  `implementer.md`, `reviewer.md` and the skill, so the toolkit's copies could not be committed
  under it; the session read them from the main tree by absolute path (its first call: `cat` of
  that `SKILL.md`).
- **The synthetic move**, in `toolkit-quality-S6-brief-move` at the ticket branch's head,
  `git mv packages/aws/naming.ts packages/aws/names.ts` staged. `<the tree>`: the step as a
  section of no ticket (Delivers: the file is named `names.ts`; Test first: config only; Verify:
  `make check`; Model: `opus medium`), the skill read from the tree's own `.claude/`. The rename
  leaves its two importers (`packages/aws/index.ts`, `packages/aws/provision.ts`) on
  `#aws/naming`, as the plan defines the step.

| Run | Passes it would run | `writing-for-agents` named in | Wall time |
|---|---|---|---|
| `lean-instructions` S22.1 | implementer, simplify, Standards, Spec, hunt, Design | the Standards brief alone | session 122 s, no agent |
| synthetic move | implementer, Standards, Spec | no brief | session 59 s, no agent |

- **S22:** simplify and Design run because "the diff adds the script `.claude/hooks/bash-guard.sh`",
  the hunt because of the script's `|| reason="bash-guard.sh failed, so the command is refused…"`
  ("a fallback"). The implementer's brief is two lines, the ticket folder and `S22`, on `opus
  high`. The Standards brief, on `sonnet`, lists `.claude/rules/claude-md.md`, `commits.md`,
  `sdd.md`, `CLAUDE.md` and `mattpocock-skills:writing-for-agents`. The Standards and Spec briefs
  also carry `code-review`'s own asks ("Report every place the diff violates…", "(a) what the
  step … asks that is missing"). The Design brief names
  `.claude/skills/ticket-implement/design-examples.md`, which the S22 tree lacks: a reviewer
  spawned there would not find it (the setup's deviation).
- **The move:** `git diff HEAD -M` shows `rename packages/aws/{naming.ts => names.ts} (100%)`.
  simplify: not run, "a pure move included, gets Standards and Spec alone"; hunt: not run,
  nothing of its list touched; Design: not run, "S-move … is not a behaviour step". The Standards
  brief lists the seven rules `make review-rules` printed and `packages/CLAUDE.md`, and no
  `writing-for-agents`: "the diff touches no instruction file".

## Against the requirements

- **R1, R2:** three Design reports, 3, 4 and 2 candidates, each with a strength and a before and
  an after sketch; none on import direction. Two labels name no lens (S2.1's "Coupling", S10.1's
  "Plainer" for "a shorter or plainer implementation"). S9's S10.1 run on opus keeps the shape:
  four candidates, each with both sketches and a strength.
- **R3:** each Design brief names `.claude/skills/ticket-implement/design-examples.md`. Three of
  the five reports at effort `low` were written without reading it (S2.1, S11.1's first, S9's
  S10.1).
- **R4:** S30.2 names the swallowed construct, perl's failure under `| grep .`, and what it hides,
  a gate that passes unchecked. S8.1 misses its own: `touch`'s `Effect.asVoid`. Asked of a
  discarded result (S9), the hunt names `touch`'s and judges it handled: **a second miss** on the
  failure it hides, a send that loses to a delete ending in a 500.
- **R5:** every behaviour finding presented has an input → wrong outcome, and the planted one
  without a scenario was not presented. The code location held only after the confirmations:
  every `path:line` the S8.1 reviewer gave was a line of the `git diff` output, not of the file,
  and each researcher gave the file's own; S11.1's first Design report cited lines past the
  file's end. These runs are no evidence that a reviewer's own `path:line` is correct.
- **R6:** each `claimed` finding, the planted `:174` among them, had a verdict before the
  presentation: five `confirmed`, one `refuted`. **R6's `unclear` branch is unobserved:** no
  researcher answered `unclear`, so no finding reached the user as a question. S14's claim, a
  real path whose trigger is a production limit of S3, came back `refuted` too, by R6 of its own
  ticket, the trigger named as unsettled (*An unclear confirmation, attempted*). It is left to
  the ticket's verification.
- **R1, the move:** no `simplify`, no Design, no hunt, for a rename whose importers are untouched.
  A real move rewrites its importers' lines, a change to a `.ts` file's content, which the skill's
  one test counts as a behaviour step; that case was not run.
- **R7:** among the 11 checks of the five steps, two `cannot run` (S26's Biome probe through
  stdin, S30's undefined script) and three `passes`, S37's `make doc-names` with a fix and its
  `make check` and `make doc-width`, which pass on a clean parent the session read as failing
  (S13). **The
  verdicts themselves catch none of L4's five defects:** at the verdict, S26, S27, S30 and S36 are
  misses, each a check that `fails as expected` today and could never pass after the step. S26's,
  S27's and S36's are hits in the researchers' notes, which the sessions' briefs asked for; S30's
  is missed there too; S37's came near.
- **R8, in part:** one probe per override of `biome.json` at `8572da12bf`, and per root rule that
  bans an import, each with its failing line, not one per ban group (176); after S39's change the
  probes of the overrides L8 names no longer fail (P9, P41–P46, P49), and neither do 29 others
  under Biome. Four of L8's bans have no probe of their own (the list above); S8's rerun, one
  probe per ban group, gives each its own (*The probes per ban*). S13 probes every ban of every
  scope, 180, the set R8 names for a whole rewrite (*The probes of every scope*).
- **R9:** S22's Standards brief names `mattpocock-skills:writing-for-agents` and its implementer
  brief does not; the move's Standards brief does not either.

## What the replay shows

These read the runs whose reviewer ran on the agent's own model, opus: S5's four and S9's two;
S5's S10.1, whose reviewer ran on fable, is left out.

- **The reviewer at effort `low` reads less than its brief names, and cites lines from `Bash`
  output.** All six read the code only through `Bash` output (`git diff`, `cat`, `grep`), against
  `reviewer.md`'s "read each file with the `Read` tool, one per call". S11.1's first report and
  all of S8.1's line numbers came from that output. A hunt finding is corrected by its
  confirmation; a Design candidate has none, and S11.1's was caught only because its lines passed
  the file's end.
- **The hunt finds the failures a step introduces, not always the one it was chosen for.** Both
  hunts found a real failure a later round fixed (S30.2 in its own words, S8.1's enqueue before
  commit); S8.1 missed the discarded answer and declared there was none. Told to question a
  discarded result, S9's run on S8.1 found it and judged it harmless, and lost S5's hit by
  reading a grep line of `QueueClientOutbox` as `QueueClientSqs`'s.
- **Design comes within one later change per step:** a hit on S2.1, a near on S11.1, where the
  later commit removed the service the candidate kept, and a hit on S10.1 on opus (S9), the
  send-only port the fable run did not find, in 19 s against fable's 74 s.

The plan checks and the briefs:

- **The plan-time run finds what the past plans got wrong, but outside its verdicts.** Three of
  L4's five came back `fails as expected` with a note that the check could never pass after the
  step; the rule fixes only `passes` and `cannot run`, so S27's session wrote "Fixes: none" above
  the two rewrites it went on to propose. S30's glob, the same kind, is missed in the notes too:
  no researcher ran a check against the state its step creates.
- **The probes make a guard rewrite's losses countable:** 37 of 50 probes no longer fail Biome
  after S39, L8's four overrides among them, for 116 s of a researcher and a 99 s rerun; one probe
  per override leaves most of the 176 ban groups unplanted.
- **The briefs follow the skill's one test:** `writing-for-agents` reaches the Standards brief of
  an instruction edit only, and a rename with its content unchanged gets Standards and Spec alone.
