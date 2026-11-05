# Parallel steps

On the user's word, steps whose `Blocked by` are all `done` run at once, one worktree each, when
their overlap is mechanical only: a line added to a shared list or a `package.json`, separate
sections of one doc, `bun.lock`. Never when both create one new file or change one function or
contract. What a worktree owns and its ports:
[tooling.md › Worktrees](../../../docs/knowledge/tooling.md#worktrees).

- Give each worktree a number `N` from 1, unique among the live ones, and a name
  `<slug>-<step>-<topic>`. Spawn each `implementer` with `isolation: "worktree"`, which branches
  from the ticket branch, since the project settings set `worktree.baseRef` to `"head"`; beside
  the pointers, its prompt carries `N`, the name, the order to write every path, in commands and
  file tools alike, through `.claude/worktrees/<name>` and never through the `agent-<id>` folder,
  and the order to run `make worktree N=<n> NAME=<name>` in the folder it starts in, before
  anything else and before the symlink exists; after it, the agent may run `make up` and
  `make dev` for its *Verify*.
- `make worktree` names the worktree before the agent's first real command. Once the agent has
  started, check the branch `wt/<name>` with `git worktree list` and the symlink `<name>` beside
  its folder. Never move a folder an agent works in.
- Every status names each worktree by its full path, its `N` and its ports.
- Rounds commit in the worktree; rebase its branch onto the ticket branch before the next round,
  then run `bun install` in it.
- A `bun.lock` conflict, in a rebase or a cherry-pick, is never merged by hand: take either side
  (`git checkout --ours bun.lock`), run `bun install`, and stage the lockfile it writes.
- Reviews and commits stay one step at a time. On **commit**, cherry-pick the step's rounds onto
  the ticket branch, the last with `--no-commit` so the `plan.md` and `architecture.md` edits join
  it, and run `make check` after each pick.
- On the **stop** of the skill's step 5, also run `make down` in the worktree, and keep it, its
  symlink and its branch. Remove all three, after `make reset`, only once the step is committed
  on the ticket branch, or when the user drops the step, a `BLOCKED:` one included. Remove them in
  a command of their own, never chained after a commit, and only when `git log` shows the rounds
  on the ticket branch and the worktree's `git status --short` is empty.
