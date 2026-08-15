#!/usr/bin/env node
// Publish every plugin in this repo to npm.
//
// Each plugin folder is its own npm package (one plugin = one package, tagged
// `pragma-plugin`). This script:
//   1. syncs each plugin's package.json version from its manifest.json
//   2. runs `npm publish` in the plugin folder
//
// Usage:
//   node scripts/publish.mjs                   # publish all plugins
//   node scripts/publish.mjs convo             # publish one plugin
//   node scripts/publish.mjs --dry-run         # sync versions, don't publish
//   node scripts/publish.mjs --otp 123456      # pass the npm 2FA one-time code

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const dryRun = process.argv.includes('--dry-run')
const otpIdx = process.argv.indexOf('--otp')
const otp = otpIdx !== -1 ? process.argv[otpIdx + 1] : null
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))

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
  if (!dryRun) {
    execSync(`npm publish${otp ? ` --otp ${otp}` : ''}`, { cwd: dir, stdio: 'inherit' })
  }
  published.push(`${pkg.name}@${pkg.version}`)
}

console.log(`\n${dryRun ? 'Would publish' : 'Published'}: ${published.join(', ') || 'nothing'}`)
