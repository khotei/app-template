# shellcheck shell=sh disable=SC2016,SC2154 # quoted Markdown; run.sh sets sample and ticket
# feature-only: the sample's feature.md alone, as /ticket-feature commits it. The architecture
# phase starts from it (R1, R2).
mkdir -p "$ticket" && cp "$sample/feature.md" "$ticket/feature.md" || exit 2
commit ':memo: docs(sample): Write the feature' \
  'The requirements and their acceptance, from the conversation.'
