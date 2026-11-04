# Toolkit quality — replay

> Ticket: `2026-11-04-1009_toolkit-quality` · Requirements: [feature.md](./feature.md) (R11) ·
> Design: [architecture.md › Contracts](./architecture.md#contracts), the replay set, run as D8

Each review pass of S1 and S2, replayed on a committed step's round under the new toolkit, with the
reviewer at effort `low`, and each finding read against what later commits changed: `hit` (a later
commit made this change or fixed this failure), `near` (a later commit changed the same code for a
related reason), `miss` (no later commit acted on it).

## The review passes

| Pass | Step | Findings | Wall time |
|---|---|---|---|
| Design | `llm-providers` S2.1 | 3 (1 hit, 1 near, 1 miss) | 26 s (session 122 s) |
| Design | `postgres-drizzle` S10.1 | 4 (1 hit, 3 miss) | 74 s, on fable (session 177 s) |
| Design | `architecture-audit` S11.1 | 2 (1 near, 1 miss), after a resent report | 43 s (session 152 s) |
| hunt | `architecture-audit` S30.2 | 2 (1 hit, 1 miss), 1 confirmed | 41 s (session 131 s) |
| hunt | `postgres-drizzle` S8.1 | 4 (1 hit, 2 near, 1 miss), 4 confirmed; 2 planted dropped | 80 s (session 241 s) |

Wall time is the pass's: its reviewer's `totalDurationMs`, plus a resent round, plus the
confirmations (run in parallel, so their span); the session's `duration_ms` adds the main
session's own reading and writing. The five sessions ran at the same time.

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

## Against the requirements

- **R1, R2:** three Design reports, 3, 4 and 2 candidates, each with a strength and a before and
  an after sketch; none on import direction. Two labels name no lens (S2.1's "Coupling", S10.1's
  "Plainer" for "a shorter or plainer implementation").
- **R3:** each Design brief names `.claude/skills/ticket-implement/design-examples.md`. Two of
  the four reports at effort `low` were written without reading it (S2.1, S11.1's first).
- **R4:** S30.2 names the swallowed construct, perl's failure under `| grep .`, and what it hides,
  a gate that passes unchecked. S8.1 misses its own: `touch`'s `Effect.asVoid`.
- **R5:** every behaviour finding presented has an input → wrong outcome and a `path:line`; the
  planted one without a scenario was not presented. In S8.1 every `path:line` the reviewer gave
  was a diff position, corrected only by the confirmations.
- **R6:** each `claimed` finding, the planted `:174` among them, had a verdict before the
  presentation: five `confirmed`, one `refuted`. No `unclear` came back, so the question path did
  not run.

## What the replay shows

- **The reviewer at effort `low` reads less than its brief names, and cites lines from `Bash`
  output.** Four of five reviewers read the code only through `Bash` output (`git diff`, `cat`),
  against `reviewer.md`'s "read each file with the `Read` tool, one per call"; S10.1's, on fable,
  used `Read`. S11.1's first report and all of S8.1's line numbers came from that output. A hunt finding is corrected by its
  confirmation; a Design candidate has none, and S11.1's was caught only because its lines passed
  the file's end.
- **The hunt finds the failures a step introduces, not always the one it was chosen for.** Both
  hunts found a real failure a later round fixed (S30.2 in its own words, S8.1's enqueue before
  commit); S8.1 missed the discarded answer and declared there was none.
- **Design hits one later change per step at most,** and misses a port's split roles (S10.1).
