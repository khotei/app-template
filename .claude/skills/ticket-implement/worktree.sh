#!/bin/sh
# Sets up a parallel step's worktree before its implementer's first real command: names it
# (a symlink <name> beside the folder, the branch wt/<name>), installs its dependencies, and
# writes its .env, the main tree's with the ports and stage of number N moved
# (docs/knowledge/tooling.md › Worktrees). Run through `make worktree N=<n> NAME=<name>` from the
# worktree's own folder; with KEEP=1 the branch keeps its name, for a worktree on a ticket branch. The only change before the checks pass is the draft .env.new, which an
# EXIT trap drops on any exit before it becomes .env, HUP, INT and TERM included, so a refusal
# leaves nothing. Once they pass, .env is written first, so a failed ln, branch rename or bun
# install leaves it and the symlink or branch already made; a rerun with the same N finishes the
# job.
N=$1
NAME=$2
KEEP=$3
refuse() { printf 'refused: %s\n' "$1" >&2; exit 1; }
# Any other value would rename the ticket branch it was meant to keep.
case $KEEP in '' | 1) ;; *) refuse 'KEEP is 1 or unset' ;; esac
# Letters spelled out: a range such as a-z follows the locale's collation.
letters=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ
case $NAME in
  '' | *[!${letters}0123456789.-]* | [.-]*) refuse 'NAME is <slug>-<step>-<topic>: letters, digits, . and -' ;;
esac
case $N in
  '' | *[!0-9]* | 0*) refuse 'N counts worktrees from 1; the main tree is 0' ;;
  # Bounded before any arithmetic, which overflows past 19 digits; the port check comes later.
  ??????*) refuse 'N has at most five digits' ;;
esac
# Before .env, so a rerun is not left failing at git branch -m.
[ -n "$KEEP" ] || git check-ref-format --branch "wt/$NAME" > /dev/null 2>&1 ||
  refuse "git refuses wt/$NAME as a branch"
# Each git query is checked: outside a repository each fails with an empty output, and cd ""
# stays put.
top=$(git rev-parse --show-toplevel) || exit 1
cd "$top" || exit 1
common=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1
git_dir=$(git rev-parse --path-format=absolute --git-dir) || exit 1
[ "$git_dir" != "$common" ] || refuse 'this is the main tree, the source of every .env'
main=$(dirname "$common")
here=$(basename "$PWD")
link="$(dirname "$PWD")/$NAME"
if [ "$here" != "$NAME" ] && { [ -e "$link" ] || [ -L "$link" ]; }; then
  # A folder or file there has no target, so readlink prints nothing and it is refused too.
  target=$(readlink "$link")
  [ "$target" = "$here" ] || refuse "$link already names another folder"
fi
branch=$(git branch --show-current) || exit 1
if [ -z "$KEEP" ] && [ "$branch" != "wt/$NAME" ] &&
  git show-ref --verify --quiet "refs/heads/wt/$NAME"; then
  refuse "the branch wt/$NAME already exists"
fi
api=$((3000 + 10 * N))
web=$((3001 + 10 * N))
aws=$((4566 + 10 * N))
rds=$((15432 + 10 * N))
stage="STAGE=\"local$N\""
# RDS_BASE_PORT is the highest of the four ports.
[ "$rds" -le 65535 ] || refuse "N=$N puts RDS_BASE_PORT at $rds, past 65535"
# A stage moved before means containers still run under it.
own=$(sed -n 's/^STAGE=//p' .env 2>/dev/null)
case $own in
  '"local'[0-9]*) [ "STAGE=$own" = "$stage" ] ||
    refuse "this worktree is set up under $own; stop its containers and remove it instead" ;;
esac
# .env.new covers a run already past its draft; two runs between this scan and their drafts
# both pass, so the main session hands out distinct N (parallel-steps.md). A run killed by
# SIGKILL, which no trap catches, leaves a .env.new, hence the refusal names the file.
trees=$(git worktree list --porcelain) || exit 1
taken=$(printf '%s\n' "$trees" | sed -n 's/^worktree //p' | while IFS= read -r tree; do
  [ "$tree" -ef . ] && continue
  for file in "$tree/.env" "$tree/.env.new"; do
    if grep -qxF "$stage" "$file" 2>/dev/null; then printf '%s\n' "$file"; fi
  done
done)
[ -z "$taken" ] || refuse "N=$N is already the stage in $taken"
trap 'rm -f .env.new' EXIT
# dash runs no EXIT trap on a signal, but does on the exit its trap makes.
trap 'exit 1' HUP INT TERM
sed -E -e "s/^API_PORT=.*/API_PORT=$api/" \
  -e "s/^WEB_PORT=.*/WEB_PORT=$web/" \
  -e "s/^(AWS_ENDPOINT_URL=.*:)[0-9]+/\1$aws/" \
  -e "s/^STAGE=.*/$stage/" \
  -e "s/^RDS_BASE_PORT=.*/RDS_BASE_PORT=$rds/" "$main/.env" > .env.new
{ grep -qx "API_PORT=$api" .env.new &&
  grep -qx "WEB_PORT=$web" .env.new &&
  grep -qE "^AWS_ENDPOINT_URL=\"?[a-z]+://[^/]+:$aws([/\"]|$)" .env.new &&
  grep -qx "$stage" .env.new &&
  grep -qx "RDS_BASE_PORT=$rds" .env.new; } ||
  refuse "$main/.env lacks API_PORT, WEB_PORT, the port of AWS_ENDPOINT_URL, STAGE or RDS_BASE_PORT"
# Before the slow steps, so a run started meanwhile finds the stage taken.
mv .env.new .env || exit 1
# A folder that already has the name needs no link: ln would put one inside it. A link already
# there names this folder, as checked above.
[ "$here" = "$NAME" ] || [ -L "$link" ] || ln -s "$here" "$link" || exit 1
[ -n "$KEEP" ] || git branch -m "wt/$NAME" || exit 1
bun install
