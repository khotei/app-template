# Roadmap

The tickets that turn this repository into **App Template**: a chat clone (user → message →
assistant reply, with attachments) built as a worked example of an Effect v4 modular monolith on
Bun, with Postgres, AWS and Pulumi, so that a new enterprise project starts from it in minutes.

This file is the **only place a future ticket exists** before `/lab init <slug>` starts it: each
entry below holds what a ticket is *for* (goal, scope, out of scope, dependencies, inherited
requirements, open questions); the *how* is decided in its lab. `init` seeds the lab's Intent from
the entry, and the entry's `Status` becomes a link to the ticket folder. At the lab's close, the
row is marked done and the entry's section goes, so the PR's squash carries both.

## How a ticket flows

```mermaid
graph LR
  R["roadmap entry<br/>(status: planned)"] --> F["/lab init &lt;slug&gt;<br/>docs/tickets/&lt;date&gt;_&lt;slug&gt;/lab.md"]
  F --> S["/lab step, implement, review, close ×N"] --> C["/lab close"]
  C --> PR["squash PR → main"]
  PR --> R2["roadmap entry<br/>(status: done, link)"]
```

- **One ticket = one branch `<type>/<slug>` cut from `main` = one squash-merged PR.**
- **`main` is the only long-lived branch:** the steps of a merged ticket stay in its PR's commit
  list and its `lab.md`; see [sdd.md › Roadmap and history](./sdd.md#roadmap-and-history).
- **Order below is the default, dependencies are the law.** A ticket may start when every entry in
  its `Depends on` is done. Two independent tickets may run in parallel on separate branches.
- **Facts expire.** Every `Facts` line carries the date it was checked; `/lab init` has a
  `researcher` re-check the ones it relies on.

## Tickets

| # | Ticket | Type | Depends on | Status |
|---|---|---|---|---|
| 1 | `template-bootstrap` | `chore` | — | done: [docs/tickets/2026-10-17-1508_template-bootstrap/](../tickets/2026-10-17-1508_template-bootstrap/feature.md) |
| 2 | `claude-toolkit` | `chore` | 1, 3 | done: [docs/tickets/2026-10-20-2313_claude-toolkit/](../tickets/2026-10-20-2313_claude-toolkit/feature.md) |
| 3 | `chat-core` | `feat` | 1 | done: [docs/tickets/2026-10-17-1748_chat-core/](../tickets/2026-10-17-1748_chat-core/feature.md) |
| 4 | `postgres-drizzle` | `feat` | 3 | done: [docs/tickets/2026-10-22-1915_postgres-drizzle/](../tickets/2026-10-22-1915_postgres-drizzle/feature.md) |
| 5 | `aws-local` | `feat` | 3 | done: [docs/tickets/2026-10-19-1448_aws-local/](../tickets/2026-10-19-1448_aws-local/feature.md) |
| 6 | `llm-providers` | `feat` | 5 | done: [docs/tickets/2026-10-29-1435_llm-providers/](../tickets/2026-10-29-1435_llm-providers/feature.md) |
| 7 | [`web-app`](#7-web-app) | `feat` | 3 (18 for assistant attachments) | planned |
| 8 | `observability` | `feat` | 3 | done, as `telemetry-minimal`: [docs/tickets/2026-11-07-0944_telemetry-minimal/](../tickets/2026-11-07-0944_telemetry-minimal/feature.md) |
| 9 | [`aws-deployment`](#9-aws-deployment) | `feat` | 4, 5 | planned |
| 10 | `client-publishing` | `chore` | 3 | done: [docs/tickets/2026-11-04-1131_client-publishing/](../tickets/2026-11-04-1131_client-publishing/feature.md) |
| 11 | [`workflow-cluster`](#11-workflow-cluster) | `feat` | 4, 8 | planned, exploratory |
| 12 | [`template-handoff`](#12-template-handoff) | `chore` | all above | planned |
| 13 | `ticket-folder-order` | `chore` | 3 | done: [docs/tickets/2026-10-20-2313_claude-toolkit/](../tickets/2026-10-20-2313_claude-toolkit/feature.md) |
| 14 | `toolkit-reading` | `chore` | 2 | done: [docs/tickets/2026-10-21-1347_toolkit-reading/](../tickets/2026-10-21-1347_toolkit-reading/feature.md) |
| 15 | `architecture-audit` | `refactor` | 4 | done: [docs/tickets/2026-10-27-1433_architecture-audit/](../tickets/2026-10-27-1433_architecture-audit/feature.md) |
| 16 | [`shared-files`](#16-shared-files) | `feat` | 15, 23 | planned |
| 17 | `docs-diet` | `docs` | 15 | done, as `lean-instructions`: [docs/tickets/2026-11-02-1820_lean-instructions/](../tickets/2026-11-02-1820_lean-instructions/feature.md) |
| 18 | [`assistant-files`](#18-assistant-files) | `feat` | 6, 23 | planned |
| 19 | [`openai-provider`](#19-openai-provider) | `feat` | 6 | planned |
| 20 | [`context-window`](#20-context-window) | `feat` | 6 | planned |
| 21 | [`bedrock-provider`](#21-bedrock-provider) | `feat` | 6, 9 | planned |
| 22 | [`jobs`](#22-jobs) | `feat` | 4, 23 | planned |
| 23 | `modular-monolith` | `refactor` | 15 | done: [docs/tickets/2026-10-31-0926_modular-monolith/](../tickets/2026-10-31-0926_modular-monolith/feature.md) |
| 24 | `attachment-storage-failures` | `fix` | 23 | done: [docs/tickets/2026-11-06-0947_attachment-storage-failures/](../tickets/2026-11-06-0947_attachment-storage-failures/plan.md) |
| 25 | `toolkit-quality` | `chore` | 17 | done: [docs/tickets/2026-11-04-1009_toolkit-quality/](../tickets/2026-11-04-1009_toolkit-quality/feature.md) |
| 26 | `domain-from-data` | `refactor` | 10 | done: [docs/tickets/2026-11-06-1005_domain-from-data/](../tickets/2026-11-06-1005_domain-from-data/plan.md) |
| 27 | [`rules-from-attachment-work`](#27-rules-from-attachment-work) | `docs` | 24 | planned |
| 29 | `sdd-stages` | `chore` | 2 | done: [docs/tickets/2026-11-07-1232_sdd-stages/](../tickets/2026-11-07-1232_sdd-stages/feature.md) |

The ticket `2026-10-16-1607_effect-setup` is **superseded at S12**; later tickets built what it
left.

### 7. `web-app`

- **Goal.** The chat UI a visitor uses: TanStack Start on React 19, `@effect/atom-react` for
  state over the typed client, Chakra UI v3 for components, streaming replies, attachment upload
  and inline placeholders, a chat list, all server-rendered and hydrated.
- **Scope.** `apps/web` rebuilt on TanStack Start (Vite 8, Nitro `bun` preset in dev); TanStack
  Router, Query and DB where they fit (intent recorded; see the open question); `effect/reactivity`
  atoms with `AtomHttpApi` over the web's generated client and `HydrationBoundary` for SSR; Chakra
  UI v3 theme in `packages/ui`; a nested `biome.json` (`"root": false, "extends": "//"`) with the
  `react` domain; the visitor cookie flowing through the Start server; the web `Dockerfile` or
  Nitro output for 9.
- **Out of scope.** Authentication; mobile; i18n.
- **Open questions for its feature phase.** TanStack Query and TanStack DB overlap with
  `AtomHttpApi` and atoms: which owns server state, which owns client state, or whether atoms alone
  suffice and Query/DB stay out; whether web client code may now import `effect` (today it is
  banned by Biome and must change for atoms); SSR of streams.
- **Re-read against `chat-core` (2026-10-20).** "Streaming replies" means, today, polling the
  assistant message until its status is terminal, since the api streams nothing and the worker
  writes snapshots; an SSE tail is `llm-providers`' (6) open question, so this ticket depends on
  3 alone for the reply and the upload, and on 6 only for assistant attachments and placeholders.
- **Re-read against `llm-providers` (2026-10-29).** The reply now arrives whole: no snapshots, so
  the client polls until the message is terminal and shows its text at once. The
  SSE tail is this ticket's to decide, if it still earns its place. Assistant attachments and
  placeholders moved to `assistant-files` (18).
  The visitor cookie is the user cookie of `chat-core`'s `CurrentUser` security.
- **Inherited from `architecture-audit`.** `make bundle-check` builds `apps/web/app/main.ts` with
  `bun build --metafile` and refuses any package of the bundle outside `browserPackages` in
  `apps/web/package.json`, naming its import chain; `client-publishing` (10) replaced the grep of
  service keys with it ([architecture.md › Boundary guards](architecture.md#boundary-guards)). On
  the new bundler: rebuild its command, have it write a metafile the check reads (its shape is
  Bun's today), clear the output dir before each build, and keep it in `make check`, which CI runs.
- **Facts (2026-10-17).** `@tanstack/react-start@1.169.3` (router 1.170, Vite ≥ 8, React 19 for
  the Bun preset, `aws_lambda` preset with streaming); `@chakra-ui/react@3.37.0`; Effect v4 atoms
  are `effect/reactivity/*` in core plus `@effect/atom-react@4.0.5` (React ≥ 19 only) with
  `ReactHydration.HydrationBoundary`; `@effect-atom/*` is the v3 line; no official TanStack bridge
  exists; nothing is called "Effect UI".
- **To weigh.** [Ideas to weigh › Smaller fits](#smaller-fits): `Sse`, and why not `eventlog`.

### 9. `aws-deployment`

- **Goal.** One Pulumi program deploys the api, the worker, Postgres, S3 and SQS to AWS, from the
  resource inventory `aws-local` (5) introduced, and the same program provisions MiniStack for the
  "true emulator" local mode, so a new project is live in one command.
- **Scope.** `deployment/` on Pulumi `runtime: bun`; Lambda packaging for api and worker (Lambda
  Web Adapter container is the official Bun path; the `bun-lambda` layer is the alternative), the
  web on its Nitro `aws_lambda` output or static hosting; Aurora Serverless v2 with auto-pause
  versus RDS; SQS event source mapping for the worker; secrets in SSM; the local mode where
  MiniStack runs the Lambdas in Docker from the same artefacts; CI deploying a preview stack;
  `docs/knowledge/deployment.md`.
- **Out of scope.** Multi-account or multi-region; a custom domain and CDN beyond the minimum; the
  web and the observability backend while `web-app` (7) and `observability` (8) have not landed:
  each adds its own resources to this program, and one that lands first is deployed here.
- **Decided (2026-10-19).** Split from `aws-local` (5); depends on `postgres-drizzle` (4), since
  the deployed processes need a shared database, and on 5, not on 7 or 8.
- **Decided (2026-10-21).** The applications never check or create their resources: the
  infrastructure provides them (`aws-local` D5 dropped the startup `verify`); `provision` in
  `packages/aws` serves the tests only (each test file creates its own resources in milliseconds,
  without the Pulumi CLI).
- **Open questions for its feature phase.** Cold starts of `@effect/platform-bun` on Lambda; whether
  `pulumi.dynamic.Resource`, unsupported under `runtime: bun`, is ever needed.
- **Facts (2026-10-17).** Pulumi ≥ 3.227 runs TypeScript under `runtime: bun` (no function
  serialisation, no dynamic providers); CLI 3.270, `@pulumi/aws` 7.51. Bun on Lambda: the official
  guide uses Lambda Web Adapter in a container (also gives response streaming for SSE);
  `provided.al2` is deprecated since 2026-07-31. MiniStack has no Lambda hot reload and runs
  non-Python runtimes in Docker, so the emulator mode verifies deployment artefacts; live
  development stays on `bun --watch` against MiniStack's queues and buckets.
- **Rechecked (2026-10-19).** Pulumi CLI 3.270.0, `@pulumi/aws` 7.51.1. Bun runs the program only
  under `runtime: bun`, as `deployment/local` runs; the AWS stack has no project file yet. Bun's
  Lambda guide (Lambda Web Adapter 1.0.1 in a container; 1.1.0 is current) says nothing about
  response streaming. `provided.al2023` replaces `provided.al2` (deprecated 2026-07-31). Aurora
  Serverless v2 pauses at 0 ACU and resumes in about 15 s; Postgres 18 is on RDS and on Aurora
  (Serverless v2 from 18.3). App Runner has been closed to new customers since 2026-04-30; AWS
  points to ECS Express Mode. Lambda Web Functions (2026-10-12) serve HTTP without an adapter, but
  only on `nodejs24.x`, so not under Bun. SQS event source mappings with `ReportBatchItemFailures`
  remain the recommended worker pattern.
- **Inherits from `aws-local` (2026-10-22).** Check on AWS what MiniStack cannot show: the
  `unbound` tag sent with `CreateMultipartUpload` and the lifecycle deletion it drives. Share one
  AWS client builder between `kernel/aws/aws.client.ts` and the tests' clients, and
  brand `Stage`.
- **Inherits from `postgres-drizzle` (2026-10-23).** The bucket with its lifecycle rule, the
  queues with their dead-letter queues and the RDS instance are already Pulumi resources, created
  on MiniStack by `deployment/local` (`provision.ts` is gone): `deployment/aws/{provider,database,
  storage,queue}.ts` take an `aws.Provider`, so the prod stack calls them without an endpoint,
  with Aurora or RDS settings and a managed password for the database. This ticket adds the
  migration command for a deployed stage. Locally `make up` sets `VCR_MODE=REPLAY_ONLY` to skip
  the provider's fixed waits; never on AWS.
- **Inherits from `llm-providers` (2026-10-30).** `deployment/` sets no LLM variables, so a
  deployed worker fails at start: it needs `LLM_REPLY_MODEL`, `LLM_TITLE_MODEL` and
  `ANTHROPIC_API_KEY` (in SSM). The api reads none of them.
- **Inherits from `lambda` (2026-11-08).** Dev runs the worker behind MiniStack's SQS mapping in
  proxy mode: the code stays on the host. The production build in dev, api and worker as real
  Lambda functions inside MiniStack (a Bun image with Lambda Web Adapter,
  `LAMBDA_EXECUTOR=docker`, a Function URL for the api), moved here unbuilt. Two researchers'
  runs, stopped before their reports and not rechecked: an image function answered through a
  Function URL with a cold start of 130–180 ms; a partial batch failure worked; the function
  reaches Postgres only at `host.docker.internal`, not at the `localhost` the RDS endpoint
  reports; a rebuild to an answer took about 2 s. Pulumi creating these functions was not run.
- **Inherits from `telemetry-minimal` (2026-11-14).** Two things only AWS can show, researched
  there with sources (`docs/tickets/2026-11-07-0944_telemetry-minimal/lab.md`, L3 and L6 Notes):
  the OTLP receivers (X-Ray traces, CloudWatch Logs and CloudWatch metrics take OTLP/HTTP directly
  with an `Authorization: Bearer <API key>` header; the switch from the local backend is the
  per-signal `OTEL_EXPORTER_OTLP_<SIGNAL>_{ENDPOINT,HEADERS}` variables, no code; Transaction
  Search, the keys and the log group must exist first; nothing was sent to a real account), and
  getting an invocation's telemetry out before Lambda freezes (Effect's exporter batches on an
  interval and the server span closes after the response; the reliable patterns are a flush
  before the response in the worker's `POST /events`, which `OtlpExporter.Flusher` gives in three
  lines, a flush after it held by an `INVOKE`-registered process, or the Collector extension
  copied into the image, since no ADOT layer exists for `provided.al2023`; the shutdown window is
  2 s with LWA, below the exporter's 3 s default).
- **Inherits from the design audit (2026-11-18).** A job's reader is released before its writer
  stops sending a field: a body with a field its schema no longer has decodes with the field
  dropped, while a reader of the old build refuses a body without it (`Missing key`), the case
  [aws.md › Queues](aws.md#queues) logs and acknowledges unrun. The reply and title jobs lost `chatId`
  this way.
- **To weigh.** [Ideas to weigh › Queue on SQS or in Postgres](#queue-on-sqs-or-in-postgres)
  decides whether the worker is a Lambda on SQS or a long-running poller, and where the relay
  runs; [Telemetry readable by an agent and on AWS](#telemetry-readable-by-an-agent-and-on-aws)
  the CloudWatch and X-Ray path.

### 11. `workflow-cluster`

- **Goal.** Decide, with a running example, whether `effect/workflow` and `effect/cluster` belong
  in the template: a durable multi-step flow (for instance: upload → extract text → summarise →
  notify) that survives restarts, compared with the plain job queue.
- **Scope.** A spike on `ClusterWorkflowEngine` with `SqlMessageStorage` and `SingleRunner`; the
  comparison written to `docs/knowledge/`; adoption or removal, recorded as a decision.
- **Out of scope.** Multi-node sharding in AWS.
- **Facts (2026-10-17).** Both modules are in `effect@4.0.5` (`@stability unstable`); the cluster
  runtime has HTTP and socket runners, SQL message storage and Kubernetes discovery, but no SQS
  transport.
- **To weigh.** [Ideas to weigh › Workflow on top of the queue](#workflow-on-top-of-the-queue).

### 12. `template-handoff`

- **Goal.** "Use this template" to a running, renamed project in ten minutes.
- **Scope.** `make rename SCOPE=@acme NAME="Acme"`; a checklist of what to delete (`docs/tickets/`
  of the template, the example domain if unwanted) and what to keep (`docs/knowledge/`, rules,
  skills); a fresh-clone rehearsal in CI; the README's "History and new projects" rewritten; the
  GitHub template flag verified; the toolkit items that matter only when the
  template changes hands, inherited from `claude-toolkit` (2): `claude plugin eval` cases for the
  `ticket-*` skills (they must be wrapped as a plugin to load), `/skill-doctor` as a periodic
  check, pinning `mattpocock-skills` by `sha`, `skillOverrides` for the plugin skills the wrappers
  never use, agent `memory`, `SessionStart` and `PostToolUse` hooks.
- **Out of scope.** A generator or CLI.

### 16. `shared-files`

- **Goal.** A user uploads files to a pool of their own and links them to a message or a chat
  later, instead of uploading for one message.
- **Scope.** The pool and the link as domain concepts (the glossary bans "File" for an attachment
  today, so the words come first); upload, list and delete of pool files; linking at send and to
  a chat; what the reply reads when a chat has linked files; the `shared-files` migration of
  today's `attachments` rows.
- **Out of scope.** Sharing between users; assistant-produced files (`assistant-files`, 18).
- **Inherits from `architecture-audit` (2026-10-27).** A file lives as long as its owner needs it:
  no expiry of unlinked files, so the 24-hour unbound lifetime and the `unbound` S3 tag go.
- **Inherits from `modular-monolith` (2026-10-31, done 2026-11-02).** Files are split out of
  `chat` into a module named `drive` (not `files`, the banned word for an attachment; not
  `bucket`, a technology). Chat owns the link between a message and a file, with a copy of the
  file's metadata taken at link time, so a chat's read stays one query; `drive` owns the pool and
  the bytes and knows no chat. The bytes and the rows are already the data layer's
  (`FileRepository` in `kernel/data/file`, the attachments' table in `kernel/data/attachment`),
  so `drive` is a new module of services over them, added by
  [architecture.md › Add a module](architecture.md#add-a-module); the pool's table is a new store
  in `kernel/data`. Chat reaches `drive` only through `drive`'s contract, and a send that links
  files is one use case over both modules, in one transaction. The split rewrites the records
  [Modules by capability](decisions.md#modules-by-capability) and
  [Files in the data layer](decisions.md#files-in-the-data-layer), whose *Revisit when* name this
  ticket.
- **Open questions for its feature phase.** Whether one file may be linked to several messages;
  whether deleting a chat deletes its linked files or only the links; the quota per user.
- **Status.** Planned.

### 18. `assistant-files`

- **Goal.** Files the way the Claude apps handle them: the user attaches Word, Excel, PowerPoint,
  CSV, Markdown, images and PDF; the assistant reads them and produces Word, Excel, PowerPoint,
  PDF, CSV and PNG files, shown in its text through placeholders.
- **Scope.** Anthropic's code execution tool with its `docx`, `xlsx`, `pptx`, `pdf` Skills and the
  Files API; uploading a user's file into the container; downloading produced files into S3 as
  attachments of the assistant message; the placeholder syntax; the `pause_turn` continuation;
  deleting files at Anthropic once copied; the e2e's scripted assistant producing a file; audio by a
  speech-to-text service.
- **Out of scope.** Providers other than Anthropic.
- **Open questions for its feature phase.** One container per chat or per reply; which files go
  to the model natively (images, PDF, text) and which through the container; how to send a
  `container_upload` block that `@effect/ai-anthropic` 4.0.6 cannot express (a local patch with
  an upstream PR, an own HTTP call, or converting on our side); the speech-to-text service
  (AWS Transcribe or another provider); retention, since code execution and the Files API are not
  zero-data-retention eligible.
- **Facts (2026-10-29).** Code execution, the Files API and Skills are GA, no beta header; Skills
  go in the request's `container.skills`; produced files are those written to `$OUTPUT_DIR` and
  come back as file ids in `bash_code_execution_tool_result`, downloaded with
  `GET /v1/files/{id}/content`; containers live 30 days; code execution costs $0.05 per container
  hour past 1 550 free hours a month per organisation, five minutes minimum, billed whenever a
  request holds files. `.docx` and `.xlsx` are not accepted by any message block, and no Claude
  model takes audio. `@effect/ai-anthropic` 4.0.6 passes `container` through its `Config` and
  surfaces tool results with file ids, but its prompt converter rejects any media type but
  images, PDF and text and has no `container_upload`; its generated Files API calls are awkward
  for binary uploads.
- **Inherits from `modular-monolith` (2026-11-02).** The prompts and the Anthropic calls live in
  chat's adapter `AssistantLlmFromConfig` (`application/chat/infrastructure/`), the provider's
  settings in `kernel/llm`; a produced file is stored through `FileRepository` in the data layer,
  its bytes kept before the row that binds them, since S3 joins no transaction. Files outside a chat
  reopen [Files in the data layer](decisions.md#files-in-the-data-layer).
- **Facts on AWS (2026-10-29).** Claude on Bedrock has no code execution, Files API, Skills, web
  search or Message Batches. Bedrock Converse `DocumentBlock` takes `docx`, `xlsx`, `csv`, `md`,
  `html` (how they are converted is undocumented). Bedrock Knowledge Bases answer with retrieved
  chunks, need an ingestion job and create no file: a fit for `shared-files` (16), not for a
  message's attachment. Amazon Quick's Microsoft 365 extensions are Office add-ins with no
  backend API. Bedrock Data Automation reads DOCX (as PDF), PDF, images and audio up to
  240 minutes, not `xlsx` or `pptx`, and creates no file. AgentCore Code Interpreter is the AWS
  way to create files (inline upload up to 100 MB, sessions up to 8 hours, $0.0895 per vCPU hour),
  driven by a tool loop we write. Claude Platform on AWS is Anthropic-run, billed through AWS,
  and has code execution, the Files API and Skills; its client is beta. MiniStack emulates
  Transcribe (canned transcript) and Knowledge Bases (lexical search), not Data Automation or the
  Code Interpreter.
- **To weigh.** [Ideas to weigh › Smaller fits](#smaller-fits): `Zip`, `Xml` and `workers` to
  turn Office files into text on our side.
- **Status.** Planned.

### 19. `openai-provider`

- **Goal.** OpenAI as a second value of the provider setting, behind the same structured reply.
- **Scope.** `@effect/ai-openai` layers; the reply and title schemas through OpenAI's structured
  output; its error mapping (a 429 for an exhausted quota is `QuotaExhaustedError`, not a rate
  limit).
- **Facts (2026-10-29).** `@effect/ai-openai@4.0.6` peers `effect ^4.0.6` and targets the Responses
  API; it rejects `text/plain` files and silently drops a PDF given as a plain base64 string, and
  OpenAI caps a request at 50 MB of files.
- **Status.** Planned.

### 20. `context-window`

- **Goal.** A long chat keeps answering: the history sent to the model is trimmed to the model's
  context window instead of failing every reply once it outgrows it.
- **Scope.** Dropping the oldest messages whole, never splitting one, always keeping the system
  prompt and the newest user message; failing with a user-facing reason when even that does not
  fit; counting tokens of attachments.
- **Facts (2026-10-29).** `effect/ai` `Tokenizer.truncate` drops the oldest messages whole but
  does not protect the system message; no provider package implements `Tokenizer`, so counting
  is ours (a heuristic or Anthropic's token-counting endpoint). An overlong prompt is a 400
  `InvalidRequestError` with no special mapping.
- **Status.** Planned.

### 21. `bedrock-provider`

- **Goal.** Claude on Amazon Bedrock as a third value of the provider setting, so a deployed
  project pays through its AWS bill and the worker authenticates with its IAM role instead of an
  API key.
- **Scope.** `@effect/ai-anthropic` against Bedrock's Anthropic Messages endpoint
  (`bedrock-mantle.<region>.api.aws/anthropic`) with a SigV4-signing `HttpClient` over the default
  credential chain; explicit cache points instead of the automatic top-level cache; a request
  timeout of at least two minutes for the first compile of a new schema; the IAM permission
  `bedrock-mantle:CreateInference` and model access in `aws-deployment` (9); the error mapping
  of Bedrock's gateway errors and its rate limits.
- **Out of scope.** Converse and `InvokeModel`; Bedrock-only services (Knowledge Bases, Data
  Automation, AgentCore), which belong to `assistant-files` (18) or `shared-files` (16).
- **Open questions for its feature phase.** Whether the endpoint accepts the provider's
  `?beta=true` query; how throttling surfaces and whether a wait is given; effort and thinking
  support; the global route or a regional profile (+10%).
- **Facts (2026-10-29).** `@effect/ai-amazon-bedrock` is Effect v3 only (0.17.0);
  `@effect-aws/client-bedrock-runtime@2.0.0` fits Effect 4 but is a client, not a
  `LanguageModel`. The endpoint takes the first-party request body; model ids
  `anthropic.claude-sonnet-5-5`, `anthropic.claude-haiku-5-5`. Structured output works through
  `output_config.format` (at most 12 optional and 16 union-typed properties, no length or range
  bounds, about 90 s to compile a new schema). The same model specs as Anthropic's (1M context,
  128K output); not supported: code execution, web tools, Files API, Skills, Message Batches,
  automatic prompt caching. Default quota 2M input tokens a minute, up to 5M on request.
  Billed through AWS Marketplace; the global route has no premium, regional profiles +10%;
  per-token prices were not readable from aws.amazon.com/bedrock/pricing and need the AWS
  calculator. MiniStack 1.5.31 emulates Bedrock Runtime with canned replies that fail a schema
  and does not emulate the Messages endpoint, so local runs call Anthropic.
- **Status.** Planned.

### 22. `jobs`

- **Goal.** Every job, whatever its queue, leaves one row that says where it stands and why it
  failed, searchable by what it is about; and deleting a chat or a file never waits on S3,
  however many files it holds: the request deletes rows only, and a job deletes the bytes.
- **Scope.**
  - The table `jobs` (renamed from `outbox` by `modular-monolith`) keeps one row per job with
    `status`, `attempts`, the last `error`,
    `updated_at`, and a GIN index (`jsonb_path_ops`) on `body`, so `body @> '{"chatId": …}'`
    finds a chat's jobs.
  - The statuses, the shared `Status` of `application/chat/domain/status.model.ts` whole:
    `idle` (written by `QueueSenderJobs.send`, not yet in SQS) → `queued` (the
    relay sent it; the job is in work) → `done` (the handler succeeded) or `failed` (its last
    attempt or its dead letter, with the error). The relay takes `idle` rows under `FOR UPDATE
    SKIP LOCKED` (a partial index on `status = 'idle'`) and marks them `queued` instead of
    deleting them. A run needs no status of its own: the queue's lock covers it.
  - The worker writes each outcome back by `queue` and `job_id`, which SQS carries in the
    message's attributes: a wrapper of `consumeQueue` in `kernel/queue`, since
    `packages/queue` knows no database.
  - Attachment deletions are jobs of this ledger: a statement-level trigger `AFTER DELETE ON
    attachments` (`REFERENCING OLD TABLE`) writes one `attachment-deletion` job with the deleted
    ids and their `chatId`, `messageId` and `userId`, whichever path deleted them (a chat's
    cascade, a message's, a user's delete of an unbound file), in the deleting statement. Its
    handler deletes the bytes by `FileRepository.delete`. `deleteChat` drops its
    `FileAttachmentService.deleteBytes` call; the repository's e2e checks the job the trigger
    writes.
  - The Run keeps its own status, its subset of the shared `Status`: it is the work's state,
    which the client polls and the guards read, not the job's; a message has none since
    `reply-run`.
  - The relay gets attempts and a dead letter of its own: today a job SQS refuses forever blocks
    its batch and re-sends the jobs before it on every poll.
- **Why a trigger.** It catches every path in the same statement, including a file a concurrent
  send binds between the attachments' read and the chat's delete, whose bytes today stay in S3,
  bound and never expired.
- **Open questions for its feature phase.** The retention of `done` rows; whether a `failed`
  job returns to `idle` by hand; how a deletion job of a very large chat splits its ids; what the
  worker does when Postgres refuses an outcome SQS has already settled.
- **Related, not in scope.** A chat with millions of messages: a soft delete (`chats.deleted_at`
  hiding the chat's reads) and a purge in batches, so the request deletes one row. Uploads into a
  chat (`POST /chats/:chatId/attachments`) with keys `chats/<chatId>/…`, which a delete clears by
  prefix listing.
- **Inherits from `llm-providers` (2026-10-30).** The relay already keeps its rows: it sets
  `sent_at` instead of deleting, over a partial index `WHERE sent_at IS NULL`. The ledger's
  statuses replace `sent_at`; nothing removes sent rows yet, which the retention question above
  now settles for every row.
- **Inherits from `modular-monolith` (2026-10-31, done 2026-11-02).** The table is `jobs`, read
  and written by `JobRepository` in `kernel/data/job`, so the statuses and the trigger are the
  data layer's, in this ticket's migration, the second since the schema restarted as one;
  `QueueSenderJobs`, the consumer and the relay live in `kernel/queue` over it, so the outcome
  write-back lands there; the handler of a deletion job calls `FileRepository.delete`. A deletion
  job carries work that outlives the request, which
  [Use cases above the modules](decisions.md#use-cases-above-the-modules) allows, never a
  module's reaction to another's write. `Status` belongs to `chat` (the chat's and the message's
  states); the jobs' states are a vocabulary of their own, since `queued` means "sent to SQS" for
  a job and "reply in work" for a message. The statuses rewrite
  [Jobs as queue messages](decisions.md#jobs-as-queue-messages), whose
  *Revisit when* names this ticket.
- **Inherits from `lambda` (2026-11-09) and `reply-run` (2026-11-11).** The Runs no worker
  settles: [Later › From `lambda-processes`](#from-lambda-processes) and
  [› From `reply-run`](#from-reply-run).
- **Facts (2026-10-30).** S3 lists by key prefix only and cannot list, delete or filter by
  metadata or tag; lifecycle rules filter by prefix, tag and size, a few static rules per bucket;
  `DeleteObjects` takes 1000 keys a request.
- **To weigh first.** [Ideas to weigh › Queue on SQS or in Postgres](#queue-on-sqs-or-in-postgres):
  Effect's `PersistedQueue` would give most of this ledger and delete our queue, at the cost of
  SQS. Decide it before this ticket's design.
- **Status.** Planned.

### 27. `rules-from-attachment-work`

- **Goal.** The rules, skills and checks say what the attachment refactors taught (entries 24 and
  26 and the PRs after them), so the next change puts each rule in its model and names each read
  for what it answers the first time, without the user restating it.
- **Sources.** The `Decision:` paragraphs of the commits `git log` holds for the work: the
  attachment fixes (`78349910f9`, `2de1db4f5a`, the model-rules refactor), the domain taking its
  values from the tables (`fb1b52383a`), the API contract (`e0bafb32ca`) and the file repository
  (`file-repository-verbs`). A later commit's decision replaces an earlier one it rejects (the
  bytes check moved from `getMany` to a model function and then to the send), so a rule is taken
  from the last standing decision, not the first.
- **Intent of the work.** Each change moved a decision to the place whose name states it, and made
  what a call costs or drops visible in its name: the model decides, a repository answers data in
  one entity shape, a service names what it guarantees, a use case reads and composes. A lesson is
  worth a line only if it keeps the next change from being moved a second time.
- **Scope.** One line, or one mechanical check, per lesson, each in a named rule or skill and
  applied on the user's OK:
  - **A rule is a pure function of its model, and no other layer builds its refusal.** It recurred
    three times: the lost-bytes check inside `getMany`, `AttachmentService` building
    `AttachmentNotFoundError` twice, an expiry filter inside a read. `layering.md` states the rule;
    the proposal is a check: a value import of a domain error class (a type import stays) is
    refused in `services/` and `use-cases/`, as a Biome `noRestrictedImports` pattern.
  - **A read's name says what it answers.** `getMany` dropped expired attachments without a word
    and a reader learned it from the source. A method applies no rule its name does not state; a
    rule goes to the caller (`getOne(where).pipe(ensure<Rule>(at))`) or to a service named for it
    (`Live<Model>Service`, over the plain one).
  - **A service over another service of the same model.** Done: `layering.md` lets a service
    composed over `<Model>Service` see it, and `decisions.md › Layered services of one model`
    records the split.
  - **A use case reads, then pipes the model's rules.** The send reads its attachments through
    `FileAttachmentService.getMany`, which runs `ensureAllStored` over the records and the stored
    bytes it reads, then pipes `ensureAllReachableFrom` and `ensureAllUnbound` on the answer: each
    read a service call, each rule one pipe step, no branch or refusal of its own.
    `layering.md › Use cases` and `modules.md › A rule or a capability in a use case` get the
    example as a neutral pattern, not the live names.
  - **A rule series reads as one family.** `is<State>At` predicates stay private, each exported
    guard is `ensure<All><State>` with the same shape (`ensureLive` beside `ensureAllLive`), and a
    one-element rule takes the element, not an `Option`.
  - **Repository reads.** A value the store derives is a field, presence is `selectMany`, never a
    probe through another verb (done in `file-repository-verbs`; this entry checks that the rule
    and its record say it).
  - **The workflow.** Check the code before stating a cause (the "expired draft" claim was wrong);
    research a usage tree before a refactor; an answer of "yes" to two questions is two answers.
  - **A plain layer takes its filters from the caller.** The plain `delete` hardcoded the unbound
    guard, the plain `getMany` hid the live check: each is a rule in a layer named for records.
    The layer that checked the rule passes its guard in the `where`
    (`records.delete({ id, userId, messageId: null })`); `layering.md` says so beside the
    layered-services line.
  - **A set goes through one call, though the rule exists.** `layering.md` already asks for one
    batch call, and it recurred three times: `files.url` per attachment, a `forEach` of single
    `update`s, a `forEach` of reads. The proposal is a review-rules line naming the symptom
    (`Effect.forEach` whose callback is one repository call over an id) and, if it finds no false
    positive on the tree, a GritQL pattern.
  - **A verb that takes a list is tested with one id missing.** The fake and the e2e twin each
    covered the whole list only: the order of `selectMany` (S1.2) and a partial `delete` (S3.4)
    were found by review. `effect-tests.md` gets one line: a verb over a list has a case for a
    list with one id that misses, in the repository's e2e.
  - **A split moves tests with the methods.** After the service split the new service's tests
    repeated the expiry and not-found cases of the services below (S3.2). `effect-tests.md` has
    "a rule once, at the lowest seam"; the line adds that a wrapping service's test holds only
    what it adds.
  - **A step's Test first is checked against the interface it changes.** S2 planned a red case
    for a list `update` already took, and S1's probe expected two red cases where four were red.
    A step reads the current signature before it promises a red case.
- **Out of scope.** New domain behaviour; rewriting a rule the session did not touch.

## Later

What a ticket's `Later` leaves unresolved at its PR: edge cases, error paths, hardening, open
questions. One section per ticket; each item says what goes wrong, with its `path:line`, why it
was left, and the ways out to weigh. A ticket that takes an item moves it into its own `Later`
and deletes it here.

### From `lambda-processes`

- (2026-11-09) A reply that never settles leaves its chat `queued` for good, so every next send
  fails `ChatBusyError`: a job whose body no longer decodes is failed unrun, so the reply's use
  case never runs; every delivery of a job dies, 3 receives, and nothing reads the dead-letter
  queue; or the queue drops its messages (a purge, a replaced queue, SQS's retention, 4 days by
  default and unset in the inventory). Ways out to weigh: the handler gets the undecodable body
  to fail its own work, a consumer of the dead-letter queues, or a sweep of active replies
  ([database.md › Stuck Runs](database.md#stuck-runs)).
- A third writer of a failed Run, such as a consumer of the dead-letter queues, takes the reply
  use case's fail or adds `RunService.fail`; with the two writers of today the method was built
  at +40 -36 and adds more than it removes.

### From `reply-run`

- (2026-11-11) A Run stays `queued` for good, its chat busy, when the api dies or the client
  aborts the request between the commit and the reply's send (the `queue.send` of
  `application/use-cases/chat/create-user-message.use-case.ts` and
  `application/use-cases/chat/retry-run.use-case.ts`): a send SQS refuses fails the Run, but no
  handler runs in a dead process or past an interrupt. Ways out to weigh: a send that cannot be
  interrupted (the abort only), the job ledger of entry 22, a sweep of active Runs. The owner
  refused a rule by a Run's age.
- (2026-11-13) Two sends or two retries of one chat that arrive within the few milliseconds between
  the check and the insert (two tabs, a client that resends) both pass `ensureChatNotBusy`; the
  active Run's index refuses the second insert, which dies, so the client gets a bare `500`, not
  `409 ChatBusyError`; a double click, its second request arriving after the first Run is stored,
  already gets the `409` (`RunRepository.insert`, `RunService.create`). Left: a lost race dies by
  [database.md › Guards](database.md#guards), and no client offers a retry button yet. Ways out to
  weigh: the insert fails a typed `RunActiveError` that `RunService.create` maps to
  `ChatBusyError` (an exception to `deep-modules.md`'s "a write dies where it misses"), or a
  `SELECT … FOR UPDATE` on the chat before the check.
- (2026-11-13) A retry reads the chat's newest Run, then inserts its own; a send of a newer
  message whose Run commits and fails between the two lets the insert pass the active Run's index,
  so an older message holds the chat's newest Run, against `ensureRunRetryable`'s premise
  (`application/use-cases/chat/retry-run.use-case.ts`, the chat's read and `runs.create`).
  Claimed by a review, not reproduced: it needs a send, a retry and a failure in one gap of
  milliseconds. Ways out to weigh: the insert also refuses a Run of a message older than the
  chat's newest, or a row lock on the chat before the check.
- (2026-11-13) `listMessages` reads the chat, then its messages in a second query, so a delete
  between the two answers `200 []`, not `404 ChatNotFoundError`; the next read gives the `404`
  (`application/use-cases/chat/list-messages.use-case.ts`). Way out: one query that reads the
  chat with its messages, or the two reads in one `REPEATABLE READ` transaction: `Transaction`
  opens with a plain `BEGIN`, so Postgres's default `READ COMMITTED` gives each statement its own
  snapshot.
- (2026-11-13) No e2e runs a worker's lost race of a completion
  (`application/use-cases/chat/generate-assistant-message.use-case.ts`, `settleCompleted`): its
  unit case mocks the Run's refused write, and `TransactionTest` takes nothing back. Way out: an
  e2e of the completion's race.
- (2026-11-13) Errors without context: `MessageInputInvalidError` covers two reasons alike
  (`application/chat/domain/message.model.ts:51`, `:55`), `AttachmentTooLargeError` names neither
  the limit nor the file (`apps/api/attachment/attachment.handler.ts:30`),
  `AttachmentTypeUnsupportedError` not the type sent (`:50`), `RunNotRetryableError` not why,
  `ChatBusyError` not the Run in work, the assistant's errors only `error.message`
  (`toFailedError` in `application/chat/infrastructure/assistant.llm.ts`); `UserUnknownError`
  stays empty, so no secret reaches a reply or a log. Left: the lab's step for it was skipped.
  First check, by a run, which of an error's fields reach the api's and the worker's logs and
  spans.

### From `telemetry-minimal`

- (2026-11-15) Tempo's metrics per route and status lump every `POST` route into one line: its
  span metrics count by span name and status, and the api's server span is named by the method
  alone (`POST`), so `http.route` and `http.response.status_code` need dimensions in
  `otel-lgtm`'s metrics-generator config. Left: the minimal feature reads traces, not metrics.
  Ways out to weigh: those dimensions in the generator's config, or a server span named
  `<method> <route>`.
- (2026-11-15) The api's first `QueueSender.send` spends 281 ms of its 288 in
  `QueueClient.getUrl`, the second 3 ms (a trace on the local stand). Left: not looked into; it
  looks like a cold request to MiniStack. Ways out to weigh: measure it on AWS before acting, or
  resolve the queue's URL once when the layer is built.
- Entry 8's scope that the ticket narrowed away: `web` in the trace, Effect DevTools, health and
  readiness endpoints, and log conventions.

## Ideas to weigh

Options raised outside a ticket, **not decided**: the plan above stands until a ticket's feature
phase weighs one. Each holds what it would bring, what it would cost, and what to check first.
Raised on 2026-11-02 by a review of Effect's modules (`effect@4.0.6`, Jose from `4.1.1`) for
hand-written code they could replace; only the queue qualified.

### The toolkit after `toolkit-quality`

What its third verification left open
([verification.md › run 3](../tickets/2026-11-04-1009_toolkit-quality/verification.md)).

- **Brings:**
  - **R4, a known limit:** the hunt names a discarded result and clears it. In 3 of 4 runs it
    did not name the foreign-key 500 that `Effect.asVoid` hid on `postgres-drizzle` S8.1. A line
    in `reviewer.md` would ask it to follow the hidden failure to what the caller returns.
  - **A rate, not one run:** a requirement on what a model does passes when it holds in N of M
    runs (say 3 of 5). Otherwise R4 passes and fails by chance.
  - **Its lesson L3:** a lesson about an agent's tool habit proposes a check of the output, never
    a hook.
- **Costs:** a step or two in a later toolkit ticket; the rate makes a no-op run five times longer.
- **Check first:** the R4 line by a no-op run of five on S8.1, with the line and without it.

### Post-edit type diagnostics

For Claude Code's LSP ([tooling.md › Claude Code's LSP](tooling.md#claude-codes-lsp)).

- **Brings:** a type error shown to the agent right after its edit, before `make check`.
- **Blocked by:** TypeScript 7 serves only pulled diagnostics, and Claude Code reads only pushed
  ones. A typescript-go maintainer (microsoft/typescript-go#2362): "We only support pull
  diagnostics (`textDocument/diagnostic`) … It's a significant architectural change to use push
  diagnostics, which we haven't looked into yet." No `anthropics/claude-code` issue on pull
  diagnostics was found (`gh search issues`, 2026-11-03).
- **Revisit when:** Claude Code pulls diagnostics, or typescript-go pushes them; then drop
  `"diagnostics": false` from the server entry in `.misc/claude/`.
- **Rejected:** a stdio proxy that pulls and re-pushes, which is protocol code the template would
  keep.
- Raised on 2026-11-03 by `lean-instructions` S23.

### Queue on SQS or in Postgres

For `jobs` (22) and `aws-deployment` (9), and the record
[Jobs as queue messages](decisions.md#jobs-as-queue-messages).

- **The option.** Effect's `PersistedQueue` (`effect/persistence`) with `layerStoreSql` keeps
  the jobs in a Postgres table and replaces our queue: `packages/queue` (`consumeQueue`,
  `QueueSender`, `QueueTransport` over SQS), `kernel/queue` (`QueueSenderJobs`, `JobRelay`,
  `QueueConsumerSqs`), `kernel/data/job`, the dead-letter handlers and definitions, the SQS queues
  in `deployment/`, three queue variables: about 610 lines of code and 960 of tests.
- **What Postgres would bring.**
  - No relay: `offer` writes through the current `SqlClient`, so inside the send's transaction
    the job commits with the message (assumed from the code, to prove by one e2e). One system
    holds a job's whole state, so 22's question "what the worker does when Postgres refuses an
    outcome SQS has already settled" disappears.
  - Per row `state` (`pending` → `processing` → `completed` or `failed`), `attempts` and
    `last_failure`: most of 22's ledger without writing it. `layerCleanup` for retention.
  - Retries by `maxAttempts` and a `retrySchedule` replayed from the stored attempt count;
    `offer` with `delay`; de-duplication by `id`; an interrupt does not cost an attempt, as it
    does on SQS.
  - `layerStoreMemory` with the same semantics, so tests above the queue run without Docker.
- **What SQS gives that Postgres would lose.**
  - Monitoring without code: CloudWatch metrics per queue (messages visible, in flight, age of
    the oldest), alarms on a dead-letter queue's depth, messages browsable in the console, and a
    built-in redrive from a dead-letter queue back to its source. In Postgres all of this is ours
    to build, as SQL or as metrics of `observability` (8).
  - A worker that is not always on: a Lambda event source mapping scales consumers with the
    backlog and to zero, billed per use. A Postgres queue needs a long-running poller (ECS), paid
    while idle.
  - A database that can sleep: Aurora Serverless v2 pauses at 0 ACU, which 9 weighs; a poller
    every second never lets it. Today's `JobRelay` also polls Postgres, so this holds for the
    current design too until 9 says where the relay runs.
  - Load kept off the database: a backlog's receives, retries and locks hit SQS, not the rows
    the api reads; a queue table updated on every attempt needs its vacuum watched.
  - Other AWS services can send or consume (EventBridge Pipes, SNS) without database access.
  - The template shows AWS integration, which is part of its purpose.
- **What Postgres would cost besides.** `@stability unstable` (may change in a minor of
  `effect`); the library creates its own table (`CREATE TABLE IF NOT EXISTS`), outside the one
  Drizzle migration ([One initial migration](decisions.md#one-initial-migration)); the job body
  is `TEXT`, not `jsonb`, so 22's search `body @> '{"chatId": …}'` needs an index of ours; 22's
  trigger would write into the library's private table; it reverses `aws-local` D1.
- **Rejected already.** Postgres locally and SQS on AWS: `aws-local` D1 refused two queue
  semantics under one interface.
- **Check before deciding.** An e2e that a rolled-back send leaves no job; where the relay runs
  if the worker becomes a Lambda; the cost of an always-on ECS worker against Lambda at this
  template's load; whether CloudWatch's SQS metrics are something the team would really watch.

### Workflow on top of the queue

For `workflow-cluster` (11).

- **What it is.** The durable engine is `ClusterWorkflowEngine.layer` (needs `Sharding` and
  `MessageStorage`; `WorkflowEngine.layerMemory` is for tests). One process runs it on
  `SingleRunner.layer({ runnerStorage: 'memory' })`, with `SqlClient` and `Crypto`, in the
  tables `cluster_messages`, `cluster_replies` and `cluster_migrations` that its own migrations
  create. `Activity` stores and replays a step's result, `DurableClock` is a timer that survives
  restarts, `DurableDeferred` a wait an outside call completes, `DurableQueue` hands work to a
  worker over `PersistedQueue`.
- **What it would bring.** Multi-step flows that resume after a crash without our own state
  machine (18's upload → extract → summarise is the first candidate).
- **What it would cost.** A long-running runner (no Lambda), no SQS transport, tables outside the
  Drizzle migration, `@stability unstable`.
- **To weigh.** Today's jobs are one step each, so Workflow brings nothing until a multi-step flow
  exists; if the queue moves to Postgres, `DurableQueue` sits on the same `PersistedQueue`. The
  spike needs no tracing, so its dependency on 8 may drop.

### Authentication with Jose

No ticket yet; `chat-core` decided that today's user later merges into an account.

- **Today.** `identity`'s `UserService` issues 32 random bytes as a base64url secret in an
  `HttpOnly` cookie, stores only its SHA-256, and resolves the user by that hash on every request
  through the `Auth` middleware. A session is revoked by deleting its row. No JWT exists.
- **What Jose is.** `effect/jose`, from `effect@4.1.1` (2026-10-30; `4.1.2` current),
  `@stability unstable`, on Web Crypto through the new `effect/crypto`, no third-party
  dependency. `Jwt.sign` and `Jwt.verify` decode claims with a `Schema`; `Jwt.verifyWithKeySet`
  resolves keys through `Jwks`; `Jwks.layerRemote({ url })` fetches and caches a provider's key
  set (10-minute TTL, 30-second cooldown for unknown `kid`s, one request shared by concurrent
  callers, redirects refused); JWE only with `dir` and A256GCM; HS, RS, PS, ES and EdDSA, compact
  serialisation only. No `HttpApiSecurity` or middleware helper: a bearer check is ours.
- **Where it would bring something.** Signing in through an external provider (Cognito, Auth0,
  any OIDC): `Jwks.layerRemote` is the part we would otherwise write.
- **What it would cost.** Moving the catalog from `effect@4.0.6` to `4.1.x` (no changelog found).
  Replacing today's session rows with signed tokens saves one query a request but loses
  revocation (expiry or a deny-list instead): a change of behaviour, not a simplification.

### Telemetry readable by an agent and on AWS

For `observability` (8) and `aws-deployment` (9).

- **The need.** Telemetry a person reads locally, an agent (Claude Code) queries from the
  terminal while it debugs, and the deployed app shows on AWS; the user works in Vim.
- **Facts.** No tracer is installed, though every `Effect.fn('<name>')` opens a span (68 in
  `application`, `kernel` and `apps`). `Otlp.layer({ baseUrl, resource, headers, compression })`
  sends logs, metrics and traces over OTLP/HTTP and takes an `HttpClient`; `Logger.consoleJson`
  writes JSON lines. AWS takes OTLP/HTTP at `https://xray.<region>.amazonaws.com/v1/traces` and
  `https://logs.<region>.amazonaws.com/v1/logs`, signed with SigV4; ECS and Lambda ship stdout
  to CloudWatch Logs. Grafana's `mcp-grafana` queries Loki; a community `lgtm-mcp` also reads
  Tempo traces. Not checked: an AWS MCP server for CloudWatch Logs and X-Ray.
- **Options to weigh.** A local backend with an HTTP query API (Grafana's `otel-lgtm` image, or
  Jaeger for traces only) behind `make` targets that print a trace or a trace's logs as compact
  text, against an MCP server; JSON logs on stdout carrying trace ids, so `make dev`'s output and
  CloudWatch read alike; X-Ray signed in-process by a SigV4 `HttpClient` (the one
  `bedrock-provider` (21) needs) against an ADOT collector sidecar.
- **Not a fit.** `effect/devtools`: its tracer streams only to the VS Code extension "Effect Dev
  Tools", and its debugger panels need VS Code too.

### Smaller fits

- `effect/encoding` `Sse` (unstable): the codec for an SSE tail in `web-app` (7), if one earns
  its place. `Base64Url` and `Hex` are already used for the user secret.
- `effect/encoding` `Zip` and `Xml`: `.docx`, `.xlsx` and `.pptx` are zip archives of XML, so
  `assistant-files` (18) could turn them into text without a third-party library; check their
  stability tags first.
- `effect/workers` (`BunWorker`, `BunWorkerRunner` in `@effect/platform-bun`): runs CPU-heavy
  work, such as that conversion, on a worker thread.
- `effect/eventlog`: not a fit; it syncs an event journal between offline-capable clients and a
  server, so it would replace the data layer of a chat whose source of truth is the server.
