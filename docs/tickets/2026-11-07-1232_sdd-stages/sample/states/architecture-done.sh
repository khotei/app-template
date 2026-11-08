# shellcheck shell=sh disable=SC2016,SC2154 # quoted Markdown; run.sh sets sample and ticket
# architecture-done: feature-only and the sample's architecture.md, as /ticket-architecture
# commits it. The first plan starts from it (R3-R5).
build feature-only
cp "$sample/architecture.md" "$ticket/architecture.md" || exit 2
commit ':memo: docs(sample): Design the ticket' \
  'The high level: the contracts, the seams, two decisions, the direction
and the assumptions, each naming the stage that checks it.'
