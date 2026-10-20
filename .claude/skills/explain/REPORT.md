# Explain report

The walkthrough the `explainer` agent returns and `/explain` renders. Sections in this order, each
present (a section with nothing to say states so in one line). Prose in Russian; identifiers,
paths and terms as in the code; `path:line` under every claim about the code.

## Sections

### 1. TL;DR

Three to five sentences: what was built, how it sits in the system, what to hold in mind. Then
**«Три идеи»**: the three concepts a reader must carry to follow the rest.

### 2. Карта изменений

A Mermaid `flowchart LR` of the modules in scope and their neighbours. One `subgraph` per layer
(`domain`, `infrastructure`, `application`, `http-api`, `apps`, `packages`), so the import direction
is visible. `A --> B` means "A depends on / calls B"; label the edge when the relation is not
obvious (`-->|"enqueues job"|`).

```
classDef added fill:#d4f7d4,stroke:#2a2
classDef changed fill:#fff3c4,stroke:#c90
```

New nodes `added`, edited nodes `changed`, untouched neighbours unstyled. Over ~15 nodes, one
diagram per subsystem.

### 3. Основной поток

A Mermaid `sequenceDiagram` per scenario the change adds or alters (request → handler → service →
port → adapter → response; or job polled → step → store). At most three; name each with the
requirement it serves (`R21`).

### 4. Сущности

For each new or substantially changed module (service, handler, layer, schema, job, port,
repository), in dependency order:

**`Name`** — `path/to/file.ts`
- **Имя:** why it is called this; the glossary term it carries, if any.
- **Зачем:** the problem it solves, one or two sentences; the `R…` or `D…` behind it.
- **Интерфейс:** what callers must know: the signature, the errors in `E`, the services in `R`,
  invariants, ordering. Code, short.
- **Как работает:** the key steps in plain words.
- **Кто использует / от чего зависит:** importers and imports, by path.
- **Нюансы:** non-obvious choices, side effects, edge cases, assumptions.
- **Глубина:** deep (small interface, much behaviour) or shallow (interface mirrors
  implementation), in `codebase-design` terms, one line.

### 5. Effect здесь

Mandatory when the scope has `.ts` files.

- **Типы:** for each service and exported function, `Effect<A, E, R>` spelled out: what it yields,
  which failures it can raise, which services it needs.
- **Композиция Layer'ов:** a Mermaid `flowchart` of the layers in scope: which `Layer` provides
  which service, what it requires, where `Layer.provide` chains end in the runtime
  (`BunRuntime.runMain`, the api's `layer.ts`, the worker's `layer.ts`).
- **Канал ошибок:** where failures are caught or mapped (`catchTag`, `mapError`, `HttpApiBuilder`
  status mapping) and which stay in `E` for the caller.
- **Комбинаторы и API:** each Effect, `effect/http-api`, `@effect/platform*` or `@effect/vitest`
  API that appears, on its first appearance only:
  - **Что это** — the concept in two or three sentences.
  - **Как применено здесь** — `path:line`.
  - **Минимальный пример** — 5–15 lines, isolated, not a copy of the project.
  - **Почему так, а не проще** — the problem this choice solves.
  - **Подводные камни** — the frequent mistakes.
  - **Дока** — the file in `repos/effect` or `ai-docs/src` that confirms it.

### 6. Решения, уже принятые

The `D…` of `architecture.md` and the `Decision:` paragraphs of the commits in scope, each in plain
words with its rejected alternative, cited (`D32`, `f20c6a0`). No new decisions are derived here.

### 7. Контракты

| Контракт | Было | Стало | Кого затрагивает |
|---|---|---|---|

Endpoints (`method path`, statuses), schemas, errors, ports, config keys, env variables. "Ничего не
менялось" when so.

### 8. Куда смотреть глазами

Three to seven `path:line` ranges, ordered by risk, one phrase each on why.

### 9. Вопросы

What the code leaves unclear or assumes without an `R…` or `D…` behind it: questions for the
reader to settle.

### 10. Для ревью

Optional, at most a few one-liners: a smell or a doubt the reader may hand to `code-review`.

## HTML scaffold

`/explain` renders the Markdown into this self-contained page; the agent returns Markdown only.
Mermaid 11 and Tailwind come from CDNs: no local dependency, one network round-trip on open.

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Explain: {{scope}} — {{date}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      pre.mermaid { background: white; border: 1px solid #e2e8f0; border-radius: .5rem;
                    padding: 1rem; }
      pre.code { background: #0f172a; color: #e2e8f0; border-radius: .5rem; padding: 1rem;
                 overflow-x: auto; font-size: .875rem; }
      article h2 { scroll-margin-top: 1rem; }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <header>
        <h1 class="text-3xl font-semibold">{{scope}}</h1>
        <p class="text-slate-500">{{ticket}} · {{commits}} · {{date}}</p>
        <nav class="mt-4 text-sm flex flex-wrap gap-3"><!-- one anchor per section --></nav>
      </header>
      <article id="tldr" class="space-y-3">…</article>
      <!-- one <article> per section; each Mermaid fence becomes <pre class="mermaid">…</pre>,
           each code fence <pre class="code"><code>…</code></pre> -->
    </main>
  </body>
</html>
```

Rendering rules: keep the agent's text verbatim; `###`/`**bold**` lines become headings and
`<strong>`; tables become `<table class="text-sm">`; escape `<`, `>` and `&` inside code fences;
leave Mermaid fences unescaped. A header navigation link per section.
