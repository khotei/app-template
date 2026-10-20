---
name: explain
description: "Explain what an agent built: diagrams, entities, Effect composition, recorded decisions"
argument-hint: "[<step id> | <commit or range> | branch | <ticket folder> | <path or symbol>]"
disable-model-invocation: true
---

Explain the shape of `$ARGUMENTS` to the reader, so that they understand the code faster than by
reviewing it. This skill never judges and never edits: Standards and Spec are `code-review`'s axes,
fixing is `/ticket-implement`'s. The report format is [REPORT.md](REPORT.md).

## Steps

1. **Resolve the scope** in the main session (the agent cannot ask). The base is
   `git merge-base HEAD origin/main`; the branch has no local `main`.

   | `$ARGUMENTS` | Scope |
   |---|---|
   | empty | `HEAD` plus the uncommitted changes: the last implementation |
   | `branch`, or a ticket folder | `<base>...HEAD`, one chapter per plan step (one step is one commit) |
   | a step id (`S15`) | the branch commit whose subject matches the step's title in `plan.md`; when none does, show `git log --oneline <base>..HEAD` and ask which |
   | a commit, a range | that diff |
   | a path or a symbol | the module and its neighbours, regardless of any diff |

   Collect pointers only: the diff command, the untracked files from `git status --short`, the
   ticket folder, the step ids, the commits (`git log --format='%H %s' <range>`).
2. **Spawn `explainer`** with those pointers and the reader profile below. Tell it to read rules,
   `CLAUDE.md` files and `docs/knowledge/*.md` from disk, not from memory of the session. For a
   whole branch over ~1500 changed lines, spawn one `explainer` per group of steps and keep the
   chapter order.
3. **Save the report** the agent returns as `$TMPDIR/explain-<slug>-<YYYY-MM-DD>.html` (`/tmp` when
   `$TMPDIR` is unset) using the scaffold in `REPORT.md`, run `open <path>`, and print in chat only
   the path, the TL;DR and "Where to read with your own eyes". Nothing lands in the repository.

## The reader

A senior TypeScript engineer (~8 years) who thinks in deep modules (Ousterhout) and is **learning
Effect 4**. Skip the language: generics, `async`, `map`. Explain every Effect and `@effect/platform`
API on its first appearance in the report, in the context of this code, with a 5–15 line isolated
example that is not a copy of the project. Name things as `docs/knowledge/glossary.md` does, and use
the `codebase-design` vocabulary (module, interface, depth, seam, adapter) for shape.

## Sources of intent

The intent is already written; the report quotes it rather than reconstructing it:
`feature.md` (`R…`), `architecture.md` (Seams, `D…` with the rejected alternative), `plan.md` (the
step, its findings), the commits' `Decision:` paragraphs, and `docs/knowledge/architecture.md` for
the layers. Effect facts come from the vendored `repos/effect` (`LLMS.md`, `ai-docs/src`), never
from memory: `http-api`, `persistence` and `ai` change between patches.

## Rules

- Every claim about the code carries `path:line`. Unsure → say so; never invent.
- Explain, don't judge: a smell is at most one line under "For the review", never a section.
- The report is in Russian; identifiers, paths and terms stay as in the code.
- Mermaid: quote labels with spaces or brackets (`A["ChatService (Layer)"]`), never use `end` as a
  node id, at most ~15 nodes per diagram, split by subsystem beyond that.
- Short where obvious, long where not.
