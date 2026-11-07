# Telemetry, minimal

> Ticket: `2026-11-07-0944_telemetry-minimal` · Source: conversation; [roadmap › observability](../../knowledge/roadmap.md#8-observability)
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

The `api` is blind. The code already names a span on most service calls, and Effect already opens
spans for each request and each database statement, but nothing sends them anywhere: a developer,
or an agent debugging for them, cannot see which calls a slow or failed request ran, nor which
statements it issued.

## Goal

Each request in the `api` leaves one trace: the request, the service calls on its path, the
database statements and the jobs it queues, with the logs written inside it. Telemetry leaves over
OTLP to whatever backend the environment names, so a new backend needs settings only. The
telemetry code is the least that gets there: wiring at the process's start and nothing in the
application code. The `worker`'s telemetry waits for the ticket that moves the queue's consumer to
a Lambda, so no telemetry code is written into consumption code about to be deleted.

## Context

Facts checked in the Effect 4.0.6 sources and on `main` (read, not run, unless noted):

- **The spans already exist.** `Effect.fn('<Type>.<method>')` opens a span; `main` has 87 of them,
  on handlers, use cases, services, repositories and the queue's sender. Unnamed `Effect.fn` and
  `Effect.fnUntraced` open none. No Effect option adds a span to a call that does not name one (a
  `Tracer` can rename or drop spans, not create them); a literal name per method is Effect's own
  convention in its docs and code.
- **The library opens the rest.** Effect's HTTP server opens a server span per request and
  continues an incoming `traceparent`. Drizzle's `effect-postgres` driver runs each statement on
  Effect's `SqlClient`, which opens a span per statement (`db.query.text`, without the parameters)
  and one per transaction.
- **A queued job is a span already.** Each `QueueSender.send` is a named span with the statement
  that writes the job's row; the span does not say which queue or job.
- **The browser already sends a `traceparent`.** The web client's `HttpClient` propagates by
  default and the `web` proxy forwards headers as they came, so the `api` would continue a trace
  whose root, the browser's span, never reaches a backend.
- **Export.** `Otlp.layerFromConfig` of `effect/observability` sends traces, logs and metrics over
  OTLP/HTTP where the standard `OTEL_*` variables say, with no OpenTelemetry SDK; a signal leaves
  only when its `OTEL_<SIGNAL>_EXPORTER` lists `otlp`. It needs a service name, from the code or
  `OTEL_SERVICE_NAME`. The app writes no metric of its own today.
- **The `api` becomes a Lambda.** The owner decided on 2026-11-07 that the `api` and the queue's
  consumer run as Lambdas ([roadmap › aws-deployment](../../knowledge/roadmap.md#9-aws-deployment)).
  Locally the `api` stays a Bun server. Not checked: whether the exporter's batch leaves before a
  Lambda freezes after its response.
- **A reference build.** The local branch `feat/observability` (unmerged, kept as reference) holds
  an earlier, larger design: the `OTEL_*` block of `.env`, a `grafana/otel-lgtm` container per
  worktree from `make up`, `make trace*` targets and `mcp-grafana` in `.mcp.json`. Its local
  backend was verified there on 2026-11-07.

## Scope

- Export of the `api`'s traces, logs and metrics over OTLP, configured by the environment.
- One trace per `api` request, starting at the `api`.
- A local telemetry backend per worktree, opt-in from `.env`; a browser UI, `make` targets that
  print traces and logs for an agent, and the backend's MCP server for Claude Code.
- `docs/knowledge/observability.md`, the glossary's Observability terms, the roadmap entry.

## Out of scope

- **The `worker`'s telemetry:** a trace per handled job, and no trace from idle polls. After the
  ticket that moves the consumer to a Lambda ([roadmap › aws-deployment](../../knowledge/roadmap.md#9-aws-deployment)).
- **`web` in the trace:** spans of the browser or of the `web` proxy. A later ticket; this one
  makes the `api` the trace's start.
- **One trace across the queue,** from the request through the job: no Effect library does it for
  SQS and the outbox. A later ticket.
- Export from a Lambda (`aws-deployment`, 9); metrics written by hand, Effect DevTools, health and
  readiness endpoints, log conventions, dashboards and alerts.

## Requirements

### Traces

- **R1** — WHEN a request reaches the `api`, THE SYSTEM SHALL record one trace of it, holding a
  span for the request, a span for each named service call on its path, a span for each database
  statement it issues and a span for each job it queues.
- **R2** — WHEN a page of the web app calls the `api`, THE SYSTEM SHALL start the trace at the
  `api`, so its root span is one the backend receives.
- **R3** — THE SYSTEM SHALL label every trace, log record and metric the `api` exports with the
  process (`api`) and the stage.
- **R4** — THE SYSTEM SHALL produce the spans of R1 from the names the code already carries and
  from its libraries, adding no telemetry code to modules, use cases, services or repositories.

### Logs and metrics

- **R5** — WHEN a log line is written inside a trace, THE SYSTEM SHALL carry that trace's id on the
  exported log record, so the logs of one trace can be found.
- **R6** — THE SYSTEM SHALL make the `api`'s requests measurable in the backend by their number,
  duration and errors, by route and status, with no metric written by hand.

### Export

- **R7** — WHERE the environment sets an OTLP address and the signals to send, THE SYSTEM SHALL
  send the `api`'s traces, logs and metrics to it with the headers the environment sets, so
  another OTLP/HTTP backend needs no code change.
- **R8** — WHERE no OTLP address is set, THE SYSTEM SHALL run as it does without telemetry: it logs
  to standard output, opens no connection to a backend, and the unit tests need no container.
- **R9** — IF the backend is unreachable, THEN THE SYSTEM SHALL keep serving and drop the telemetry
  it cannot send.

### Local backend

- **R10** — WHERE the developer's `.env` asks for it, WHEN a developer starts the local
  environment, THE SYSTEM SHALL start a telemetry backend with a name and ports of its own per
  worktree, and a reset SHALL remove it; without it, none starts.
- **R11** — WHILE the local backend runs, THE SYSTEM SHALL let a person open one browser UI to find
  a trace, the logs of that trace and the request figures of R6.
- **R12** — WHEN an agent asks for the latest traces, for one trace, or for the logs of one trace,
  THE SYSTEM SHALL print each as compact text in the terminal, and an agent in Claude Code SHALL be
  able to query the same backend through its MCP server.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | With the local backend up, send a chat's first message and fetch the request's trace: one root server span, child spans named after the handler, the use case and the services, statement spans carrying their SQL, and two job spans. |
| R2 | Load a page that calls the `api`, fetch that request's trace: its root is the `api`'s server span, with no missing parent. |
| R3 | Query the backend's service names: `api` appears with the stage as an attribute, on traces, logs and metrics. |
| R4 | Review the diff: no telemetry import, span or annotation added outside the process's start-up wiring and the web client's setting of R2. |
| R5 | Make a request that logs, ask the backend for logs by its trace id: those lines come back. |
| R6 | After some requests, one failing, query the backend for request count, p95 and errors by route and status: they match what was sent. |
| R7 | Point the address at a stub OTLP receiver with a header set: it receives traces, logs and metrics posts carrying the header. |
| R8 | Unset the address: `make test-unit` passes without Docker, and a running `api` logs as before and opens no connection to a backend. |
| R9 | Set the address to a closed port and call the `api`: the response succeeds. |
| R10 | With the `.env` block set, start two worktrees: both backends run at once on different ports; the reset removes the container. Without it, no backend starts. |
| R11 | Open the backend's address in a browser after R1: the trace, its logs and the request figures are findable. |
| R12 | Run the `make` targets for the latest traces, one trace and its logs: each prints text of the R1 trace; the MCP server answers a trace search for the same tree. |

## Open questions

For `/ticket-architecture`.

### Q1 — How does the `api` become the trace's start for a page's request (R2)?

- **Why it matters:** the browser propagates by default, and the `api` continues any caller's
  `traceparent`.
- **Options:** A — switch propagation off in the web's client, one line; B — drop the header in the
  `web` proxy, about three lines, which also cuts any other caller's.
- **Recommendation:** A, the least code; it reverts in one line when `web` joins the trace.

### Q2 — Where do the service name and the stage come from (R3)?

- **Why it matters:** Effect needs a service name; the processes share one `.env`, and the `api`
  will also run as a Lambda.
- **Options:** A — the name from the process's wiring and the stage from the app's config; B — both
  from `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES`, set per process by each launcher; no
  code, but every launcher must set them.
- **Recommendation:** A, since the process then labels itself wherever it runs.

### Q3 — Where do the request figures of R6 come from?

- **Why it matters:** the app writes no metric, and R6 forbids a hand-written one.
- **Options:** A — queries over the server spans in the backend (TraceQL metrics); B — the
  backend's span-metrics generator into Prometheus.
- **Recommendation:** whichever the local backend gives with no app code, measured in the plan.

### Q4 — Does the wiring leave room to flush on a Lambda?

- **Why it matters:** a Lambda may freeze before the exporter's batch leaves; the export itself is
  `aws-deployment`'s, but this ticket's wiring should not block a flush per invocation.
- **Options:** A — check how Effect's exporter flushes (scope close, interval) and note it for 9;
  B — leave it wholly to 9.
- **Recommendation:** A, one fact in `architecture.md`, no code.
