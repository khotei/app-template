// Reads a `bun build --metafile` from the build's working directory and refuses every package in
// the bundle that the entry's manifest leaves out of `browserPackages`, printing the shortest import
// chain from the entry; the entry's own package is implied. Exit 1 on a refusal, 2 on a metafile or
// a manifest it cannot read, so a changed metafile shape never reads as a clean bundle.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

function stop(reason) {
  console.error(`bundle-check: ${reason}`)
  process.exit(2)
}

const manifests = new Map()

function manifestOf(file) {
  for (let folder = dirname(file); ; folder = dirname(folder)) {
    const path = join(folder, 'package.json')
    if (!manifests.has(path) && existsSync(path))
      manifests.set(path, JSON.parse(readFileSync(path, 'utf8')))
    if (manifests.has(path)) return { path, folder, manifest: manifests.get(path) }
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

const metafile = process.argv[2] ?? stop('usage: bun bundle-check.mjs <metafile>')
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

const imported = new Map()
const importers = new Map()
for (const [file, input] of Object.entries(inputs)) {
  if (!Array.isArray(input.imports)) stop(`${file} has no imports in ${metafile}`)
  imported.set(file, [...new Set(input.imports.flatMap(({ path }) => inputAt(path)))])
  for (const path of imported.get(file)) importers.set(path, [...(importers.get(path) ?? []), file])
}

const reachedFrom = new Map([[entry, null]])
for (const file of reachedFrom.keys())
  for (const path of imported.get(file) ?? [])
    if (!reachedFrom.has(path)) reachedFrom.set(path, file)

// A module the bundle dropped (a re-export a side-effects flag let go) is no input, so an input
// behind it is reached backwards, through its importers, up to one the entry reaches.
function chainTo(file) {
  const leadsTo = new Map([[file, null]])
  for (const current of leadsTo.keys()) {
    if (reachedFrom.has(current)) {
      const chain = []
      for (let step = current; step !== null; step = reachedFrom.get(step)) chain.unshift(step)
      for (let step = leadsTo.get(current); step !== null; step = leadsTo.get(step))
        chain.push(step)
      return chain
    }
    for (const importer of importers.get(current) ?? [])
      if (!leadsTo.has(importer)) leadsTo.set(importer, current)
  }
  const top = [...leadsTo.keys()].find((step) => !importers.has(step))
  const chain = [entry, '… (a module the bundle dropped)']
  for (let step = top ?? file; step !== null; step = leadsTo.get(step)) chain.push(step)
  return chain
}

const manifest = manifestOf(entry)
const allowed = manifest.manifest.browserPackages
if (!Array.isArray(allowed)) stop(`${manifest.path} has no browserPackages list`)
const allowedPackages = new Set([packageOf(entry), ...allowed])

const refused = new Map()
for (const file of [...reachedFrom.keys(), ...Object.keys(inputs)]) {
  const name = packageOf(file)
  if (!allowedPackages.has(name) && !refused.has(name)) refused.set(name, file)
}
for (const [name, file] of refused) {
  console.error(`bundle-check: ${name} is not in ${manifest.path} › browserPackages`)
  console.error(
    chainTo(file)
      .map((step, index) => `${index === 0 ? ' ' : '→'} ${step}`)
      .join('\n'),
  )
}
process.exit(refused.size === 0 ? 0 : 1)
