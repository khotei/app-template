# shellcheck shell=sh disable=SC2016,SC2154 # quoted Markdown; run.sh sets sample and ticket
# stage-1-done: architecture-done, the plan of plan.md as its approval commits it, and stage 1's
# rounds from St1 S1.1 to St1 S3.1: S1 and S2 closed, S3, the stage's last step, landed and not
# yet closed, so its passes and the stage's close come next (R10-R12, R21, R23). The runs that
# prepare stage 2 start from stage-1-closed.
build architecture-done
cp "$sample/plan.md" "$ticket/plan.md" || exit 2
commit ':memo: docs(sample): St1 (PLAN) Prepare stage 1' \
  'The skeleton in two stages, and stage 1 in full: its facts, A1 by a
probe, its design and its three steps.'

mkdir -p .misc/tickets || exit 2
cat > .misc/tickets/ticket.mjs << 'EOF'
// The ticket commands of the Makefile, each given a title in TITLE: `slug` prints its slug.
export function buildSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(' ')
    .filter(Boolean)
    .join('-')
}

if (import.meta.main) {
  const [command] = process.argv.slice(2)
  const title = process.env.TITLE ?? ''
  if (title === '') {
    console.error(`make ${command} TITLE="<title>": TITLE is empty`)
    process.exit(2)
  }
  console.log(buildSlug(title))
}
EOF
printf '\n.PHONY: slug\nslug: ## Print the slug of TITLE="<title>"\n\t@bun %s slug\n' \
  .misc/tickets/ticket.mjs >> Makefile
slug_row='| `make slug TITLE="<title>"` | `.misc/tickets/ticket.mjs` | prints the slug a ticket'"'"'s folder takes from the title |'
replace docs/knowledge/tooling.md '|---|---|---|' "|---|---|---|
$slug_row"
commit ":sparkles: feat(sample): St1 S1.1 Print a title's slug" \
  'make slug TITLE="<title>" prints the title'"'"'s words in lower case,
joined by hyphens, punctuation dropped. buildSlug builds it, the one
function make ticket will call too (D1).'
close_step S1
commit ':memo: docs(sample): St1 S1.2 (PLAN) Close S1' \
  'Passes: simplify, Standards, Spec, Design; no finding.'

cat > .misc/tickets/ticket.mjs << 'EOF'
// The ticket commands of the Makefile, each given a title in TITLE: `slug` prints its slug.
const maxLength = 30

export function buildSlug(title) {
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(' ')
    .filter(Boolean)
  let slug = ''
  for (const word of words) {
    const longer = slug === '' ? word : `${slug}-${word}`
    if (longer.length > maxLength) break
    slug = longer
  }
  return slug
}

if (import.meta.main) {
  const [command] = process.argv.slice(2)
  const title = process.env.TITLE ?? ''
  if (title === '') {
    console.error(`make ${command} TITLE="<title>": TITLE is empty`)
    process.exit(2)
  }
  console.log(buildSlug(title))
}
EOF
commit ':sparkles: feat(sample): St1 S2.1 Cut a long slug after a whole word' \
  'A slug over 30 characters ends after the last whole word that fits.'
replace .misc/tickets/ticket.mjs '  return slug' "  // A first word over the limit is cut, so the slug is never empty.
  return slug === '' ? (words[0] ?? '').slice(0, maxLength) : slug"
commit ':bug: fix(sample): St1 S2.2 (REVIEW) Keep the slug of one long word' \
  'Fixes St1 S2.1: a title whose first word is over 30 characters gave an
empty slug; it is now cut at 30.'
close_step S2 '- **Findings:**
  - Spec — accepted, fixed in St1 S2.2 — a first word over 30 characters gave an empty slug'
commit ':memo: docs(sample): St1 S2.3 (PLAN) Close S2' \
  'Passes: Standards, Spec; one finding, fixed in St1 S2.2.'

cat > .misc/tickets/ticket.mjs << 'EOF'
// The ticket commands of the Makefile, each given a title in TITLE: `slug` prints its slug, and
// `ticket` creates the ticket's folder from the template, named by the local time and the slug.
import { cpSync, readFileSync, writeFileSync } from 'node:fs'

const maxLength = 30
const tickets = 'docs/tickets'

export function buildSlug(title) {
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(' ')
    .filter(Boolean)
  let slug = ''
  for (const word of words) {
    const longer = slug === '' ? word : `${slug}-${word}`
    if (longer.length > maxLength) break
    slug = longer
  }
  // A first word over the limit is cut, so the slug is never empty.
  return slug === '' ? (words[0] ?? '').slice(0, maxLength) : slug
}

// The local time as YYYY-MM-DD-HHmm.
function formatStamp(date) {
  const parts = [date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]
  const [month, day, hours, minutes] = parts.map((part) => String(part).padStart(2, '0'))
  return `${date.getFullYear()}-${month}-${day}-${hours}${minutes}`
}

// Only the feature's heading takes the title; the other files keep the template's.
function createTicket(title) {
  const slug = buildSlug(title)
  const folder = `${tickets}/${formatStamp(new Date())}_${slug}`
  cpSync(`${tickets}/_template`, folder, { recursive: true })
  const feature = `${folder}/feature.md`
  const text = readFileSync(feature, 'utf8').replace(/^# <Title>$/m, () => `# ${title}`)
  writeFileSync(feature, text)
}

if (import.meta.main) {
  const [command] = process.argv.slice(2)
  const title = process.env.TITLE ?? ''
  if (title === '') {
    console.error(`make ${command} TITLE="<title>": TITLE is empty`)
    process.exit(2)
  }
  if (command === 'ticket') createTicket(title)
  else console.log(buildSlug(title))
}
EOF
printf '\n.PHONY: ticket\nticket: ## Create a ticket'"'"'s folder from the template: TITLE="<title>"\n\t@bun %s ticket\n' \
  .misc/tickets/ticket.mjs >> Makefile
replace docs/knowledge/tooling.md "$slug_row" "$slug_row
| \`make ticket TITLE=\"<title>\"\` | \`.misc/tickets/ticket.mjs\` | creates the ticket's folder from \`docs/tickets/_template/\`, named by the local time and the slug, the title as the feature's heading |"
commit ":sparkles: feat(sample): St1 S3.1 Create a ticket's folder from its title" \
  'make ticket TITLE="<title>" copies the template into
docs/tickets/<YYYY-MM-DD-HHmm>_<slug>/ in local time and writes the
title into the feature'"'"'s heading, the slug from buildSlug (D1).'
