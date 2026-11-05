#!/bin/sh
# Sets up a parallel step's worktree before its implementer's first real command: names it
# (a symlink <name> beside the folder, the branch wt/<name>), installs its dependencies, and
# writes its .env, the main tree's with the ports and stage of number N moved
# (docs/knowledge/tooling.md › Worktrees). Run through `make worktree N=<n> NAME=<name>` from the
# worktree's own folder. The only change before the checks pass is the draft .env.new, which an
# EXIT trap drops on any exit before it becomes .env, so a refusal leaves nothing. Once they pass,
# .env is written first, so a failed ln, branch rename or bun install leaves it and the symlink or
# branch already made; a rerun with the same N finishes the job.
N=$1
NAME=$2
refuse() { echo "refused: $1" >&2; exit 1; }
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
cd "$(git rev-parse --show-toplevel)" || exit 1
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
[ "$(git rev-parse --path-format=absolute --git-dir)" != "$main/.git" ] ||
  refuse 'this is the main tree, the source of every .env'
here=$(basename "$PWD")
link="$(dirname "$PWD")/$NAME"
if [ "$here" != "$NAME" ] && { [ -e "$link" ] || [ -L "$link" ]; }; then
  [ "$(readlink "$link")" = "$here" ] || refuse "$link already names another folder"
fi
[ "$(git branch --show-current)" = "wt/$NAME" ] || ! git show-ref --verify --quiet "refs/heads/wt/$NAME" ||
  refuse "the branch wt/$NAME already exists"
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
# both pass, so the main session hands out distinct N (parallel-steps.md). A run killed
# without its EXIT trap leaves a .env.new, hence the refusal names the file.
taken=$(git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r tree; do
  [ "$tree" -ef . ] && continue
  for file in "$tree/.env" "$tree/.env.new"; do
    ! grep -qx "$stage" "$file" 2>/dev/null || echo "$file"
  done
done)
[ -z "$taken" ] || refuse "N=$N is already the stage in $taken"
trap 'rm -f .env.new' EXIT
sed -E -e "s/^API_PORT=.*/API_PORT=$api/" \
  -e "s/^WEB_PORT=.*/WEB_PORT=$web/" \
  -e "s/^(AWS_ENDPOINT_URL=.*:)[0-9]+/\1$aws/" \
  -e "s/^STAGE=.*/$stage/" \
  -e "s/^RDS_BASE_PORT=.*/RDS_BASE_PORT=$rds/" "$main/.env" > .env.new
grep -qx "API_PORT=$api" .env.new &&
  grep -qx "WEB_PORT=$web" .env.new &&
  grep -qE "^AWS_ENDPOINT_URL=\"?[a-z]+://[^/]+:$aws([/\"]|$)" .env.new &&
  grep -qx "$stage" .env.new &&
  grep -qx "RDS_BASE_PORT=$rds" .env.new ||
  refuse "$main/.env lacks API_PORT, WEB_PORT, the port of AWS_ENDPOINT_URL, STAGE or RDS_BASE_PORT"
# Before the slow steps, so a run started meanwhile finds the stage taken.
mv .env.new .env
# A folder that already has the name needs no link: ln would put one inside it.
[ "$here" = "$NAME" ] || ln -sfn "$here" "$link" || exit 1
git branch -m "wt/$NAME" || exit 1
bun install
