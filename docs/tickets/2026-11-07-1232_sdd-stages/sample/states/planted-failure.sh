# shellcheck shell=sh # run.sh sources this file
# planted-failure: stage-1-closed whose St1 S3.1 dropped the m flag of the heading's pattern, so
# its ^ and $ hold only at the file's ends and `make ticket` leaves the feature's heading
# `# <Title>`: R4's acceptance fails by a run, while the line reads as the right pattern. A
# stage 1 verification finds it and fixes it as a VERIFY round (R20).
# shellcheck disable=SC2329 # stage-1-done calls it
plant() {
  replace .misc/tickets/ticket.mjs \
    "  const text = readFileSync(feature, 'utf8').replace(/^# <Title>\$/m, () => \`# \${title}\`)" \
    "  const text = readFileSync(feature, 'utf8').replace(/^# <Title>\$/, () => \`# \${title}\`)"
}
build stage-1-closed
