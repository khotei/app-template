// The doc lint (`make doc-lint`): the Markdown outside docs/tickets/ and repos/, held to the width
// and to the four rules below; every other markdownlint rule is off. What each guards:
// docs/knowledge/tooling.md › Commands.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { filtersOf } from '#rule-filters'

const root = import.meta.dirname

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
}

// The limits are numbers in the maintenance rule's limits line, its one author: the line that reads
// as LIMITS_LINE once its numbers become <n>. A reworded line stops the run, naming the line.
const LIMITS_RULE = '.claude/rules/claude-md.md'
const LIMITS_LINE = '- **Limits, checked by `make doc-lint`:** a `CLAUDE.md` <n> lines, a rule <n>.'
const limitsLines = readFileSync(resolve(root, LIMITS_RULE), 'utf8')
  .split('\n')
  .filter((line) => line.replace(/[0-9]+/g, '<n>') === LIMITS_LINE)
if (limitsLines.length !== 1) throw new Error(`${LIMITS_RULE} needs one line: ${LIMITS_LINE}`)
const [claudeMdLimit, ruleLimit] = limitsLines[0].match(/[0-9]+/g).map(Number)

const tracked = git('ls-files')
const tops = [...new Set(tracked.map((file) => file.split('/')[0]))]
// The globs walk only the tracked top-level folders, so an untracked tree (node_modules/, .git/)
// is never read and a new tracked folder is linted.
const folders = tops.filter((top) => tracked.some((file) => file.startsWith(`${top}/`)))
// A path is a span that starts at a tracked top-level entry and holds no placeholder, glob or
// space.
const PATH = new RegExp(
  `^(${tops.map((top) => top.replace(/[.]/g, '[.]')).join('|')})(/[A-Za-z0-9._-]+)*/?$`,
)
// Named on purpose, absent on purpose: the folders the docs forbid.
const ABSENT = ['docs/adr/', 'docs/superpowers/', '.claude/commands/']
// The roadmap plans files not built yet.
const ROADMAP = 'docs/knowledge/roadmap.md'
// The instruction files Claude reads, and a source path in one: a span with a `/` that ends in
// .ts, .tsx or .json and holds no placeholder or glob; a package specifier (`@<scope>/…`) passes.
// Why it fails whether the file exists or not: docs/knowledge/decisions.md › Instructions name
// patterns.
const INSTRUCTION = /^((.*\/)?CLAUDE[.]md|[.]claude\/(rules|skills|agents)\/.*)$/
const SOURCE_PATH = /^[^`<*?[{]*\/[^`<*?[{]*[.](ts|tsx|json)$/
const RULE = /^[.]claude\/rules\/.*[.]md$/

function fileOf(params) {
  return relative(root, resolve(params.name))
}

// Each line with its number, the front matter's included: markdownlint parts them.
function* linesOf(params) {
  for (const [index, line] of params.frontMatterLines.entries())
    yield { line, lineNumber: index + 1, frontMatter: true }
  for (const [index, line] of params.lines.entries()) yield { line, lineNumber: index + 1 }
}

function* spansOf(params) {
  for (const at of linesOf(params))
    for (const [span] of at.line.matchAll(/`[^`]+`/g)) yield { ...at, text: span.slice(1, -1) }
}

const missingPath = {
  names: ['missing-path'],
  description: 'A backticked path the repo lacks: fix the path, or cut it',
  tags: ['paths'],
  parser: 'none',
  function: (params, onError) => {
    if (fileOf(params) === ROADMAP) return
    for (const { text, lineNumber, frontMatter } of spansOf(params)) {
      const path = text.replace(/ › .*/, '')
      if (PATH.test(path) && !ABSENT.includes(path) && !existsSync(resolve(root, path)))
        onError({ lineNumber, frontMatter, detail: path })
    }
  },
}

const sourcePath = {
  names: ['source-path'],
  description:
    'An instruction file names a source file: write a <placeholder> pattern, the package specifier or the doc that owns the fact',
  tags: ['paths'],
  parser: 'none',
  function: (params, onError) => {
    if (!INSTRUCTION.test(fileOf(params))) return
    for (const { text, lineNumber, frontMatter } of spansOf(params))
      if (SOURCE_PATH.test(text) && !/^@[a-z0-9-]+\//.test(text))
        onError({ lineNumber, frontMatter, detail: text })
  },
}

// A rule loads only where its paths: filter matches a file, so a filter that matches none loads it
// nowhere. git's glob reads * and ** as the harness does and has no braces, so a brace fails too.
function matchesNoFile(filter) {
  return (
    git('ls-files', '--cached', '--others', '--exclude-standard', `:(glob)${filter}`).length === 0
  )
}

const unmatchedFilter = {
  names: ['unmatched-filter'],
  description:
    'A rule filter matches no file: point it at a folder that exists, with * and ** only',
  tags: ['rules'],
  parser: 'none',
  function: (params, onError) => {
    if (!RULE.test(fileOf(params))) return
    for (const { filter, lineNumber } of filtersOf(params.frontMatterLines))
      if (matchesNoFile(filter)) onError({ lineNumber, frontMatter: true, detail: filter })
  },
}

const overLimit = {
  names: ['over-limit'],
  description: `Over its limit: the test in ${LIMITS_RULE} says which lines go`,
  tags: ['rules'],
  parser: 'none',
  function: (params, onError) => {
    const file = fileOf(params)
    const limit = /(^|\/)CLAUDE[.]md$/.test(file) ? claudeMdLimit : RULE.test(file) ? ruleLimit : 0
    const lines = [...params.frontMatterLines, ...params.lines]
    const length = lines.at(-1) === '' ? lines.length - 1 : lines.length
    if (limit && length > limit)
      onError({
        lineNumber: limit + 1 - params.frontMatterLines.length,
        detail: `${length} lines, over ${limit}`,
      })
  },
}

export default {
  globs: ['*.md', ...folders.map((folder) => `${folder}/**/*.md`)],
  ignores: ['docs/tickets/**', 'repos/**'],
  // The root file only: `true` searches the whole tree for .gitignore files, half of a run, and
  // the repo's other ones are all in repos/.
  gitignore: '.gitignore',
  noBanner: true,
  noProgress: true,
  noInlineConfig: true,
  customRules: [missingPath, sourcePath, unmatchedFilter, overLimit],
  config: {
    default: false,
    // A prose line wraps at 100, as Biome's lineWidth does the code; a line with no space past 100
    // (a lone link or code span) passes.
    MD013: { line_length: 100, code_blocks: false, tables: false, headings: false },
    'missing-path': true,
    'source-path': true,
    'unmatched-filter': true,
    'over-limit': true,
  },
}
