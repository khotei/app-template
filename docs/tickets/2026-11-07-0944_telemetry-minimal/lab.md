# Telemetry, minimal

Flow: lab · Worktree: —

## Intent

Оператор видит одну трассу на сообщение пользователя: HTTP-запрос в api → вызовы сервисов → SQL →
отправка в SQS → worker → ответ LLM, с логами внутри трассы. Локально смотрим в Grafana (контейнер
на worktree), в prod — сервис AWS; переключение только конфигурацией, провайдер один. В коде
приложения — ноль телеметрии: только layer в точке запуска процесса и конфиг. Известно: Effect сам
открывает span на запрос, на SQL-statement и на `Effect.fn('Name')`; через SQS трассу никто не
переносит сам — это главное неизвестное. Телеметрия работает в каждом worktree и уникальна для
него: свой приёмник, свои порты и имена, worktree не видят трассы друг друга.

## Map

| Step | Goal | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | Что видно из коробки: трасса одного запроса api в Grafana через `Otlp.layerFromConfig`, без кода в модулях | minimal | learn | done |
| L2 | Перенос трассы api → SQS → worker: что дают Effect и AWS SDK без ручного кода | minimal | learn | done |
| L3 | Локально и AWS одним конфигом: куда OTLP шлёт в AWS и что меняется только в переменных | minimal | learn | done |
| L4 | Паттерны интеграции: логи с trace id, LLM-вызовы, ошибки — из docs и `repos/effect` | minimal | learn | done (в L1) |
| L5 | Одна минимальная поставка: экспорт из api и worker, `otel-lgtm` на worktree, одна трасса через SQS | minimal | build | todo |
| L6 | Later: the items of the open list the owner picks | hard | build | todo |

Запуск сборки в новом окне: `/lab implement L5` в основном дереве на ветке `feat/telemetry-minimal`.
Draft-worktree L1 удалён при закрытии; его код не копируется, reference — строка Reference L1.

## L1 — Что видно из коробки

Reference: `repos/effect/ai-docs/src/08_observability/20_otlp-tracing.ts`, запущен как есть (две
правки: `BunRuntime` вместо `NodeRuntime`, которого нет в node_modules, и порт worktree) против
`docker run -d --name app-template-telemetry-<port> -p <grafana>:3000 -p <port>:4318
grafana/otel-lgtm:0.40.0`: трасса `checkout-api` в Tempo, логи в Loki
(`curl -u admin:admin 'localhost:<grafana>/api/datasources/proxy/uid/tempo/api/search?tags=service.name%3Dcheckout-api'`).

### Output

Пять строк в `layer.ts` каждого процесса и переменные `OTEL_*` дают трассу запроса целиком внутри
процесса: server span с `http.route` и статусом, каждый `Effect.fn('<Service>.<method>')` от
handler до репозитория, `sql.transaction` и каждый statement с `db.query.text`,
`LanguageModel.generateObject` с `gen_ai.*` (модель, id ответа, токены) и HTTP-вызов к провайдеру,
ошибки как событие `exception` с типом, сообщением и стеком; каждая строка лога в Loki с
`trace_id` и `span_id`. Метрик приложение не шлёт; Tempo считает по спанам `calls_total` и
`latency_bucket` на каждый span (сервис, имя, статус). Доказательство — прогон одного сообщения
чата (трасса из 80 спанов, корень api `POST` 45 мс, целиком 136 с из-за двух зависших LLM-вызовов):
```ts
// apps/api/layer.ts, последний Layer.provide
Otlp.layerFromConfig({ resource: { serviceName: 'api' } }).pipe(
  Layer.provide([OtlpSerialization.layerProtobuf, FetchHttpClient.layer]),
)
```
Подпись написать можно → L5.

## L2 — Перенос трассы api → SQS → worker

### Output

Через SQS контекст не несёт никто: ни Effect 4.0.6, ни AWS SDK v3, ни `@effect-aws/client-sqs`.
Одна трасса api → worker стоит ~15 строк в `packages/queue`: отправитель кладёт `traceparent`
текущего span'а в `MessageAttributes`, consumer открывает span на каждую запись с этим parent
(child, как `DurableQueue` самого Effect). Доказательство: прогон через MiniStack 1.5.31 — атрибут
доходит до `POST /events`, Tempo отдаёт одну трассу с корнем api `POST` и `assistant-message
process` worker'а под `QueueSender.send`, поздние спаны присоединяет при чтении:
```ts
// packages/queue/queue.sender.ts, в send
const span = yield* Effect.currentSpan.pipe(Effect.orDie)
const { traceparent } = HttpTraceContext.toHeaders(span)
// … MessageAttributes: { traceparent: { DataType: 'String', StringValue: traceparent } }
// packages/queue/queue.consumer.ts, в run
const parent = HttpTraceContext.w3c(Headers.fromInput({ traceparent }))
Effect.withSpan(`${definition.name} process`, { kind: 'consumer', parent: Option.getOrUndefined(parent) })
```
Подпись написать можно → L5.

