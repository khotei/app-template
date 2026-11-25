// Reads a `bun build --metafile` from the build's working directory and refuses, printing the
// shortest import chain from the entry, every input whose path matches a glob given after the
// metafile or, given none, every package in the bundle that the entry's manifest leaves out of
// `browserPackages`, the entry's own package implied. Exit 1 on a refusal, 2 on a metafile or a
// manifest it cannot read, so a changed metafile shape never reads as a clean bundle.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

function stop(reason) {
  console.error(`bundle-check: ${reason}`)
  process.exit(2)
}

function manifestOf(file) {
  for (let folder = dirname(file); ; folder = dirname(folder)) {
    const path = join(folder, 'package.json')
    if (existsSync(path)) return { path, folder, manifest: JSON.parse(readFileSync(path, 'utf8')) }
    if (dirname(folder) === folder) stop(`no package.json above ${file}`)
  }
}

// A built-in (`node:crypto`, polyfilled for the browser) is its own package. An input under
// node_modules belongs to the package its last node_modules segment names: the segments before it
// carry a version and a hash. Any other belongs to its manifest's name, plus the subpath of the
// export whose target folder holds it most closely.
function packageOf(file) {
  if (/^[a-z]+:/.test(file)) return file
  const installed = /.*node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(file)
  if (installed) return installed[1]
  const { path, folder, manifest } = manifestOf(file)
  if (typeof manifest.name !== 'string') stop(`${path} has no name`)
  const inside = relative(folder, file)
  const holders = Object.entries(manifest.exports ?? {}).flatMap(([subpath, target]) => {
    if (typeof target !== 'string' || subpath.includes('*')) return []
    const held = relative(folder, dirname(join(folder, target)))
    return held === '' || inside.startsWith(`${held}/`) ? [{ subpath, depth: held.length }] : []
  })
  const closest = holders.reduce((best, holder) => (holder.depth > best.depth ? holder : best), {
    subpath: '.',
    depth: -1,
  })
  return manifest.name + closest.subpath.slice(1)
}

const [
  metafile = stop('usage: bun bundle-check.mjs <metafile> [<refused glob>…]'),
  ...refusedGlobs
] = process.argv.slice(2)
const { inputs, outputs } = existsSync(metafile)
  ? JSON.parse(readFileSync(metafile, 'utf8'))
  : stop(`no metafile at ${metafile}`)
if (!(inputs instanceof Object) || !(outputs instanceof Object))
  stop(`${metafile} has no inputs or no outputs`)
const entries = Object.values(outputs).flatMap((output) => output.entryPoint ?? [])
if (entries.length !== 1) stop(`${metafile} names ${entries.length} entry points, not one`)
const [entry] = entries
if (!(entry in inputs)) stop(`${metafile} lists no input for its entry point ${entry}`)

// Bun records an import of a folder as `<folder>.js` while the input is `<folder>/index.js`.
const inputAt = (path) =>
  [path, path.replace(/(\.[a-z]+)$/, '/index$1')].find((candidate) => candidate in inputs) ?? []

const importers = new Map()
for (const [file, input] of Object.entries(inputs)) {
  if (!Array.isArray(input.imports)) stop(`${file} has no imports in ${metafile}`)
  for (const path of new Set(input.imports.flatMap((imported) => inputAt(imported.path))))
    importers.set(path, [...(importers.get(path) ?? []), file])
}

// The shortest chain, walked back from the input through its importers to the entry. A module the
// bundle dropped (a re-export a side-effects flag let go) is no input, so a chain through it starts
// at the topmost importer the walk finds.
const dropped = '… (a module the bundle dropped)'

function chainTo(file) {
  const leadsTo = new Map([[file, null]])
  for (const current of leadsTo.keys())
    for (const importer of importers.get(current) ?? [])
      if (!leadsTo.has(importer)) leadsTo.set(importer, current)
  const top = leadsTo.has(entry)
    ? entry
    : ([...leadsTo.keys()].find((step) => !importers.has(step)) ?? file)
  const chain = top === entry ? [] : [entry, dropped]
  for (let step = top; step !== null; step = leadsTo.get(step)) chain.push(step)
  return chain
}

// Each refusal's reason, which groups its inputs: a glob the caller refuses, else a package the
// entry's manifest leaves out.
function refuseMatching(globs) {
  const matchers = globs.map((glob) => new Bun.Glob(glob))
  return (file) => {
    const index = matchers.findIndex((matcher) => matcher.match(file))
    return index === -1 ? null : `${entry} reads ${globs[index]}`
  }
}

function refuseOutsideBrowserPackages() {
  const { path, manifest } = manifestOf(entry)
  if (!Array.isArray(manifest.browserPackages)) stop(`${path} has no browserPackages list`)
  const allowed = new Set([packageOf(entry), ...manifest.browserPackages])
  return (file) => {
    const name = packageOf(file)
    return allowed.has(name) ? null : `${name} is not in ${path} › browserPackages`
  }
}

const refusalOf =
  refusedGlobs.length > 0 ? refuseMatching(refusedGlobs) : refuseOutsideBrowserPackages()
const refused = new Map()
for (const file of Object.keys(inputs)) {
  const reason = refusalOf(file)
  if (reason !== null) refused.set(reason, [...(refused.get(reason) ?? []), file])
}

// A chain with a gap ranks after every whole one; a tie keeps the first.
const rankOf = (chain) => (chain[1] === dropped ? Number.POSITIVE_INFINITY : chain.length)

for (const [reason, files] of refused) {
  const shortest = files
    .map(chainTo)
    .reduce((best, chain) => (rankOf(chain) < rankOf(best) ? chain : best))
  console.error(`bundle-check: ${reason}`)
  console.error(shortest.map((step, index) => `${index === 0 ? ' ' : '→'} ${step}`).join('\n'))
}
process.exit(refused.size === 0 ? 0 : 1)
