---
name: ticket-implement
description: "SDD 4/5: implement one plan.md step, review it, and commit only after approval"
argument-hint: "<ticket folder> [step id, default: next todo]"
disable-model-invocation: true
---

Take one step of the ticket at `$ARGUMENTS` from `todo` to an approved commit. Gates:
`.claude/rules/sdd.md`.

## Steps

1. **Pick the step:** the one named, else the first `todo` step whose `Blocked by` steps are all
   `done`. Check that the branch is the ticket branch (`<type>/<slug>`) and that `git status`
   shows no uncommitted change to tracked files; otherwise stop and ask.
2. **Implement.** Spawn the `implementer` agent with pointers only: the ticket folder and the
   step id. Its `make check` hook keeps it working until the gate is green. A report that starts
   with `BLOCKED:` goes straight to the user. When the step lists numbered sub-steps, the agent
   does one at a time: after each approval, `SendMessage` it the next sub-step's number.
3. **Review.** Call the Skill tool with `mattpocock-skills:code-review`, overriding:

   | code-review asks for | Use |
   |---|---|
   | the fixed point and diff | `HEAD`; the diff is `git diff HEAD` plus every untracked file in `git status --short`, so the uncommitted step is reviewed |
   | the spec | the step in `plan.md`, and the `R…` it cites from `feature.md`; the Spec axis also reports whether the diff changes what a quoted `R…` asks, which then requires the `feature.md` edit in the same diff |
   | the standards | `.claude/rules/*.md` and the `CLAUDE.md` of every touched workspace |
   | the sub-agents | the `reviewer` agent, once per axis, in parallel |

4. **Present** the implementer's report, then the `## Standards` and `## Spec` reports as
   code-review aggregates them.
5. **Approval gate.** Wait for the user's explicit word:
   - **approve:** set the step's `Status: done` (or `blocked: <gate>` while a gate the step
     names, such as a branch, a push or a CI run, has not run yet; `in progress: <n>/<m>` while
     sub-steps remain), add its findings to `plan.md` and any new decision to `architecture.md`,
     stage the step's files, and commit with the proposed message as a command of its own; a
     sub-step's commit then returns to 2 with the next number;
   - **feedback:** send it to the same implementer (`SendMessage`), then return to 3;
   - **stop:** leave the working tree as it is.
6. Name the next unblocked step.

One step, or one sub-step, per approval. Pushing or opening a PR needs its own OK.
