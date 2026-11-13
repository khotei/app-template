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
