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
   with `BLOCKED:` goes straight to the user.
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
     names, such as a branch, a push or a CI run, has not run yet), add its findings to `plan.md`
     and any new decision to `architecture.md`, stage the step's files, and commit with the
     proposed message as a command of its own;
   - **feedback:** first offer to commit the tree as it stands as the current round (`S11.1`,
     code only, no `plan.md` edit), then send the feedback to the same implementer
     (`SendMessage`) as the next round, and return to 3;
   - **stop:** leave the working tree as it is.
6. Name the next unblocked step.

One step, or one round of it, per approval. Pushing or opening a PR needs its own OK.

## Parallel steps

On the user's word, steps whose `Blocked by` are all `done` run at once, one worktree each, when
their overlap is mechanical only: a line added to a shared list or a `package.json`, separate
sections of one doc, `bun.lock`. Never when both create one new file or change one function or
contract.

- Give each worktree a number `N`, unique among the live ones; the main tree is 0. Spawn each
  `implementer` with `isolation: "worktree"`; beside the pointers, give it `N`, tell it to leave
  `plan.md` and `architecture.md` alone, and to set its tree up first: the main tree's `.env` with
  its own ports.

  ```sh
  N=<n>
  bun install
  main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
  sed -E -e "s/^API_PORT=.*/API_PORT=$((3000 + 10 * N))/" \
    -e "s/^WEB_PORT=.*/WEB_PORT=$((3001 + 10 * N))/" \
    -e "s/^(AWS_ENDPOINT_URL=.*:)[0-9]+/\1$((4566 + 10 * N))/" "$main/.env" > .env
  ```

  The tree then holds its own `node_modules`, `.env`, `.data/`, `.pulumi/` and MiniStack, so the
  agent may run `make up` and `make dev` for its *Verify*.
- Name the worktree at once, `<slug>-<step>-<topic>`: a symlink of that name to the agent's folder
  in `.claude/worktrees/`, and `git branch -m` to `wt/<slug>-<step>-<topic>`. Never move a folder
  an agent works in.
- Every status names each worktree by its full path, its `N` and its ports.
- Rounds commit in the worktree; rebase its branch onto the ticket branch before the next round.
- Reviews and approvals stay one step at a time. On approve, cherry-pick the step's rounds onto
  the ticket branch, the last with `--no-commit` so the `plan.md` and `architecture.md` edits join
  it, and run `make check` after each pick. Then run `make down` in the worktree, and remove the
  worktree, its symlink and its branch.
