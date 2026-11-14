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
| L5 | Одна минимальная поставка: экспорт из api и worker, `otel-lgtm` на worktree, одна трасса через SQS | minimal | build | done |
| L6 | Later: the items of the open list the owner picks | hard | build | todo |

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

### Output

Каждое сообщение пользователя — одна трасса в Grafana своего worktree: api `POST` → сервисы и
SQL → `QueueSender.send` → `process <queue>` worker'а → `LanguageModel.generateObject`, логи api и
worker внутри неё. Код: три строки `Otlp.layerFromConfig` в `layer.ts` каждого процесса;
`traceparent` через `MessageAttributes` в `packages/queue`; контейнер `grafana/otel-lgtm` в
`make up` с портами по `N`. Как увидеть: `make up` (печатает ссылку на Grafana), `make dev`,
скрипт README, затем Tempo → `{ resource.service.name = "api" && name = "POST" }`. Описание:
`docs/knowledge/observability.md`.

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
- Экспорт — три строки в `layer.ts` каждого процесса, без своего workspace: workspace окупится,
  когда появится общая логика, например flush в Lambda из `aws-deployment` (owner, 2026-11-14;
  L5).
- Бэкенд `grafana/otel-lgtm` поднимает `make up` всегда, без переключателя, по контейнеру на
  worktree: OTLP `4318 + 10N`, Grafana `3003 + 10N` (owner, 2026-11-14; L5).
- Span обработки называется `process <queue>`, kind `consumer`, по OTel semconv
  `{messaging.operation.name} {destination}` (L5).
- Переход локально → AWS — только переменные окружения, по сигналу: endpoint и `HEADERS` с
  bearer-ключом (L3; подтверждение на живом AWS — в `aws-deployment`).

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>

## Later

- e2e-стенд собирает `ApiLayer` (`apps/e2e/testing/stand.test-layer.ts:57`), а `bun` грузит
  `.env`: при заданных `OTEL_*` e2e шлёт трассы api в Grafana дерева, worker (`WorkerProcess`) —
  нет. Fate: dropped — неверно: стенд заменяет весь источник конфига
  (`ConfigProvider.layer(provider)`, `apps/e2e/testing/stand.test-layer.ts:83`), `OTEL_*` в нём
  нет, и `Otlp.layerFromConfig` в e2e ничего не шлёт (ревью L5, hunt).
- Поиск Tempo по тегу (`/api/search?tags=service.name%3Dapi` и TraceQL) не нашёл свежую трассу
  через ~20 с, по id она есть (прогон L5.1); проверить на visible check, не задержка ли индекса.
  Fate: done in L5.3 — задержка индекса: та же трасса нашлась поиском через ~2 мин; строка в
  `observability.md › Where to look`.
- Первый `QueueSender.send` api: `QueueClient.getUrl` 281 мс из 288 (трасса visible check L5),
  второй — 3 мс; похоже на холодный запрос к MiniStack, не смотрел. Fate: open.
- Endpoint OTLP без порта даёт `Number('')` = 0 в `deployment/local/telemetry.ts`: Docker выдаст
  случайный порт, приложения шлют мимо; у MiniStack на это есть отказ (`ministack.ts`), здесь нет.
  Fate: open.
- `Otlp.layerFromConfig` читает `OTEL_*` своим `Config`, мимо слоёв `kernel/config`
  (`.claude/rules/tooling.md`); так решено в Knowledge, но правило этого не говорит. С L5.3
  `OTEL_EXPORTER_OTLP_ENDPOINT` читают двое: Effect и `TelemetryConfig` (`kernel/config/config.ts`,
  для Pulumi). Варианты: строка-исключение в `tooling.md` или один читатель (ревью L5, Standards).
  Fate: open.
- Атрибут `traceparent` без `stringValue` (тип `Binary` от чужого отправителя) не проходит схему
  `SqsEvent` (`packages/queue/queue.consumer.ts:12`): `POST /events` отвергает весь пакет, и
  каждая его запись, верные тоже, доставляется заново до DLQ. Сейчас недостижимо: `QueueSender`
  пишет только `String`. Исправление — `stringValue: Schema.optionalKey(Schema.String)`
  (ревью L5, hunt, claimed). Fate: open.

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
