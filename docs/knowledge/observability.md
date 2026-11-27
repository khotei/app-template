# Observability

How an operator follows one user message through the system: one trace from the api's request to
the worker's reply, with the logs inside it. The words: a *trace* is the tree of spans of one
request; a *span* is one timed operation in it.

## What a trace shows

The api's `POST` is the trace's root. Under it come the services' `Effect.fn('<Service>.<method>')`
spans, `sql.transaction` and each statement with `db.query.text`, then `QueueSender.send`. The
worker's `process <queue>` span (kind `consumer`, named after OTel's messaging conventions) hangs
under that send, and under it each handler of the queue (`ChatHandler.<work>`), its SQL and
`LanguageModel.generateText` (a reply) or `LanguageModel.generateObject` (a title) with `gen_ai.*`
attributes (model, response id, tokens). A failure is a span event `exception` with its type,
message and stack. Every log line carries `trace_id` and `span_id`. Tempo derives `calls_total` and
`latency_bucket` per span name and status; the apps send no metrics of their own.

Every incoming HTTP request is a trace root, so the worker's `POST /events` and the web's polls
are traces of their own beside the user's; filter them out in the query
(`{ resource.service.name = "worker" && name = "POST" }` selects the first).

## Where to look

`make up` always runs `grafana/otel-lgtm`, one per tree with no switch, and prints its Grafana link
(`admin`/`admin`); the ports follow the tree's `N` ([tooling.md › Worktrees](tooling.md#worktrees)).
In Grafana, Explore → Tempo for traces (TraceQL `{ resource.service.name = "api" }`), Loki for logs
(`{service_name="api"}`); a log line links to its trace by `trace_id`. Tempo's search lists a trace
a while after it ends (within two minutes on the local stand), while a trace opened by its id
responds at once. An empty Grafana with the apps running means the container is down: a failed export
turns its exporter off for 60 s and says so only at `Debug` level. The backend keeps its data inside
the container, so `make down` followed by `make up`, which replaces the container, starts it empty.

## How it is wired

- Each process's `layer.ts` ends with `Otlp.layerFromConfig({ resource: { serviceName } })`; the
  `OTEL_*` variables of `.env` decide what leaves, and without an `OTEL_<SIGNAL>_EXPORTER` nothing
  does. No module, service or repository holds telemetry code, and there is no telemetry
  workspace: one pays off once logic shared by processes appears, such as the flush before a
  Lambda invocation ends.
- The trace crosses SQS in the message: `QueueSender.send` puts its span's W3C `traceparent` into
  the message attributes, and `consumeQueue` runs each record in a consumer span with that parent.
  The process span is a child, not a link: one trace per user message, so its length includes the
  wait in the queue, and each redelivery adds one more `process` subtree.

## On AWS

The same variables point at AWS's OTLP endpoints (X-Ray for traces, CloudWatch for logs and
metrics, a bearer key in `OTEL_EXPORTER_OTLP_<SIGNAL>_HEADERS`); the code does not change. The
flush before a Lambda invocation ends and the live check are the roadmap's `aws-deployment`.
