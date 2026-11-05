# Claimed findings

A `claimed` finding states a failure that no command showed. Send each to its own `researcher`
on `model: opus`, all in parallel, its brief the finding verbatim, the diff command and the
round's worktree, so it is not anchored on the reviewer's reading and settles the claim by a run.
Its verdict decides what the user sees:

- `confirmed`: present it as the finding;
- `refuted`: drop it as rejected;
- `unclear`: ask it as a question, with what the researcher could not settle.

## The round's worktree

One disposable worktree per review round holds the step as it stands; the round's researchers
share it, each test in a file of its own, and the tree that holds the step stays untouched. Set
it up before the researchers, from that tree, with `<name>` `<slug>-<step>-confirm` and `<wt>`
the folder `.claude/worktrees/<name>` of the main tree:

1. `git worktree add -b wt/<name> <wt> HEAD`: the branch first, since `make worktree` renames the
   current one.
2. Carry the step over: `git diff HEAD --binary | git -C <wt> apply --allow-empty`, then
   `git ls-files -oz --exclude-standard | tar --null -T - -cf - | tar -xf - -C <wt>` for its
   untracked files.
3. `make worktree N=<n> NAME=<name>` inside it, `<n>` unused by a live worktree, so the step's
   dependencies are installed and its tests get their own ports. The worktree is ready when it
   exits 0; a refusal names what to change.

After the verdicts, run `make reset` in it, then remove the worktree and its branch in a command
of their own (`git worktree remove --force`, `git branch -D`) and check that `git worktree list`
no longer shows it.
