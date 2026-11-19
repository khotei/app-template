#!/bin/sh
# A lab's Numbers from git: `make numbers [SLUG=<slug>] [RANGE=main..HEAD]`. Lines are git's
# numstat: the ticket is docs/tickets/, tests are __tests__/ and __e2e__/, docs are the other
# Markdown and docs/, code is the rest, so the owner's taste in lab.md shows apart from rework. A
# round's source is the (OWNER) or (REVIEW) of its subject, else the writer's own pass; its step
# is the first L<n> of its subject. Stops and review yields are the [N:ai] lines the lab's file
# ever held, read from its history, since a closed step keeps only its Output.
set -eu
slug=${1:-}
range=${2:-main..HEAD}
git rev-list --count "$range" > /dev/null # a bad range stops here, not as zeros
git log --reverse --format='@%at%x09%s' --numstat "$range" -- | awk -F '\t' '
  /^@/ {
    t = substr($1, 2); if (!first) first = t; last = t; n++
    src = $2 ~ /\(OWNER\)/ ? "owner" : $2 ~ /\(REVIEW\)/ ? "review" : "writer"
    step = match($2, /: L[0-9]+/) ? substr($2, RSTART + 3, RLENGTH - 3) : ""
    rounds[src]++; next
  }
  NF < 3 || $1 == "-" { next }
  {
    kind = $3 ~ /^docs\/tickets\// ? "ticket" : $3 ~ /(__tests__|__e2e__)\// ? "tests" : \
      ($3 ~ /^docs\// || $3 ~ /\.md$/) ? "docs" : "code"
    add[src, kind] += $1; del[src, kind] += $2
    if (step != "") { seen[step] = 1; sadd[step, kind] += $1; sdel[step, kind] += $2 }
  }
  function lines(a, d, key,    k, out) {
    split("code tests docs ticket", ks, " ")
    for (k = 1; k <= 4; k++)
      out = out sprintf("%s %s +%d -%d", k > 1 ? "," : "", ks[k], a[key, ks[k]], d[key, ks[k]])
    return out
  }
  END {
    printf "Time: %.1f h from the first commit to the last, %d commits\n", (last - first) / 3600, n
    printf "Writer rounds: %d:%s\n", rounds["writer"], lines(add, del, "writer")
    printf "Review rounds: %d:%s\n", rounds["review"], lines(add, del, "review")
    printf "Owner rounds (rework): %d:%s\n", rounds["owner"], lines(add, del, "owner")
    for (s in seen) printf "%d\tStep L%d:%s\n", s, s, lines(sadd, sdel, s) | "sort -n | cut -f2-"
  }'
[ -n "$slug" ] || exit 0
notes=$(git log -p "$range" -- "docs/tickets/*_$slug/lab.md" | grep '^+.*\[N:ai\]' | sort -u || true)
printf 'Stops: %s\n' "$(printf '%s\n' "$notes" | grep -c 'Stop (' || true)"
printf '%s\n' "$notes" | grep 'Review ' | grep -oE '(Intent|Hunt|Rules|Design) [0-9]+/[0-9]+' |
  awk '{ split($2, f, "/"); found[$1] += f[1]; rejected[$1] += f[2] }
    END { for (p in found) printf "Review %s: %d found, %d rejected\n", p, found[p], rejected[p] }' ||
  true
