// Paradoxiie: posts a version's "What's new" notes from the game's README to the Discord dev-log channel.
// Usage: node announce.mjs <path to README.md> <version> [release url]
// The webhook URL comes from the DISCORD_WEBHOOK environment variable (a GitHub secret). Without it, or with
// DRY_RUN=1, it only prints what it would send.
import { readFileSync } from 'node:fs'

const [readmePath, version, releaseUrl] = process.argv.slice(2)
if (!readmePath || !version) {
  console.error('usage: node announce.mjs README.md 1.32.0 [release-url]')
  process.exit(2)
}
const readme = readFileSync(readmePath, 'utf8')

// the "## What's new in X (note)" section for this version, up to the next "## " heading
const esc = version.replace(/\./g, '\\.')
const head = new RegExp(`^## What's new in ${esc}\\s*(?:\\(([^)]*)\\))?\\s*$`, 'm')
const m = head.exec(readme)
if (!m) {
  console.error(`No "What's new in ${version}" section in the README: nothing to announce.`)
  process.exit(0)
}
const note = m[1] ?? ''
let body = readme.slice(m.index + m[0].length)
const next = body.search(/^## /m)
if (next >= 0) body = body.slice(0, next)
body = body.trim()

// split into chunks at the bold section titles ("**Selling**") so each embed holds whole sections
const lines = body.split('\n')
const sections = []
let cur = []
for (const line of lines) {
  if (/^\*\*[^*]+\*\*\s*$/.test(line) && cur.length) {
    sections.push(cur.join('\n').trim())
    cur = []
  }
  cur.push(line)
}
if (cur.length) sections.push(cur.join('\n').trim())

// Discord: 4096 characters per embed description, 6000 per message, 10 embeds per message
const MAX_DESC = 3900
const chunks = []
let buf = ''
const push = () => {
  if (buf.trim()) chunks.push(buf.trim())
  buf = ''
}
for (const s of sections) {
  // a section too long on its own is cut at line breaks
  const parts = s.length > MAX_DESC ? s.split('\n') : [s]
  for (const p of parts) {
    const add = (buf ? '\n\n' : '') + p
    if ((buf + add).length > MAX_DESC) push()
    buf += (buf ? (parts.length > 1 ? '\n' : '\n\n') : '') + p
  }
}
push()

const color = 0xffb000
const title = `Hullbreak 3D ${version}${note ? ` · ${note}` : ''}`
const embeds = chunks.map((d, i) => ({
  ...(i === 0 ? { title, ...(releaseUrl ? { url: releaseUrl } : {}) } : {}),
  description: d,
  color,
  ...(i === chunks.length - 1 ? { footer: { text: 'Update from the launcher, or download the installer from the release page. The game updates itself.' } } : {})
}))

// group embeds into messages: at most 10 embeds and about 5800 characters each
const messages = []
let msg = []
let size = 0
for (const e of embeds) {
  const n = (e.title?.length ?? 0) + e.description.length + (e.footer?.text.length ?? 0)
  if (msg.length && (msg.length >= 10 || size + n > 5800)) {
    messages.push(msg)
    msg = []
    size = 0
  }
  msg.push(e)
  size += n
}
if (msg.length) messages.push(msg)

const hook = process.env.DISCORD_WEBHOOK
const dry = !hook || process.env.DRY_RUN === '1'
for (const [i, embedsOf] of messages.entries()) {
  const payload = {
    ...(i === 0 ? { content: `**New version: ${version}** is out!` } : {}),
    embeds: embedsOf,
    allowed_mentions: { parse: [] }
  }
  if (dry) {
    console.log(JSON.stringify(payload, null, 2))
    continue
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${hook}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.ok) break
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 2)
      await new Promise((r) => setTimeout(r, Math.ceil(wait * 1000) + 250))
      continue
    }
    console.error(`Discord said ${res.status}: ${await res.text()}`)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 800))
}
console.log(dry ? `Dry run: ${messages.length} message(s), ${embeds.length} embed(s).` : `Posted ${version} to Discord: ${messages.length} message(s).`)
