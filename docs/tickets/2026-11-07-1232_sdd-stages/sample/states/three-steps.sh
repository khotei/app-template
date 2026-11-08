# shellcheck shell=sh disable=SC2016,SC2154 # quoted Markdown; run.sh sets sample
# three-steps: architecture-done for a smaller ticket, the slug alone, whose steps fit one stage
# (R14): the feature and architecture of three-steps/.
cp "$sample/three-steps/feature.md" "$sample/three-steps/architecture.md" "$sample/" || exit 2
build architecture-done
