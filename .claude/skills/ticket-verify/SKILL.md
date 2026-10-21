---
name: ticket-verify
description: "SDD 5/5: verify a whole ticket in a fresh context into verification.md with Lessons"
argument-hint: "<ticket folder>"
disable-model-invocation: true
---

Verify the ticket at `$ARGUMENTS` before its PR: does the branch do what `feature.md` asks, and
what should the toolkit learn from building it. Gates: `.claude/rules/sdd.md`.

## Steps

1. **Run both checks in parallel**, passing pointers only, never a summary of how the work was
   done:
   - spawn the `verifier` agent with the ticket folder and the branch;
   - call the Skill tool with `mattpocock-skills:code-review` with the fixed point
     `git merge-base HEAD origin/main` (the clone has no local branch of that name), the spec
     `feature.md` plus `architecture.md`, the standards `.claude/rules/*.md` plus the touched
     `CLAUDE.md` files, and the `reviewer` agent as each axis sub-agent.

   Tell every agent to read the rules, `CLAUDE.md` files, skills and agents from disk: agents
   spawned in a long session can carry the copies loaded when it started. After rule edits, prefer
   running `/ticket-verify` in a new session.
2. **Write `verification.md`** from `docs/tickets/_template/verification.md`, appending a dated
   section per run: the verdict per `R…`, the Standards and Spec reports, ranked simplifications,
   and **Lessons**.
3. **Lessons.** Collect the mistakes that recurred in two or more steps: `plan.md` findings,
   review rounds, and the user's feedback in this session. Each lesson proposes one line in a
   named skill or rule, or a mechanical check (a Biome rule, a test, a hook) when the mistake is
   mechanical; never in a `CLAUDE.md`. Apply a lesson only on the user's OK.
4. **Present** the verdict, the simplifications and the lessons. Accepted fixes become new
   `plan.md` steps for `/ticket-implement`. On `pass` and the user's agreement, propose the PR
   (`.claude/rules/pull-requests.md`); opening it needs its own OK.

Fix nothing during verification, and commit `verification.md` only on the user's OK.