## L3 — Локально и AWS одним конфигом

### Output

Локально — один контейнер `grafana/otel-lgtm` (OTLP `:4318`, Grafana `:3000`, связки трасса ↔ лог
готовы; проверено прогоном L1). В AWS — X-Ray, CloudWatch Logs и CloudWatch metrics принимают
OTLP/HTTP напрямую с `Authorization: Bearer <API key>`; переход — шесть переменных
`OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_{ENDPOINT,HEADERS}`, кода ноль (документация AWS и
`observability/internal/otlpEnv.ts:13-28`; живой AWS не запускался — roadmap `aws-deployment`).
Это конфиг, не код.

## L4 — Паттерны интеграции

### Output

Закрыт прогоном L1: логи с trace id, LLM-вызовы с `gen_ai.*` и ошибки с `exception` приходят без
кода. Чем аннотировать span'ы (`Effect.annotateCurrentSpan`), что логировать в use case,
семплирование — вопросы шага `right` после того, как L5 сыгран.

## L5 — Одна минимальная поставка

Reference: L1 и L2 (`20_otlp-tracing.ts` как есть, `otel-lgtm` 0.40.0, прогон одного сообщения
через MiniStack) · Budget: reference + 90 lines (owner: любой, одна минимальная поставка;
назван агентом)

### Shape

[D:ai] Черновик, правьте. Одна поставка, три группы, каждая — своя piece:

Экспорт:
- `apps/api/layer.ts`, `apps/worker/layer.ts`: последний `Layer.provide` —
  `Otlp.layerFromConfig({ resource: { serviceName } })` с `OtlpSerialization.layerProtobuf` и
  `FetchHttpClient.layer`, без своего workspace; stage в ресурс через `OTEL_RESOURCE_ATTRIBUTES`
  из `.env`, не из кода. Без переменных `OTEL_<SIGNAL>_EXPORTER` слой молчит (`otlpEnv.ts:33-36`).

Контейнер на worktree:
- `deployment/local/telemetry.ts`: контейнер `grafana/otel-lgtm` (pinned digest) с именем
  `app-template-telemetry-<OTLP port>`, порты из `OTEL_EXPORTER_OTLP_ENDPOINT` и `GRAFANA_PORT`,
  поднимается всегда (reference: `git show feat/observability:deployment/local/telemetry.ts`,
  без его `Option`); `make reset` убирает его (`NAME_TELEMETRY`
  в Makefile рядом с `NAME_MINISTACK`). Конфиг портов — `TelemetryConfig` в `kernel/config`.
- `.claude/skills/ticket-implement/worktree.sh`: порт OTLP `4318 + 10N`, `GRAFANA_PORT`
  `3003 + 10N` (основное дерево сейчас держит `GRAFANA_PORT=3002` = `WORKER_PORT` — коллизия,
  базу сменить на 3003). `.env.example`: блок `OTEL_*`, включён.
- `docs/knowledge/observability.md` (новый, короткий: как смотреть трассу, что видно, как
  переключить на AWS) и строка в `tooling.md › Worktrees`.

Трасса через SQS:
- `packages/queue/queue.sender.ts` `send`: `traceparent` текущего span'а (`Effect.currentSpan`,
  `HttpTraceContext.toHeaders`) как `MessageAttributes.traceparent` (`DataType: 'String'`).
- `packages/queue/queue.consumer.ts`: `SqsRecord.messageAttributes` optional
  `Record<string, { stringValue?: string }>`; в `run` — `Effect.withSpan('<queue> process',
  { kind: 'consumer', parent })`, parent из `HttpTraceContext.w3c`; без атрибута — обычный span
  под `POST /events`. Не `Effect.linkSpans` (вешает link на каждый вложенный span).
- Тест в `packages/queue/__tests__/`: запись с `traceparent` даёт span с тем `traceId`
  (`Effect.currentSpan` внутри `handle`); запись без — своим.

Не в этой поставке: flush перед ответом `POST /events` в Lambda и живой AWS — roadmap
`aws-deployment` (9), owner 2026-11-14.

Проверка (visible): `make up` печатает ссылку на Grafana; README-скрипт одного сообщения; в Tempo
одна трасса с корнем api `POST`, под ним сервисы, SQL, `QueueSender.send` и `assistant-message
process` worker'а с `LanguageModel.generateObject`.

### Notes

- [N:ai] Shape принят (owner, 2026-11-14) с двумя правками по пяти вопросам: экспорт тремя
  строками в `layer.ts`, без `kernel/telemetry` (вопрос 1: workspace дороже двух копий; причина
  для него появится, если `aws-deployment` добавит общий flush); контейнер поднимается всегда,
  без `Option` (вопрос 1: ветка лишняя, Intent — телеметрия в каждом worktree). Порядок pieces:
  экспорт → трасса через SQS → контейнер на worktree и docs.

