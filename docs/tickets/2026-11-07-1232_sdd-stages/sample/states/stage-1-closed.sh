# shellcheck shell=sh disable=SC2016,SC2154 # quoted Markdown; run.sh sets ticket
# stage-1-closed: stage-1-done with S3 closed and stage 1's close recorded under its Stage review,
# so stage 2 is next to prepare (R6, R13) and stage 1 can be verified (R20).
build stage-1-done
close_step S3
replace "$ticket/plan.md" '### Stage review' '### Stage review

- Standards — no finding.
- Design — rejected: a module per target — the two commands share only `buildSlug`, and a second
  module needs the `#tickets/*` subpath the stage design set aside'
commit ':memo: docs(sample): St1 S3.2 (PLAN) Close S3' \
  'Passes: simplify, Standards, Spec, Design; no finding. The close of
stage 1 on St1 (PLAN) Prepare stage 1..HEAD: simplify changed nothing,
Standards found nothing, one Design finding rejected. No stage
verification is due: one stage has closed.'
