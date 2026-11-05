// Prints a version's "What's new" notes from the game's README (the text under "## What's new in X"),
// for the GitHub release, where the Paradoxiie Launcher shows them. Prints nothing if there's no such section.
// Usage: node notes.mjs <path to README.md> <version>
import { readFileSync } from 'node:fs'

const [readmePath, version] = process.argv.slice(2)
let readme = ''
try {
  readme = readFileSync(readmePath, 'utf8').replace(/\r/g, '')
} catch {
  process.exit(0)
}
const esc = version.replace(/\./g, '\\.')
const m = new RegExp(`^## What's new in ${esc}\\s*(?:\\(([^)]*)\\))?\\s*$`, 'm').exec(readme)
if (!m) process.exit(0)
let body = readme.slice(m.index + m[0].length)
const next = body.search(/^## /m)
if (next >= 0) body = body.slice(0, next)
process.stdout.write(body.trim() + '\n')
