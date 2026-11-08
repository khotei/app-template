# shellcheck shell=sh disable=SC2016,SC2154 # quoted Markdown; run.sh sets sample and ticket
# all-done: stage-1-closed, then stage 2 prepared from stage-2.md (its facts commit, then its
# preparation, which edits S6's skeleton row) and S4 to S6 landed and closed, a review round
# among them, so the whole ticket is ready for /ticket-verify and its per-stage table (R16).
build stage-1-closed
facts=$(sed '/^The stage fixes/,$d' "$sample/stage-2.md") || exit 2
design=$(sed -n '/^The stage fixes/,$p' "$sample/stage-2.md") || exit 2
last_fact='- `make ticket` prints nothing today (run in a `git clone --local`).'
replace "$ticket/plan.md" \
  'Not prepared: `/ticket-plan <ticket folder> next` prepares it once Stage 1 lands.' "$facts"
commit ':memo: docs(sample): St2 (PLAN) Record the facts of stage 2' \
  'A2 confirmed by a probe; the refusal fits before the copy; make ticket
prints nothing yet.'
replace "$ticket/plan.md" "$last_fact" "$last_fact

$design"
replace "$ticket/plan.md" \
  '| S6 | `make ticket` prints the folder and the next command | R6 | ~10, docs ~2 | todo |' \
  '| S6 | `make ticket` prints the folder, then the next command, a line each | R6 | ~10, docs ~2 | todo |'
commit ':memo: docs(sample): St2 (PLAN) Prepare stage 2' \
  'Stage 2'"'"'s design and S4 to S6 in full. The skeleton'"'"'s S6 now names its
two lines, since the stage takes the Direction'"'"'s layout; the coverage
and architecture.md are unchanged, and stage 1'"'"'s review left no finding
open.'

ticket_row='| `make ticket TITLE="<title>"` | `.misc/tickets/ticket.mjs` | creates the ticket'"'"'s folder from `docs/tickets/_template/`, named by the local time and the slug, the title as the feature'"'"'s heading |'
replace .misc/tickets/ticket.mjs \
  "import { cpSync, readFileSync, writeFileSync } from 'node:fs'" \
  "import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'"
replace .misc/tickets/ticket.mjs '  const slug = buildSlug(title)' '  const slug = buildSlug(title)
  const taken = readdirSync(tickets).find((name) => name.endsWith(slug))
  if (taken) {
    console.error(`refused: ${tickets}/${taken}/ already holds the slug ${slug}`)
    process.exit(1)
  }'
replace docs/knowledge/tooling.md "$ticket_row" "${ticket_row% |}; refuses a slug a ticket already holds, exit 1 |"
commit ':sparkles: feat(sample): St2 S4.1 Refuse a slug a ticket already holds' \
  'make ticket exits 1 and names the folder that holds the slug, creating
nothing (D2).'
replace .misc/tickets/ticket.mjs \
  '  const taken = readdirSync(tickets).find((name) => name.endsWith(slug))' \
  '  const taken = readdirSync(tickets).find((name) => name.endsWith(`_${slug}`))'
commit ':bug: fix(sample): St2 S4.2 (REVIEW) Compare the whole slug' \
  'Fixes St2 S4.1: my-sample-title was refused as taken by sample-title.'
close_step S4 '- **Findings:**
  - Spec — accepted, fixed in St2 S4.2 — `my-sample-title` was refused as taken by `sample-title`'
commit ':memo: docs(sample): St2 S4.3 (PLAN) Close S4' \
  'Passes: Standards, Spec; one finding, fixed in St2 S4.2.'

replace .misc/tickets/ticket.mjs '    .toLowerCase()' "    .normalize('NFD')
    .toLowerCase()"
commit ':sparkles: feat(sample): St2 S5.1 Write accented letters as base letters' \
  'normalize('"'"'NFD'"'"') splits each accented letter, and the filter drops its
mark (A2).'
close_step S5
commit ':memo: docs(sample): St2 S5.2 (PLAN) Close S5' 'Passes: Standards, Spec; no finding.'

replace .misc/tickets/ticket.mjs '  writeFileSync(feature, text)' '  writeFileSync(feature, text)
  console.log(`${folder}/`)
  console.log(`/ticket-feature ${folder}/`)'
replace docs/knowledge/tooling.md \
  "${ticket_row% |}; refuses a slug a ticket already holds, exit 1 |" \
  "${ticket_row% |}; refuses a slug a ticket already holds, exit 1; prints the folder, then \`/ticket-feature <folder>\` |"
commit ':sparkles: feat(sample): St2 S6.1 Print the folder and the next command' \
  'A created ticket prints its folder'"'"'s path, then /ticket-feature <folder>,
a line each, so a caller reads a whole line.'
close_step S6
replace "$ticket/plan.md" '### Stage review' '### Stage review

- Standards — no finding.
- Design — no finding.' last
commit ':memo: docs(sample): St2 S6.2 (PLAN) Close S6' \
  'Passes: Standards, Spec; no finding. The close of stage 2 on St2 (PLAN)
Prepare stage 2..HEAD: simplify changed nothing, Standards and Design
found nothing. A stage verification is due, two stages having closed;
not run.'
