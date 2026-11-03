// The paths: filters of the rules in .claude/rules/, subfolders included, as the harness loads
// them. One reader for the doc lint's unmatched-filter rule and for `make review-rules`, which runs
// this file to print `<rule> <filter>` per filter; a rule without paths: has none, since it loads
// in every session.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The filters of a file's front matter, each with its 1-based line: the lines open with `---` and
// the front matter ends at the next. A filter is read as a list item, an inline list or a scalar.
export function filtersOf(lines) {
  if (lines[0] !== '---') return []
  const found = []
  let inPaths = false
  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.startsWith('#')) continue
    if (line === '---') break
    let filters = []
    if (/^[^ -]/.test(line)) {
      inPaths = line.startsWith('paths:')
      const value = line.replace(/^paths: */, '').replace(/["']/g, '')
      if (inPaths) filters = value.startsWith('[') ? value.slice(1, -1).split(/ *, */) : [value]
    } else if (inPaths && /^ *- /.test(line)) filters = [line.replace(/^ *- *|["']/g, '')]
    for (const filter of filters.filter(Boolean)) found.push({ filter, lineNumber: index + 1 })
  }
  return found
}

if (import.meta.main) {
  const folder = '.claude/rules'
  for (const name of readdirSync(folder, { recursive: true })) {
    if (!name.endsWith('.md')) continue
    const rule = join(folder, name)
    for (const { filter } of filtersOf(readFileSync(rule, 'utf8').split('\n')))
      console.log(`${rule} ${filter}`)
  }
}
