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
| L1 | Что видно из коробки: трасса одного запроса api в Grafana через `Otlp.layerFromConfig`, без кода в модулях | minimal | learn | in progress — Output предложен, ждёт «да» |
| L2 | Перенос трассы api → SQS → worker: что дают Effect и AWS SDK без ручного кода | minimal | learn | in progress — Output и `[D]` child предложены, ждут «да» |
| L3 | Локально и AWS одним конфигом: куда OTLP шлёт в AWS и что меняется только в переменных | minimal | learn | in progress — Output предложен; AWS не запускался |
| L4 | Паттерны интеграции: логи с trace id, LLM-вызовы, ошибки — из docs и `repos/effect` | minimal | learn | todo — большей частью закрыт прогоном L1, см. его Notes |
| L5 | Экспорт из коробки: `Otlp` layer в api и worker, `otel-lgtm` на worktree через `make up`, порты от N | minimal | build | todo |
| L6 | Одна трасса через SQS: `traceparent` в сообщении, span на запись в consumer, тест | minimal | build | todo |
| L7 | Later: the items of the open list the owner picks | hard | build | todo |

Запуск сборки в новом окне: `/lab implement L5` в основном дереве на ветке `feat/telemetry-minimal`;
draft-worktree `wt/telemetry-minimal-L1-otlp` — только reference, его код не копируется, после L5
и L6 он удаляется (`close L1`). Контейнеры `app-template-telemetry-4328` (Grafana
http://localhost:3013) и MiniStack 4576 оставлены поднятыми для проверки.

## L1 — Что видно из коробки

Reference: `repos/effect/ai-docs/src/08_observability/20_otlp-tracing.ts`, запущен как есть (две
правки: `BunRuntime` вместо `NodeRuntime`, которого нет в node_modules, и порт 4328 этого
worktree) против `docker run -d --name app-template-telemetry-4328 -p 3013:3000 -p 4328:4318
grafana/otel-lgtm:0.40.0`: трасса `checkout-api` в Tempo, логи в Loki
(`curl -u admin:admin 'localhost:3013/api/datasources/proxy/uid/tempo/api/search?tags=service.name%3Dcheckout-api'`).
Budget: reference + <N> lines

### Notes

[N:ai] Прогон 2026-11-13 в draft-worktree `wt/telemetry-minimal-L1-otlp`
(`/Users/v/lab/app-template/.claude/worktrees/telemetry-minimal-L1-otlp`, N=1: api 3010, worker
3012, MiniStack 4576, OTLP 4328, Grafana 3013). Правка в приложении — только `layer.ts` каждого
процесса, по 5 строк: `Otlp.layerFromConfig({ resource: { serviceName } })` с
`OtlpSerialization.layerProtobuf` и `FetchHttpClient.layer`; переменные — те, что уже лежат в
`.env` (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_{TRACES,LOGS,METRICS}_EXPORTER=otlp`). Одно
сообщение чата по README-скрипту дало трассу `7fba1ad71368defaffa79a56717b3d5d`, 80 спанов, корень
api `POST` 45 мс, целиком 136 с (ждала LLM).
  - Видно из коробки, без строки в модулях: server span с `http.route`, `url.path`,
    `http.response.status_code`, `client.address`; каждый `Effect.fn('<Service>.<method>')` —
    handler → use case → сервисы → репозитории (`ChatHandler.createMessage`,
    `CreateUserMessageUseCase.create`, `RunService.create`, `MessageRepository.insert`, …) и
    чистые проверки (`ensureChatNotBusy`); `sql.transaction` и каждый statement как `postgres` с
    `db.query.text`, `db.namespace`; `drizzle.operation`; `QueueSender.send` → `QueueClient.getUrl`;
    в worker — `GenerateAssistantMessageUseCase.generate` → `Assistant.reply` →
    `LanguageModel.generateObject` с `gen_ai.provider.name`, `gen_ai.request.model`,
    `gen_ai.response.id`, `gen_ai.usage.input_tokens=301`, `output_tokens=18`,
    `finish_reasons`, под ним HTTP-клиентский `POST https://api.anthropic.com/v1/messages` с
    `http.response.status_code`.
  - Ошибки видны сами: четыре `LanguageModel.generateObject` со `STATUS_CODE_ERROR`, событие
    `exception` с `exception.type=effect/ai/AiError/AiError`, сообщением
    `AnthropicClient.createMessage: TransportError: A network error occurred` и стеком; два вызова
    висели 75 с и 55 с до ошибки, третья попытка прошла за 3 с — поэтому ответ шёл 136 с.
  - Логи: каждая строка в Loki несёт `trace_id`, `span_id`, `service_name`, `effect_fiberId`,
    аннотации (`http_method`, `http_url`, `http_status`) и `severity_text`; выборка
    `{service_name=~"api|worker"} | trace_id="<id>"` отдаёт строки одной трассы (в этой — только
    `sql`-строки и `Sent HTTP response`). Консольный логгер остался (`mergeWithExisting` по
    умолчанию `true`, `OtlpLogger.ts:139`).
  - Метрики: приложение не экспортирует ни одной (`OTEL_METRICS_EXPORTER=otlp` даёт только
    `target_info`). Зато Tempo в `otel-lgtm` сам считает по спанам
    `traces_spanmetrics_calls_total` и `traces_spanmetrics_latency_bucket` по `service`,
    `span_name`, `status_code` (api GET 32, POST 3), и `traces_service_graph_*`; измерения `route`
    и `http status` в нём по умолчанию не включены — конфиг Tempo, не код.
  - Шум: имя server span — только метод (`POST`, `GET`), маршрут лишь в атрибуте; каждый опрос
    `GET /chats/…/messages` — отдельная трасса (32 за прогон); `POST /events` worker'а — своя
    трасса на 135 с рядом с трассой запроса.
  Пробы: `.data/ref/otlp-tracing.ts` в draft-worktree, `scratchpad/trace.json`.

### Output

[N:ai] Предложение. Пять строк в `layer.ts` каждого процесса и переменные `OTEL_*` дают трассу
запроса целиком внутри процесса: server span, каждый `Effect.fn('<Service>.<method>')`, каждый
SQL-statement с текстом, `LanguageModel.*` с `gen_ai.*` и HTTP-вызов к провайдеру, ошибки с
`exception`; логи с `trace_id`; метрик от приложения нет, по спанам их считает Tempo. Доказательство:
```ts
// apps/api/layer.ts, последний Layer.provide
Otlp.layerFromConfig({ resource: { serviceName: 'api' } }).pipe(
  Layer.provide([OtlpSerialization.layerProtobuf, FetchHttpClient.layer]),
)
```
и трасса `7fba1ad7…` в Tempo на 3013 (80 спанов). Подпись написать можно → L5.

## L2 — Перенос трассы api → SQS → worker

Reference: <the example, and how it was run as is> · Budget: reference + <N> lines

### Notes

[R] Как трасса одного запроса api продолжается в worker через SQS (api пишет job в outbox,
relay шлёт в SQS, worker за Lambda SQS mapping): что из этого делают сами Effect 4.0.6 и AWS SDK,
где нужен ручной код и сколько его минимум.
  [N:ai] Моя ошибка в вопросе: outbox и relay на `HEAD` нет — убраны в lambda
  (`docs/tickets/2026-11-08-1505_lambda/lab.md:179-181`, `decisions.md:567-575`); api шлёт в SQS
  прямо в запросе после commit (`create-user-message.use-case.ts:83-91`). Я предположил путь по
  памяти, не проверив код. Вывод: перед брифом исследователю — grep по текущей ветке.
  [A:ai] Сами — никто: ни Effect 4.0.6, ни AWS SDK v3 не несут span через SQS. Минимум — около
  15 строк в двух файлах `packages/queue` плюс flush в worker; оба researcher (opus high) сошлись,
  оба проверили запуском против установленного effect 4.0.6, но не через MiniStack или AWS.
  - Что есть из коробки: HTTP-сервер Effect продолжает входящий `traceparent`
    (`http/HttpMiddleware.ts:312-314`); `HttpTraceContext.toHeaders(span)` даёт `traceparent`,
    `HttpTraceContext.w3c(headers)` читает его в `Option<ExternalSpan>` (`http/HttpTraceContext.ts:44-54,
    180-205`). Свои очереди Effect несут `traceId/spanId/sampled` в payload и делают consumer
    ребёнком: `workflow/DurableQueue.ts:233-241, 315-335`, `rpc/RpcServer.ts:359-363`,
    `cluster/Envelope.ts:146-147`. Для SQS в `repos/effect` ничего нет; `@effect-aws/client-sqs`
    2.0.0 span'ов не открывает; AWS SDK ставит `X-Amzn-Trace-Id`/`traceparent` только как HTTP-
    заголовки на сам вызов `SendMessage` и только из контекста Lambda-runtime
    (`@aws-sdk/core … client/index.js:180-219`), на сообщение — ничего. OTel
    `instrumentation-aws-sdk` (не установлен) пишет `traceparent` в `MessageAttributes` на
    `SendMessage`, а читает только на `ReceiveMessage`, которого worker за Lambda mapping не
    вызывает; плюс нужен OTel SDK и `@effect/opentelemetry`.
  - Путь на `HEAD`:
    ```
    api POST /chats (server span) → CreateUserMessageUseCase.create
      → AssistantMessageSender.send / ChatTitleSender.send   (chat.sender.ts:45,74)
      → QueueSender.send ──sendMessage{QueueUrl, MessageBody}──▶ SQS   (queue.sender.ts:27-38)
    SQS ──Lambda mapping──▶ LWA ──POST /events──▶ WorkerHandler       (worker.handler.ts:35-48)
      → QueueConsumer.consume → run(record) на каждую запись           (queue.consumer.ts:43-68)
      → GenerateAssistantMessageUseCase.generate
    ```
    Один `POST /events` несёт до 10 записей из разных запросов, поэтому parent ставится на
    запись в `run`, не на server span. `SqsRecord` сейчас декодирует только `messageId`, `body`,
    `eventSourceARN` (`queue.consumer.ts:5-9`), атрибуты отбрасываются. MiniStack отдаёт
    `messageAttributes.<name>.stringValue` в camelCase (заметка lambda-лаборатории).
  - Минимальный дизайн, без изменений в `chat.queue.ts`, `chat.sender.ts`, `deployment/aws/queue.ts`:
    1. `queue.sender.ts` `send`: `Effect.currentSpan` (внутри `Effect.fn('QueueSender.send')` он
       есть) → `MessageAttributes: { traceparent: { DataType: 'String', StringValue } }` — ~5 строк.
    2. `queue.consumer.ts`: в `SqsRecord` optional `messageAttributes` (~3 строки); в `run`
       `HttpTraceContext.w3c(...)` из атрибута и `Effect.withSpan('<queue> process', { kind:
       'consumer', parent })` — ~6 строк. Не `Effect.linkSpans`: он вешает link на каждый
       вложенный span (`internal/effect.ts:6059-6066, 6181`, проверено запуском у A).
    3. `worker.handler.ts` `POST /events`: после `consume` — `OtlpExporter.Flusher.flush` с
       `Effect.timeoutOption` (~3 строки), иначе спаны ждут размораживания Lambda. Server span
       `/events` всё равно уходит позже: тracer закрывает его после отправки ответа
       (`http/HttpEffect.ts:113-114, 134-140`); A предлагает `HttpMiddleware.layerTracerDisabledForUrls(['/events'])`,
       1 строка, чтобы не плодить одиночные трассы.
    4. Тест в `packages/queue/__tests__/`: запись с `traceparent` получает этот parent (~10 строк).
  - Child против link (решение за owner):
    child — одна трасса: запрос → `QueueSender.send` → process → use case → SQL → LLM; длина
    включает ожидание в очереди и каждую повторную доставку (второе поддерево process); так
    делает `DurableQueue` Effect. link — две трассы, у process ссылка на span отправителя; из
    трассы запроса к job не перейти; так по умолчанию советует OTel messaging semconv («Process
    span MAY use the message's creation context as its parent» только для одиночных сообщений).
  - Расхождения A и B: B предлагает ещё «самый малый» вариант — `Effect.withParentSpan(span)` без
    своего span (~4 строки), тогда use case висит прямо под `QueueSender.send`, но нет span с
    временем доставки. B нашёл в LWA `lib.rs`: LWA регистрируется как extension, значит Lambda
    шлёт SIGTERM и даёт 2 с на shutdown — финальный flush Effect (3 с) надо ограничить ~1.5 с;
    у A это в непроверенном. A: `Flusher` достаётся из `Otlp.layerFromConfig` только через cast
    (тип `Layer<never>`); B: через `Effect.serviceOption(OtlpExporter.Flusher)` без cast, или
    `OtlpTracer.layerFromConfig`, типизированный `Layer<Flusher>`. Решающий прогон: один job через
    MiniStack с `otel-lgtm`, смотреть, долетает ли `messageAttributes.traceparent` до
    `POST /events` и склеивает ли Tempo поздний process span с трассой запроса.
  - Непроверено обоими: доставка атрибута через LWA 1.1.0 и MiniStack; поведение Tempo со
    span'ами, пришедшими спустя минуты; работает ли `instrumentation-aws-sdk` под Bun (не нужно
    для дизайна). Если вернётся outbox (roadmap 22, `jobs`), `traceparent` придётся хранить в
    строке.
  [N:ai] Прогон 2026-11-13 в том же draft-worktree, дизайн из `[A:ai]` в 3 файлах (~27 строк с
  пробами): три открытых вопроса закрыты запуском через MiniStack 1.5.31, без AWS.
  - `messageAttributes.traceparent.stringValue` доходит до `POST /events`: в логе worker
    `traceparent: "00-7fba1ad7…-4c163aece391bc5f-01"` (assistant-message) и `…-c86c90913aaa7447-01`
    (chat-title) — два span'а `QueueSender.send` одного запроса.
  - Child склеивается: Tempo отдаёт одну трассу с корнем api `POST` (45 мс) и под
    `QueueSender.send` — `assistant-message process` (136 с) → use case → `Assistant.reply` →
    LLM → SQL; `rootServiceName=api`. Поздние span'ы (через 2 минуты после корня) Tempo
    присоединил при чтении.
  - `Effect.serviceOption(OtlpExporter.Flusher)` в реальном графе `WorkerLayer` поверх
    `Otlp.layerFromConfig` — `Some` (лог `flusher present {present: true}` на оба батча), cast не
    нужен; `flush` с `Effect.timeoutOption('1 second')` отработал.
  [D:ai] Child: parent из `traceparent` сообщения, так одна трасса на сообщение пользователя —
  то, что просит Intent; link не даёт перехода из запроса в job. Цена: трасса длиной с ожидание в
  очереди и повтором доставки внутри.
  Пробы: `/private/tmp/claude-501/-Users-v-lab-app-template/d1eb9512-04e2-498e-8d66-32be591b099c/scratchpad/trace-exp/`.

### Output

[N:ai] Предложение. Через SQS контекст не несёт никто; одна трасса api → worker стоит ~15 строк в
`packages/queue`: отправитель кладёт `traceparent` текущего span'а в `MessageAttributes`, consumer
открывает span на каждую запись с этим parent (child). Доказательство: прогон через MiniStack,
трасса `7fba1ad7…` с корнем api `POST` и `assistant-message process` worker'а под
`QueueSender.send`:
```ts
// packages/queue/queue.sender.ts, в send
const span = yield* Effect.currentSpan.pipe(Effect.orDie)
const { traceparent } = HttpTraceContext.toHeaders(span)
// … MessageAttributes: { traceparent: { DataType: 'String', StringValue: traceparent } }
// packages/queue/queue.consumer.ts, в run
const parent = HttpTraceContext.w3c(Headers.fromInput({ traceparent }))
Effect.withSpan(`${definition.name} process`, { kind: 'consumer', parent: Option.getOrUndefined(parent) })
```
Подпись написать можно → L6.

## L3 — Локально и AWS одним конфигом

Reference: <the example, and how it was run as is> · Budget: reference + <N> lines

### Notes

[R] Какой приёмник телеметрии в AWS принимает OTLP/HTTP от Lambda и от сервиса, что в нём видно
(трассы, логи, метрики, связь лог ↔ трасса), и что отличает его конфиг от локального OTLP-приёмника
— только адрес и заголовки или больше.
  [A:ai] Три приёмника AWS берут OTLP/HTTP напрямую, без коллектора, и каждый с 2026 принимает
  статичный заголовок `Authorization: Bearer <API key>` вместо подписи SigV4, так что переход с
  локального приёмника — только переменные окружения, ноль кода. Researcher (opus high), ничего в
  реальный AWS не отправлялось.
  - Приёмники, по одному на сигнал, у каждого свой хост и свой ключ:
    трассы `https://xray.<region>.amazonaws.com/v1/traces` (нужен включённый Transaction Search);
    логи `https://logs.<region>.amazonaws.com/v1/logs` (обязательны заголовки `x-aws-log-group`,
    `x-aws-log-stream`, группа и поток созданы заранее, bearer включён на группе);
    метрики `https://monitoring.<region>.amazonaws.com/v1/metrics` (PromQL в CloudWatch).
    Все три: protobuf и JSON, только HTTPS, без gRPC.
    Источники: docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLPEndpoint.html,
    …/xray/latest/devguide/xray-opentelemetry-bearer-token.html,
    …/AmazonCloudWatch/latest/logs/CWL_HTTP_Endpoints_BearerTokenAuth.html,
    …/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLP-MetricsBearerTokenAuth.html.
  - Не подходят напрямую: Amazon Managed Service for Prometheus принимает только remote write,
    не OTLP; Amazon Managed Grafana — только UI поверх X-Ray и CloudWatch. ADOT Lambda layer для
    `provided.al2023` (наш runtime) не существует (aws-otel.github.io/docs/getting-started/lambda).
  - Что меняется в конфиге: вместо общего `OTEL_EXPORTER_OTLP_ENDPOINT` — три
    `OTEL_EXPORTER_OTLP_<SIGNAL>_ENDPOINT` (по-сигнальный берётся как есть, `/v1/<signal>`
    добавляется только к общему, `observability/internal/otlpEnv.ts:19-28`) и три
    `OTEL_EXPORTER_OTLP_<SIGNAL>_HEADERS` (по-сигнальный заменяет общий, не сливается с ним,
    `otlpEnv.ts:13-17`). Заголовки парсятся один раз и ставятся на фиксированный POST
    (`OtlpExporter.ts:199-208`); SigV4 экспортёр не умеет, его пришлось бы вешать на `HttpClient`
    через `mapRequestEffect`. Кодировка выбирается не переменной, а layer'ом
    (`OtlpSerialization.layerJson | layerProtobuf`), `OTEL_EXPORTER_OTLP_PROTOCOL` не читается.
  - Что видно в AWS: спаны в log group `aws/spans`, поиск по атрибутам в Transaction Search; логи
    с тем же trace id под трассой в Application Signals, но документирован этот путь только для
    ADOT SDK, для «upstream collector» Application Signals отмечен «No»
    (…/CloudWatch-OTLPGettingStarted.html). Не проверено: строит ли Application Signals карту
    сервисов из спанов нашего экспортёра; появится ли у логов `@xrayTraceId` для прыжка лог →
    трасса в Grafana; принимает ли metrics endpoint cumulative-темпоральность и summary Effect.
  - Локально: один контейнер `grafana/otel-lgtm` (0.41.0 от 2026-11-13) — collector + Tempo +
    Loki + Prometheus + Grafana; OTLP/HTTP на `:4318/v1/{traces,logs,metrics}`, UI на `:3000`;
    связки трасса ↔ лог уже настроены (`tracesToLogsV2`, `derivedFields` по `trace_id`). Хватает
    `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, `OTEL_<SIGNAL>_EXPORTER=otlp`,
    `OTEL_SERVICE_NAME`. Сигнал молчит, пока его `OTEL_<SIGNAL>_EXPORTER` не содержит `otlp`
    (`otlpEnv.ts:33-36`).
  - Lambda: экспортёр шлёт трассы каждые 5 с, логи 1 с, метрики 10 с (`OtlpTracer.ts:85-86`,
    `OtlpLogger.ts:82-83`, `OtlpMetrics.ts:398-400`); при закрытии scope — последний экспорт в
    пределах 3 с (`OtlpExporter.ts:251-262`); `OtlpExporter.Flusher.flush` сливает все три сигнала
    без закрытия scope (`OtlpExporter.ts:72-145`, проверено запуском; у `Otlp.layerFromConfig`
    тип `Layer<never>`, Flusher из него достаётся только через cast). После трёх неудачных
    попыток буфер сбрасывается и экспорт молчит 60 с (`:233-237`). Наши api и worker в AWS — Bun
    HTTP-сервер за Lambda Web Adapter (`docs/tickets/2026-11-08-1505_lambda/lab.md:20-21`), так
    что scope закрывается при остановке процесса, не на каждый вызов; таймеры стоят, пока среда
    заморожена; на shutdown Lambda даёт 0–2000 мс, меньше 3 с финального flush. AWS-рекомендаций
    по flush для OTLP SDK без ADOT не нашлось.
  - Предупреждение AWS: bearer-ключ — долгоживущий секрет IAM-пользователя (до 2 на
    пользователя); «предпочитайте SigV4 с короткими credentials».
  Пробы: `/private/tmp/claude-501/-Users-v-lab-app-template/d1eb9512-04e2-498e-8d66-32be591b099c/scratchpad/otlp-probe/`.

### Output

[N:ai] Предложение. Локально — один контейнер `grafana/otel-lgtm` (OTLP `:4318`, Grafana
`:3000`, связки трасса ↔ лог готовы; проверено прогоном L1). В AWS — X-Ray, CloudWatch Logs и
CloudWatch metrics принимают OTLP/HTTP напрямую с `Authorization: Bearer <API key>`; переход —
шесть переменных `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_{ENDPOINT,HEADERS}`, кода ноль (по
документации AWS и `otlpEnv.ts:13-28`; живой AWS не запускался — Later). Это конфиг, не код.

## L4 — Паттерны интеграции

Reference: прогон L1 · Budget: —

### Notes

[N:ai] Закрыт прогоном L1 в той мере, в какой нужен для сборки: логи с trace id, LLM-вызовы с
`gen_ai.*` и ошибки с `exception` приходят без кода. Остальное — чем аннотировать span'ы
(`Effect.annotateCurrentSpan`), что логировать в use case, семплирование — вопросы шага `right`
после того, как L5 и L6 сыграны.

### Output

## L5 — Экспорт из коробки

Reference: L1 (`20_otlp-tracing.ts` как есть, `otel-lgtm` 0.40.0, прогон одного сообщения) ·
Budget: reference + 60 lines — предложено, подтвердите или назовите своё

### Shape

[D:ai] Черновик, правьте:
- `kernel/telemetry/telemetry.ts`: `TelemetryFromConfig(serviceName: 'api' | 'worker')` —
  `Otlp.layerFromConfig({ resource: { serviceName } })` с `OtlpSerialization.layerProtobuf` и
  `FetchHttpClient.layer`; stage в ресурс через `OTEL_RESOURCE_ATTRIBUTES` из `.env`, не из кода.
  Без переменных `OTEL_<SIGNAL>_EXPORTER` слой молчит (`otlpEnv.ts:33-36`) — unit-тесты без
  контейнера как сейчас. `apps/api/layer.ts`, `apps/worker/layer.ts`: один `Layer.provide`.
- `deployment/local/telemetry.ts`: контейнер `grafana/otel-lgtm` (pinned digest) с именем
  `app-template-telemetry-<OTLP port>`, порты из `OTEL_EXPORTER_OTLP_ENDPOINT` и `GRAFANA_PORT`,
  поднимается только когда endpoint задан (reference: `git show
  feat/observability:deployment/local/telemetry.ts`); `make reset` убирает его (`NAME_TELEMETRY`
  в Makefile рядом с `NAME_MINISTACK`). Конфиг портов — `TelemetryConfig` в `kernel/config`.
- `.claude/skills/ticket-implement/worktree.sh`: порт OTLP `4318 + 10N`, `GRAFANA_PORT`
  `3003 + 10N` (основное дерево сейчас держит `GRAFANA_PORT=3002` = `WORKER_PORT` — коллизия,
  базу сменить на 3003). `.env.example`: блок `OTEL_*`, по умолчанию закомментирован.
- `docs/knowledge/observability.md` (новый, короткий: как смотреть трассу, что видно, как
  переключить на AWS) и строка в `tooling.md › Worktrees`.
- Проверка (visible): `make up` печатает ссылку на Grafana; README-скрипт одного сообщения; в
  Tempo трасса с server span, сервисами, SQL, `LanguageModel.generateObject`.

### Notes

### Pieces

### Output

## L6 — Одна трасса через SQS

Reference: L2 (`[A:ai]` обоих researcher, прогон через MiniStack) · Budget: reference + 30 lines
— предложено, подтвердите или назовите своё

### Shape

[D:ai] Черновик, правьте:
- `packages/queue/queue.sender.ts` `send`: `traceparent` текущего span'а (`Effect.currentSpan`,
  `HttpTraceContext.toHeaders`) как `MessageAttributes.traceparent` (`DataType: 'String'`).
- `packages/queue/queue.consumer.ts`: `SqsRecord.messageAttributes` optional
  `Record<string, { stringValue?: string }>`; в `run` — `Effect.withSpan('<queue> process',
  { kind: 'consumer', parent })`, parent из `HttpTraceContext.w3c`; без атрибута — обычный span
  под `POST /events`. Не `Effect.linkSpans` (вешает link на каждый вложенный span).
- Тест в `packages/queue/__tests__/`: запись с `traceparent` даёт span с тем `traceId`
  (`Effect.currentSpan` внутри `handle`); запись без — своим.
- Не в этом шаге (Later): flush перед ответом `POST /events` в Lambda; тишина `POST /events`
  как отдельной трассы.
- Проверка (visible): README-скрипт одного сообщения; в Tempo одна трасса с корнем api `POST`
  и `assistant-message process` worker'а под `QueueSender.send`.

### Notes

### Pieces

### Output

## Knowledge

<Only an accepted [D] or Output, written in the commit that settles it.>

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>

## Later

- Порты телеметрии на worktree: `worktree.sh` двигает только API/WEB/WORKER/AWS/RDS и STAGE,
  `OTEL_EXPORTER_OTLP_ENDPOINT` и `GRAFANA_PORT` остаются общими с основным деревом; в прогоне
  L1 выставлены руками (4328, 3013). Контейнер `otel-lgtm` на worktree — в Pulumi как
  MiniStack (reference: `git show feat/observability:deployment/local/telemetry.ts`). Fate: open.
- Два LLM-вызова висели 75 с и 55 с до `TransportError` и ушли на повтор; что это — таймаут
  клиента, сеть или политика повторов `AssistantLlmFromConfig` — не смотрел. Fate: open.
- Шум трасс: опрос `GET /chats/…/messages` и `/health` — трасса на каждый; `POST /events`
  worker'а — одиночная трасса рядом с трассой запроса (`HttpMiddleware.layerTracerDisabledForUrls`
  или семплирование). Fate: open.
- Метрики по маршруту и статусу: Tempo span metrics считают по `span_name` и `status_code`;
  измерения `http.route`/`http.response.status_code` — конфиг metrics-generator в `otel-lgtm`.
  Fate: open.
- Shutdown в Lambda: финальный flush экспортёра 3 с против окна 2 с (`OTEL_EXPORTER_OTLP_*_TIMEOUT`
  или `shutdownTimeout`), и flush до ответа на `POST /events`. Проверяется только на AWS.
  Fate: open.
- Приёмники AWS с bearer-ключом: ничего не отправлялось в живой AWS (включение Transaction
  Search, IAM API-ключи, log group). Fate: open, ждёт слова owner — стоит денег и секрета.
