---
name: review-brief
description: "A brief before you review a range of commits: its meaning, flows, entities and a reading path"
argument-hint: "[L<n> | S<n> | <base>..<head> | all]"
disable-model-invocation: true
---

Write the owner a **brief** for the range in `$ARGUMENTS`: what the change means, how the system
runs now, and the path to read its diff. It prepares the review; it is not one, so it judges no
code and spawns no agent. It takes one session's reading, about ten tool calls.

## Steps

1. **The range.** `L<n>` or `S<n>`: from the parent of the oldest commit the subject search of
   `.claude/rules/commits.md › A ticket's rounds` finds for the step to `HEAD`; `<base>..<head>`
   as given; `all`: from `git merge-base main HEAD`; none: the Map's step in progress, else
   `all`. Done when `git log --oneline` and `git diff --shortstat` of the range are in hand, the
   lines split into code, tests, docs and generated files (migrations, snapshots).
2. **The intent.** Read what the range was asked to do: the step's Shape, Notes and Pieces in
   `lab.md`, or its `plan.md` step, and the commits' `Decision:` paragraphs. Done when each
   deviation from the Shape or plan is listed with the commit that made it.
3. **The facts.** Read the diff of the schema (tables, the migration's SQL), the contracts (ports,
   services' shapes, the HTTP contract), the models and the use cases; tests and docs only by
   `--stat`. Every claim carries a `path:line` at `HEAD` or a command and its output; the last
   `make check` is cited with its commit, not rerun. Done when each section below has its facts.
4. **Write the brief** in the owner's language, by `communication-style.md`, its sections in this
   order, each present or marked "none". The shape and a worked example:
   [example.md](example.md).
   1. **Verdict:** one sentence: what the range does, whether it is green, what waits on the
      owner; then the "Где мы" block.
   2. **Meaning:** a table, one row per concept whose meaning moved: before, after, why.
   3. **Flow:** an ASCII diagram per path that changed, the happy one first, every arrow named by
      its message or write, a changed arrow marked `*`; a failure branch under it.
   4. **Entities:** the tables with their keys, cardinality and cascades; under them the shape a
      read answers, the nesting of the models.
   5. **Invariants:** a table: the rule, what holds it (a constraint, a model function, a guard
      in a write), the test that proves it.
   6. **Contracts:** before → after code for each signature, wire shape or job body a caller
      sees changed, at most three; the rest by name.
   7. **Review map:** the reading path, data first and the API last, each stop a few files with
      `path:line`, its size and the one question to answer there; then what to skip and why.
   8. **Decisions:** each non-obvious choice and deviation: the rejected alternative, its cost.
   9. **Unverified and risks:** what no run proved, gaps sent to Later, own mistakes as
      "моя ошибка: …; вывод: …".
   10. **Questions:** numbered, each one the owner answers with "yes" to take the recommendation.
5. **Check before sending.** Every number comes from git; every path exists (`git ls-files`);
   every file of the diff sits in a stop of the review map or on its skip line; each diagram is
   ASCII, one idea, at most 15 lines. Over three screens, the detail goes to "ещё N, перечислю,
   если нужно". Then send it in the chat, offering an HTML page in one line.
