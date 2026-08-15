#!/usr/bin/env node
// Generate the Pragma plugin registry index for a single-repo marketplace.
//
// Scans a directory holding plugin folders (each with a manifest.json) and
// emits an `index.json` that the app can fetch to discover + install every
// plugin. Each entry's `source` encodes everything the installer needs:
// git URL + per-plugin tag + subpath, e.g.
//
//   git:https://github.com/Sylviromi/pragma-plugins@alpha-v1.2.3#alpha
//   git:https://github.com/pragma/pragma@pragma-dev-v2.0.0#plugins/pragma-dev
//
// The plugins dir may be the repo root (pragma-plugins keeps plugins at the
// root) or a `plugins/` subfolder (pragma's own repo layout) — the subpath
// follows whichever it is.
//
// Usage:
//   node scripts/generate-plugin-index.js [pluginsDir] [owner/repo] [outFile]
//
// Defaults: plugins/  Sylviromi/pragma-plugins  index.json
// For the pragma-plugins repo (plugins at the root):
//   node scripts/generate-plugin-index.js . Sylviromi/pragma-plugins index.json
//
// Wire this into CI so index.json is always fresh:
//
//   on: { push: { branches: [main] } }
//   jobs: { index: { runs-on: ubuntu-latest, steps:
//     - uses: actions/checkout@v4
//     - run: node scripts/generate-plugin-index.js . Sylviromi/pragma-plugins index.json
//     - uses: stefanzweifel/git-auto-commit-action@v5 } }

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [pluginsDir = 'plugins', repo = 'Sylviromi/pragma-plugins', outFile = 'index.json'] = process.argv.slice(2)

function readManifest(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  } catch {
    return null
  }
}

const entries = []
for (const id of readdirSync(pluginsDir)) {
  if (id.startsWith('.')) continue // .git, .github, …
  const dir = join(pluginsDir, id)
  let isDir
  try {
    isDir = statSync(dir).isDirectory()
  } catch {
    continue
  }
  if (!isDir) continue
  const m = readManifest(dir)
  if (!m) continue // no manifest.json — not a plugin, skip silently
  if (m.id !== id) {
    console.warn(`skip ${id}: manifest id "${m.id}" does not match the folder`)
    continue
  }
  const tag = `${id}-v${m.version}`
  // Repo-root layout → `#<id>`; subfolder layout → `#<dir>/<id>`.
  const subpath = pluginsDir === '.' ? id : `${pluginsDir}/${id}`
  entries.push({
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description ?? '',
    author: m.author ?? '',
    publisher: m.publisher ?? '',
    repository: m.repository ?? '',
    homepage: m.homepage ?? '',
    // What the app's install_plugin accepts, pinned to this exact version.
    source: `git:https://github.com/${repo}@${tag}#${subpath}`,
  })
}

entries.sort((a, b) => a.id.localeCompare(b.id))
const index = {
  $schema: 'https://pragma.dev/schemas/plugin-index.json',
  generatedAt: new Date().toISOString(),
  repo: `https://github.com/${repo}`,
  pluginCount: entries.length,
  plugins: entries,
}

writeFileSync(outFile, JSON.stringify(index, null, 2) + '\n')
console.log(`✓ wrote ${entries.length} plugins to ${outFile}`)
