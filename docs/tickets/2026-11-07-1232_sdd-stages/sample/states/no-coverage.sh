# shellcheck shell=sh disable=SC2016,SC2154 # quoted Markdown; run.sh sets sample
# no-coverage: stage-1-closed from a skeleton that never held S5, the only step of R3: its row,
# its coverage row and R3 in its stage's heading are gone from the first commit of the plan, so
# only a check against feature.md finds the gap when stage 2 is prepared (R7).
replace "$sample/plan.md" \
  '| S5 | accented letters become their base letters | R3 | ~5 | todo |' ''
replace "$sample/plan.md" '| R3 | S5 | Stage 2 |' ''
replace "$sample/plan.md" \
  '### Stage 2 — `make ticket` refuses a taken slug and names the next command · completes R3, R5, R6' \
  '### Stage 2 — `make ticket` refuses a taken slug and names the next command · completes R5, R6'
build stage-1-closed
