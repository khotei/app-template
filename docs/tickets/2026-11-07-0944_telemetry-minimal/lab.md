# Telemetry, minimal

Flow: lab · Worktree: —

## Intent

Оператор видит одну трассу на сообщение пользователя: HTTP-запрос в api → вызовы сервисов → SQL →
отправка в SQS → worker → ответ LLM, с логами внутри трассы. Локально смотрим в Grafana (контейнер
на worktree), в prod — сервис AWS; переключение только конфигурацией, провайдер один. В коде
приложения — ноль телеметрии: только layer в точке запуска процесса и конфиг. Известно: Effect сам
открывает span на запрос, на SQL-statement и на `Effect.fn('Name')`; через SQS трассу никто не
переносит сам — это главное неизвестное.

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
