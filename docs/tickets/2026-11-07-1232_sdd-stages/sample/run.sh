#!/bin/sh
# Builds a state of the sample ticket in a clone and runs one phase there, for the acceptance runs
# of the ticket this folder belongs to (its architecture.md › Seams, the second row).
#
#   run.sh <state> ("<prompt>" | --no-run)
#
# It clones this repository's HEAD with `git clone --local` into the system temp directory, makes
# that commit the clone's `main`, deletes the ticket that holds this folder there in a commit of
# `main`, so no run finds the answers, and cuts `chore/sample`. The script states/<state>.sh then commits the ticket, from
# this folder as it is on disk, as docs/tickets/2026-01-01-0000_sample/ up to the state, under the
# names of .claude/rules/commits.md; each script's header says what its state holds and which
# acceptance runs start from it. The clone also gets this tree's `.env` and a `bun install`, so
# its `make check`, `make worktree` and git hooks work. Then `claude -p` runs the prompt in the
# clone on its project settings, or nothing does with --no-run.
# Last come the sample's `git log --oneline`, `git status --short` and the clone's path, where a
# second phase can run by hand. The clone stays; delete it once read. Exits 2 when it cannot build
# the state, else with the run's exit code.
case $0 in
  */*) here=${0%/*} ;;
  *) here=. ;;
esac
here=$(cd "$here" && pwd) || exit 2
states=$here/states
usage() {
  printf 'usage: %s <state> ("<prompt>" | --no-run); states:' "$0" >&2
  for file in "$states"/*.sh; do
    name=${file##*/}
    printf ' %s' "${name%.sh}" >&2
  done
  printf '\n' >&2
  exit 2
}
[ $# -eq 2 ] && [ -f "$states/$1.sh" ] || usage
top=$(git -C "$here" rev-parse --show-toplevel) || exit 2
prefix=$(git -C "$here" rev-parse --show-prefix) || exit 2
system_tmp=${TMPDIR:-/tmp}
tmp=$(mktemp -d "${system_tmp%/}/sample-$1.XXXXXX") || exit 2
clone=$tmp/repo
# The state scripts edit this copy before they commit it, so a variant changes a file from its
# first commit on.
sample=$tmp/sample
ticket=docs/tickets/2026-01-01-0000_sample
cp -R "$here" "$sample" || exit 2
git clone -q --local "$top" "$clone" || exit 2
cd "$clone" || exit 2
# A stage's probe worktree takes its .env from the clone's (make worktree), and git copies none.
[ ! -f "$top/.env" ] || cp "$top/.env" .env || exit 2
git checkout -q -B main || exit 2
# The ticket this folder belongs to, whose plan and acceptance name every state's answer.
owner=${prefix%/}
owner=${owner%/*}
if [ -e "$owner" ]; then
  git rm -q -r -- "$owner" && git commit -q --no-verify -m ':fire: chore(docs): Drop a fixture' ||
    exit 2
fi
git checkout -q -b chore/sample || exit 2

# commit <subject> <body>: commits every change, the body then Refs as its paragraphs.
# shellcheck disable=SC2329 # the state scripts call it
commit() {
  git add -A && git commit -q --no-verify -m "$1" -m "$2" -m "Refs: $ticket/" || exit 2
}

# replace <file> <line> <text> [last]: puts <text>, which may span lines or be empty, in place of
# the first line equal to <line>, or of the last one; fails when no line is equal.
# shellcheck disable=SC2329 # the state scripts call it
replace() {
  if ! LINE=$2 TEXT=$3 WHICH=${4:-first} awk '
    FNR == 1 { pass++ }
    pass == 1 { if ($0 == ENVIRON["LINE"]) total++; next }
    $0 == ENVIRON["LINE"] && !done && (ENVIRON["WHICH"] == "first" || ++seen == total) {
      if (ENVIRON["TEXT"] != "") print ENVIRON["TEXT"]
      done = 1
      next
    }
    { print }
    END { exit !done }' "$1" "$1" > "$1.new" || ! mv "$1.new" "$1"; then
    printf 'run.sh: no line of %s reads: %s\n' "$1" "$2" >&2
    rm -f "$1.new"
    exit 2
  fi
}

# close_step <step> [findings]: sets the step done in the plan's Status row and its own section,
# the findings, when given, on the lines after its Status.
# shellcheck disable=SC2329 # the state scripts call it
close_step() {
  if ! STEP=$1 FINDINGS=$2 awk '
    index($0, "| " ENVIRON["STEP"] " |") == 1 && sub(/\| todo \|$/, "| done |") { changed++ }
    /^#### / { inside = index($0, "#### " ENVIRON["STEP"] " ") == 1 }
    inside && $0 == "- **Status:** todo" {
      print "- **Status:** done"
      if (ENVIRON["FINDINGS"] != "") print ENVIRON["FINDINGS"]
      changed++
      next
    }
    { print }
    END { exit changed != 2 }' "$ticket/plan.md" > "$ticket/plan.md.new" ||
    ! mv "$ticket/plan.md.new" "$ticket/plan.md"; then
    printf 'run.sh: %s has no todo row and Status in plan.md\n' "$1" >&2
    rm -f "$ticket/plan.md.new"
    exit 2
  fi
}

# build <state>: runs that state's script here, so a variant builds on its base.
build() {
  # shellcheck source=/dev/null # the state is chosen at run time
  . "$states/$1.sh"
}

# plant: runs in stage-1-done before its St1 S3.1 commit; a variant redefines it to break that
# round's code.
# shellcheck disable=SC2329 # stage-1-done calls it
plant() { :; }

build "$1"
bun install --frozen-lockfile > "$tmp/install.log" 2>&1 || {
  cat "$tmp/install.log" >&2
  exit 2
}
code=0
if [ "$2" != --no-run ]; then
  # A new folder is a workspace no one has trusted, whose project settings Claude Code reads
  # without their permissions; the same file named by --settings keeps them.
  claude -p --setting-sources project --settings .claude/settings.json "$2"
  code=$?
fi
printf '\n== git log --oneline main..\n'
git log --oneline main..
printf '\n== git status --short\n'
git status --short
printf '\nclone: %s\n' "$clone"
exit "$code"
