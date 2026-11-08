# shellcheck shell=sh disable=SC2016,SC2154 # quoted Markdown; run.sh sets sample
# forced-choice: stage-1-closed from a feature that asks every Latin letter outside ASCII in
# ASCII (ø, ß), and an assumption A2 of stage 2 that decomposition alone does it. A run shows A2
# false, since NFD leaves ø and ß whole, so the slug's contract has two shapes left: ASCII through
# a table of its own, or letters outside ASCII allowed (R8). The text alone reads as true.
replace "$sample/feature.md" \
  '- **R3** — WHEN the title holds accented letters (é, ü, ç), THE SYSTEM SHALL write each as its' \
  '- **R3** — WHEN the title holds a Latin letter outside ASCII (é, ø, ß), THE SYSTEM SHALL write it'
replace "$sample/feature.md" '  base letter.' \
  '  in ASCII, so a slug holds only ASCII letters, digits and hyphens.'
replace "$sample/feature.md" '| R3 | `make slug TITLE="Über Ça"` prints `uber-ca` |' \
  '| R3 | `make slug TITLE="Über Øresund Straße"` prints `uber-oresund-strasse` |'
replace "$sample/architecture.md" \
  '  characters, cut at a word boundary, an accented letter written as its base letter; one function' \
  '  characters, cut at a word boundary, ASCII only, a Latin letter outside it written in ASCII; one function'
replace "$sample/architecture.md" \
  '- **A2 — Unicode decomposition (NFD) followed by dropping the combining marks turns é, ü and ç' \
  '- **A2 — Unicode decomposition (NFD) followed by dropping the combining marks writes every Latin'
replace "$sample/architecture.md" \
  '  into e, u and c.** Checked in Stage 2, by a probe. If false: the slug Contract changes.' \
  '  letter outside ASCII in ASCII.** Checked in Stage 2, by a probe. If false: the slug Contract changes.'
replace "$sample/plan.md" \
  '| S5 | accented letters become their base letters | R3 | ~5 | todo |' \
  '| S5 | a Latin letter outside ASCII is written in ASCII | R3 | ~5 | todo |'
build stage-1-closed
