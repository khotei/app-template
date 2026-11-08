# shellcheck shell=sh disable=SC2016,SC2154 # quoted Markdown; run.sh sets sample
# used-later: stage-1-closed from a ticket of three stages: R7 and its step S7, in stage 3, read
# the folder's path from the output of `make ticket`, so stage 2's choice of that output's layout
# changes a contract a later stage uses (R9), while S7 merely reusing the target's name does not.
replace "$sample/feature.md" \
  "- A command that creates a ticket's folder from the template under that slug." \
  "- A command that creates a ticket's folder from the template under that slug.
- The feature phase creating its ticket's folder through that command."
replace "$sample/feature.md" '  starts its feature phase.' "  starts its feature phase.

### The roadmap

- **R7** — WHEN the feature phase starts a ticket from a roadmap entry, THE SYSTEM SHALL create its
  folder through the same command and take the folder's path from its output."
replace "$sample/feature.md" \
  '| R6 | Its output names the new folder and `/ticket-feature docs/tickets/<now>_sample-title/` |' \
  '| R6 | Its output names the new folder and `/ticket-feature docs/tickets/<now>_sample-title/` |
| R7 | `/ticket-feature <slug>` on a roadmap entry runs `make ticket` and works in the folder it printed |'
replace "$sample/architecture.md" \
  '| `docs/knowledge/tooling.md` | the two targets in the **Commands** table |' \
  '| `docs/knowledge/tooling.md` | the two targets in the **Commands** table |
| the feature phase (`.claude/skills/ticket-feature/`) | creates its folder through `make ticket`, reading the path it prints |'
replace "$sample/plan.md" \
  '| S6 | `make ticket` prints the folder and the next command | R6 | ~10, docs ~2 | todo |' \
  '| S6 | `make ticket` prints the folder and the next command | R6 | ~10, docs ~2 | todo |

### Stage 3 — the feature phase creates its folder through `make ticket` (one step: one requirement left) · completes R7

| Step | Delivers | Serves | Size | Status |
|---|---|---|---|---|
| S7 | `/ticket-feature` runs `make ticket` and reads the folder from its output | R7 | ~5, docs ~10 | todo |'
replace "$sample/plan.md" '## Requirement coverage' \
  '## Stage 3 — the feature phase creates its folder through `make ticket`

Not prepared: `/ticket-plan <ticket folder> next` prepares it once Stage 2 lands.

## Requirement coverage'
replace "$sample/plan.md" '| R6 | S6 | Stage 2 |' '| R6 | S6 | Stage 2 |
| R7 | S7 | Stage 3 |'
build stage-1-closed
