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
   step id, on the `model` and `effort` the step's **Model** line names (`opus medium` for a
   move, rename or config step; `fable high` for one that writes behaviour). Its `make check`
   hook keeps it working until the gate is green. A report that starts with `BLOCKED:` goes
   straight to the user.
3. **Review.** Call the Skill tool with `mattpocock-skills:code-review`, overriding:

   | code-review asks for | Use |
   |---|---|
   | the fixed point and diff | `HEAD`; the diff is `git diff HEAD` plus every untracked file in `git status --short`, so the uncommitted step is reviewed |
   | the spec | the step in `plan.md`, and the `R…` it cites from `feature.md`; the Spec axis also reports whether the diff changes what a quoted `R…` asks, which then requires the `feature.md` edit in the same diff |
   | the standards | `.claude/rules/*.md` and the `CLAUDE.md` of every touched workspace |
   | the sub-agents | the `reviewer` agent, once per axis, in parallel; the Standards axis on `model: sonnet`, the Spec axis on the agent's own |

4. **Present** the implementer's report, then the `## Standards` and `## Spec` reports as
   code-review aggregates them, then the fixes you recommend. Filter the findings first: a fix
   that adds test support (a helper, a fake, a wrapper) is never forwarded as routine; offer the
   user a plainer test instead, or the finding as a choice of its own.
5. **Approval gate.** Wait for the user's explicit word:
   - **approve:** set the step's `Status: done` (or `blocked: <gate>` while a gate the step
     names, such as a branch, a push or a CI run, has not run yet), add its findings to `plan.md`
     and any new decision to `architecture.md`, stage the step's files, and commit with the
     proposed message as a command of its own. An amendment also rewrites the decision's body,
     Contract, Seam or Risks row it makes wrong; its note keeps only what changed and the
     rejected alternative;
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
contract. What a worktree owns and its ports:
[tooling.md › Worktrees](../../../docs/knowledge/tooling.md#worktrees).

- Give each worktree a number `N` from 1, unique among the live ones, and a name
  `<slug>-<step>-<topic>`. Spawn each `implementer` with `isolation: "worktree"`; beside the
  pointers, its prompt carries `N`, the name, the order to leave `plan.md` and `architecture.md`
  alone, the order to write every path, in commands and file tools alike, through
  `.claude/worktrees/<name>` and never through the `agent-<id>` folder, and this block with `N`
  and the name filled in, to run before anything else; after it, the agent may run `make up` and
  `make dev` for its *Verify*.

  ```sh
  (
    cd "$(git rev-parse --show-toplevel)" || exit 1
    N=<n>
    NAME=<slug>-<step>-<topic>
    main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
    [ "$N" -ge 1 ] || { echo 'refused: N counts worktrees from 1; the main tree is 0' >&2; exit 1; }
    [ "$(git rev-parse --path-format=absolute --git-dir)" != "$main/.git" ] ||
      { echo 'refused: this is the main tree, the source of every .env' >&2; exit 1; }
    ln -sfn "$(basename "$PWD")" "$(dirname "$PWD")/$NAME" || exit 1
    git branch -m "wt/$NAME" || exit 1
    bun install || exit 1
    sed -E -e "s/^API_PORT=.*/API_PORT=$((3000 + 10 * N))/" \
      -e "s/^WEB_PORT=.*/WEB_PORT=$((3001 + 10 * N))/" \
      -e "s/^(AWS_ENDPOINT_URL=.*:)[0-9]+/\1$((4566 + 10 * N))/" \
      -e "s/^STAGE=.*/STAGE=\"local$N\"/" \
      -e "s/^RDS_BASE_PORT=.*/RDS_BASE_PORT=$((15432 + 10 * N))/" "$main/.env" > .env.new
    grep -qx "API_PORT=$((3000 + 10 * N))" .env.new &&
      grep -qx "WEB_PORT=$((3001 + 10 * N))" .env.new &&
      grep -qE "^AWS_ENDPOINT_URL=\"?[a-z]+://[^/]+:$((4566 + 10 * N))([/\"]|$)" .env.new &&
      grep -qx "STAGE=\"local$N\"" .env.new &&
      grep -qx "RDS_BASE_PORT=$((15432 + 10 * N))" .env.new || {
      rm .env.new
      echo "refused: $main/.env lacks API_PORT, WEB_PORT, the port of AWS_ENDPOINT_URL, STAGE or RDS_BASE_PORT" >&2
      exit 1
    }
    mv .env.new .env
  )
  ```

- The block names the worktree before the agent's first real command: a symlink `<name>` to the
  agent's folder in `.claude/worktrees/`, and the branch `wt/<name>`. Check both with
  `git worktree list` once the agent has started. Never move a folder an agent works in.
- Every status names each worktree by its full path, its `N` and its ports.
- Rounds commit in the worktree; rebase its branch onto the ticket branch before the next round,
  then run `bun install` in it.
- A `bun.lock` conflict, in a rebase or a cherry-pick, is never merged by hand: take either side
  (`git checkout --ours bun.lock`), run `bun install`, and stage the lockfile it writes.
- Reviews and approvals stay one step at a time. On approve, cherry-pick the step's rounds onto
  the ticket branch, the last with `--no-commit` so the `plan.md` and `architecture.md` edits join
  it, and run `make check` after each pick.
- On step 5's **stop**, also run `make down` in the worktree, and keep it, its symlink and its
  branch. Remove all three, after `make reset`, only once the step is approved and picked, or when
  the user drops the step, a `BLOCKED:` one included. Remove them in a command of their own,
  never chained after a commit, and only when `git log` shows the rounds on the ticket branch and
  the worktree's `git status --short` is empty.
