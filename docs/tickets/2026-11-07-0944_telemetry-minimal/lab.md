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
| L1 | Что видно из коробки: трасса одного запроса api в Grafana через `Otlp.layerFromConfig`, без кода в модулях | minimal | learn | todo |
| L2 | Перенос трассы api → SQS → worker: что дают Effect и AWS SDK без ручного кода | minimal | learn | todo |
| L3 | Локально и AWS одним конфигом: куда OTLP шлёт в AWS и что меняется только в переменных | minimal | learn | todo |
| L4 | Паттерны интеграции: логи с trace id, LLM-вызовы, ошибки — из docs и `repos/effect` | minimal | learn | todo |
| L<last> | Later: the items of the open list the owner picks | hard | build | todo |

## L1 — Что видно из коробки

Reference: <the example, and how it was run as is> · Budget: reference + <N> lines

### Notes

### Output

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
  [D:ai] Child: parent из `traceparent` сообщения, так одна трасса на сообщение пользователя —
  то, что просит Intent; link не даёт перехода из запроса в job. Цена: трасса длиной с ожидание в
  очереди и повтором доставки внутри.
  Пробы: `/private/tmp/claude-501/-Users-v-lab-app-template/d1eb9512-04e2-498e-8d66-32be591b099c/scratchpad/trace-exp/`.

### Output

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

## L4 — Паттерны интеграции

Reference: <the example, and how it was run as is> · Budget: reference + <N> lines

### Notes

### Output

## Knowledge

<Only an accepted [D] or Output, written in the commit that settles it.>

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>

## Later

<The open list (`.claude/rules/sdd.md › Gates`): what the minimal feature leaves, edge cases,
hardening, open questions and optimisations, each with its `path:line` or step and its fate (open,
done in L<n>, moved to the roadmap's `Later`, dropped); a hard step takes one on the owner's word.>
