#!/usr/bin/env node
// Publish every plugin in this repo to npm.
//
// Each plugin folder is its own npm package (one plugin = one package, tagged
// `pragma-plugin`). This script:
//   1. loads NPM_TOKEN from .env (next to this script — the single source of
//      truth for the npm credential)
//   2. syncs each plugin's package.json version from its manifest.json
//   3. runs `npm publish` with the token (temp userconfig, deleted after)
//
// Usage:
//   node scripts/publish.mjs                     # publish all plugins
//   node scripts/publish.mjs convo               # publish one plugin
//   node scripts/publish.mjs --dry-run           # sync versions, don't publish
//   node scripts/publish.mjs --token npm_xxxx    # save a NEW token to .env, then publish
//   node scripts/publish.mjs --otp 123456        # (rare) pass an OTP for non-bypass tokens

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(HERE, '..', '.env')

const dryRun = process.argv.includes('--dry-run')
const otpIdx = process.argv.indexOf('--otp')
const otp = otpIdx !== -1 ? process.argv[otpIdx + 1] : null
const tokenIdx = process.argv.indexOf('--token')
const token = tokenIdx !== -1 ? process.argv[tokenIdx + 1] : null
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))

// ── token management ────────────────────────────────────────────────────────

/** Write the token to .env — the "easy way to change it": --token npm_xxx */
function saveToken(tok) {
  writeFileSync(ENV_PATH, `NPM_TOKEN=${tok}\n`, { mode: 0o600 })
  console.log(`✓ saved NPM_TOKEN to ${ENV_PATH}`)
}

/** Load NPM_TOKEN from .env into the process env. */
function loadEnv() {
  try {
    const text = readFileSync(ENV_PATH, 'utf8')
    for (const line of text.split('\n')) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
      if (m) process.env[m[1]] = m[2]
    }
  } catch {
    /* no .env — publish will rely on the user's npmrc */
  }
}

if (token) saveToken(token)
loadEnv()

// ── publishing ──────────────────────────────────────────────────────────────

/** Run `npm publish` with the token via a temp userconfig (deleted after). */
function npmPublish(dir) {
  const auth = process.env.NPM_TOKEN
  const args = ['publish']
  if (otp) args.push('--otp', otp)
  if (auth) {
    const tmp = join(tmpdir(), `pragma-npmrc-${process.pid}`)
    writeFileSync(tmp, `//registry.npmjs.org/:_authToken=${auth}\n`, { mode: 0o600 })
    try {
      args.push('--userconfig', tmp)
      execSync(`npm ${args.join(' ')}`, { cwd: dir, stdio: 'inherit' })
    } finally {
      rmSync(tmp, { force: true })
    }
  } else {
    execSync(`npm ${args.join(' ')}`, { cwd: dir, stdio: 'inherit' })
  }
}

const published = []
for (const id of readdirSync('.')) {
  if (!statSync(id).isDirectory() || id.startsWith('.')) continue
  if (only.length && !only.includes(id)) continue
  const dir = id
  const manifestPath = join(dir, 'manifest.json')
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(manifestPath) || !existsSync(pkgPath)) {
    console.warn(`skip ${dir}: missing manifest.json or package.json`)
    continue
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (!pkg.name.startsWith('pragma-plugin-')) {
    console.warn(`skip ${dir}: package name must start with pragma-plugin-`)
    continue
  }
  pkg.version = manifest.version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`\n→ ${pkg.name}@${pkg.version}${dryRun ? ' (dry-run)' : ''}`)
  if (!dryRun) npmPublish(dir)
  published.push(`${pkg.name}@${pkg.version}`)
}

console.log(`\n${dryRun ? 'Would publish' : 'Published'}: ${published.join(', ') || 'nothing'}`)