### Pieces

- [N:ai] L5.1 Экспорт из api и worker: 12 строк в двух `layer.ts`, теста нет — контракт виден
  только прогоном. Прогон: `otel-lgtm` 0.40.0 вручную (Grafana `:3003`, OTLP `:4318`), api через
  `bun --env-file=../../.env --env-file=../../.env.pulumi main.ts`, `GET /health` → лог в Loki с
  `trace_id`, по этому id Tempo отдаёт трассу с `service.name=api`. `make check` зелёный.

### Output

## Knowledge

- Каждый входящий HTTP-запрос — корень трассы, и это не глушится: `POST /events` worker'а и
  опросы остаются отдельными трассами, их отсеивают в UI (owner, 2026-11-14).
- Всё, что проверяется только на AWS, — flush телеметрии из Lambda и приёмники AWS с
  bearer-ключом — делает тикет `aws-deployment` (9), не этот; здесь экспорт работает по
  интервалу, как локально (owner, 2026-11-14).
- Span обработки сообщения в worker — ребёнок `QueueSender.send` из трассы запроса (parent из
  `traceparent` в `MessageAttributes`), не отдельная трасса со ссылкой: одна трасса на сообщение
  пользователя; её длина включает ожидание в очереди, а каждая повторная доставка SQS добавляет
  в неё ещё одно поддерево `process` (owner, 2026-11-14; L2).
- Экспорт — `Otlp.layerFromConfig` в `layer.ts` процесса и переменные `OTEL_*`; в модулях, use
  cases, сервисах и репозиториях телеметрии нет: спаны дают `Effect.fn('<Service>.<method>')`,
  HTTP-сервер, `SqlClient`, `LanguageModel`, логи несут `trace_id` сами (L1, L4).
- Переход локально → AWS — только переменные окружения, по сигналу: endpoint и `HEADERS` с
  bearer-ключом (L3; подтверждение на живом AWS — в `aws-deployment`).

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>

## Later

- e2e-стенд собирает `ApiLayer` (`apps/e2e/testing/stand.test-layer.ts:57`), а `bun` грузит
  `.env`: при заданных `OTEL_*` e2e шлёт трассы api в Grafana дерева, worker (`WorkerProcess`) —
  нет. Fate: open.
- Поиск Tempo по тегу (`/api/search?tags=service.name%3Dapi` и TraceQL) не нашёл свежую трассу
  через ~20 с, по id она есть (прогон L5.1); проверить на visible check, не задержка ли индекса.
  Fate: open.
- `Otlp.layerFromConfig` читает `OTEL_*` своим `Config`, мимо слоёв `kernel/config`
  (`.claude/rules/tooling.md`); так решено в Knowledge, но правило этого не говорит. Fate: open.

- Порты телеметрии на worktree: `worktree.sh` двигает только API/WEB/WORKER/AWS/RDS и STAGE,
  `OTEL_EXPORTER_OTLP_ENDPOINT` и `GRAFANA_PORT` остаются общими с основным деревом; в прогоне
  L1 выставлены руками. Fate: done in L5 (Shape, группа «контейнер на worktree»).
- Два LLM-вызова висели 75 с и 55 с до `TransportError` и ушли на повтор; что это — таймаут
  клиента, сеть или политика повторов `AssistantLlmFromConfig` — не смотрел. Fate: open.
- Шум трасс: опрос `GET /chats/…/messages` и `/health` — трасса на каждый; `POST /events`
  worker'а — одиночная трасса рядом с трассой запроса. Fate: оставить как есть — слово owner
  2026-11-14: откуда бы ни дёргали worker, его вызов и лог не теряются; в UI фильтруется
  (`{ resource.service.name = "worker" && name = "POST" }` в TraceQL).
- Метрики по маршруту и статусу: Tempo span metrics считают по `span_name` и `status_code`;
  измерения `http.route`/`http.response.status_code` — конфиг metrics-generator в `otel-lgtm`.
  Fate: open.
- Shutdown в Lambda: финальный flush экспортёра 3 с против окна 2 с (`OTEL_EXPORTER_OTLP_*_TIMEOUT`
  или `shutdownTimeout`), и flush до ответа на `POST /events`; варианты — `[A:ai]` в истории L6
  (`git log -p -- docs/tickets/2026-11-07-0944_telemetry-minimal/lab.md`, раунд L6.2).
  Fate: moved to roadmap `aws-deployment` (9), owner 2026-11-14.
- Приёмники AWS с bearer-ключом: ничего не отправлялось в живой AWS (включение Transaction
  Search, IAM API-ключи, log group). Fate: moved to roadmap `aws-deployment` (9), owner 2026-11-14.
