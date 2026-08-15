// Frontend Developer skill sidecar — a tiny static file server that also
// answers the skill's tool calls over JSON-RPC 2.0 (newline-delimited JSON on
// stdin/stdout). One process, two roles: the tool API AND the thing the tools
// control. Depends only on Node's built-ins.
//
// v1.1 — preview-aware:
//   - `Cache-Control: no-store` on every response so the live preview
//     (miniscreen) actually sees edits without fighting browser caches.
//   - Generated directory index: requesting a folder without index.html
//     returns a browsable gallery of the HTML files inside — the "see all N
//     artifacts" surface for the viz workflow.
//   - `fe_serve_list` — enumerate served HTML files (name, url, mtime, size)
//     for the preview's file strip and for the model to verify visibility.
//   - `fe_serve_show` — set the per-server `activeFile`; the preview reads it
//     and navigates, so the model can point the user's screen at an artifact.
'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const servers = new Map() // abs dir -> { server, port, startedAt, activeFile }
const logs = []           // ring buffer of recent access/status lines
const LOG_CAP = 200

function log(line) {
  logs.push(`[${new Date().toISOString()}] ${line}`)
  if (logs.length > LOG_CAP) logs.shift()
  console.error('[fe] ' + line) // host stderr — keeps stdout JSON-clean
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain',
  '.md': 'text/markdown', '.map': 'application/json', '.wasm': 'application/wasm',
}

// Set by the initialize handshake — the session working directory.
let sessionDir = null

// ── file enumeration ────────────────────────────────────────────────────────
function relUrl(rel) {
  return '/' + rel.split(path.sep).map((s) => encodeURIComponent(s)).join('/')
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Recursively collect .html files under root (relative name, url, mtime, size).
 *  Heavy dependency/build dirs are skipped so a big project doesn't flood the
 *  preview's file strip or make the 2s poll crawl. */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'target', '.svelte-kit', '.next', '.nuxt',
  '.parcel-cache', '.cache', '__pycache__', '.venv', 'venv', 'coverage',
])

function htmlFiles(root) {
  const out = []
  const walk = (dir, base) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (e.name.startsWith('.')) continue // skip .git, etc.
      const full = path.join(dir, e.name)
      const rel = base ? path.join(base, e.name) : e.name
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        walk(full, rel)
      } else if (e.name.toLowerCase().endsWith('.html')) {
        try {
          const st = fs.statSync(full)
          out.push({ name: rel.split(path.sep).join('/'), url: relUrl(rel), mtimeMs: st.mtimeMs, size: st.size })
        } catch {}
      }
    }
  }
  walk(root, '')
  return out
}

/** Generated gallery page for a directory without index.html. */
function indexPage(dir) {
  const files = htmlFiles(dir)
  const rows = files.map((f) => {
    const size = f.size < 1024 ? `${f.size}B` : `${(f.size / 1024).toFixed(1)}KB`
    const when = new Date(f.mtimeMs).toLocaleString()
    return `<li><a href="${f.url}">${escapeHtml(f.name)}</a><span class="m">${size} · ${when}</span></li>`
  }).join('')
  const count = files.length
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>frontend-dev preview</title>
<style>
  body { font: 13px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #e6edf3; margin: 0; padding: 32px 40px; }
  h1 { font-size: 15px; font-weight: 600; letter-spacing: .02em; color: #9aa7b2; margin: 0 0 4px; }
  p.sub { margin: 0 0 20px; color: #6e7681; font-size: 12px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-width: 720px; }
  li { display: flex; align-items: baseline; gap: 12px; padding: 7px 10px; border: 1px solid #21262d; border-radius: 6px; background: #161b22; }
  li:hover { border-color: #1f6feb; }
  a { color: #58a6ff; text-decoration: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  a:hover { text-decoration: underline; }
  .m { color: #6e7681; font-size: 11px; margin-left: auto; }
  .empty { color: #6e7681; }
</style></head>
<body>
  <h1>frontend-dev preview</h1>
  <p class="sub">${count} HTML file${count === 1 ? '' : 's'} in this directory</p>
  ${rows ? `<ul>${rows}</ul>` : `<p class="empty">No HTML files here yet — write one and it appears (hot reload).</p>`}
</body></html>`
}

// ── server lifecycle ───────────────────────────────────────────────────────
function startServer(dir) {
  const abs = path.resolve(dir)
  if (!fs.existsSync(abs)) {
    return Promise.resolve({ ok: false, error: `no such directory: ${abs}` })
  }
  if (servers.has(abs)) {
    const s = servers.get(abs)
    log(`reused server for ${abs}:${s.port}`)
    return Promise.resolve({ ok: true, alreadyRunning: true, port: s.port, dir: abs, activeFile: s.activeFile || null })
  }
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath
      try {
        urlPath = decodeURIComponent((req.url || '/').split('?')[0])
      } catch {
        res.writeHead(400); res.end('bad request')
        log(`400 ${req.method} ${req.url}`)
        return
      }
      let file = path.join(abs, urlPath)
      if (!file.startsWith(abs)) {
        res.writeHead(403); res.end('forbidden')
        log(`403 ${req.method} ${req.url}`)
        return
      }
      if (urlPath === '/favicon.ico') {
        res.writeHead(204); res.end() // keep the request log quiet
        return
      }
      const noStore = { 'Cache-Control': 'no-store' }
      fs.stat(file, (err, st) => {
        if (!err && st.isDirectory()) {
          const idx = path.join(file, 'index.html')
          if (fs.existsSync(idx)) {
            file = idx
          } else {
            // Gallery page — one scroll sees every artifact in the folder.
            const page = indexPage(file)
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...noStore })
            res.end(page)
            log(`200 ${req.method} ${req.url} (dir index, ${page.length}b)`)
            return
          }
        }
        fs.readFile(file, (e2, data) => {
          if (e2) {
            res.writeHead(404, noStore); res.end('not found')
            log(`404 ${req.method} ${req.url}`)
            return
          }
          const ext = path.extname(file).toLowerCase()
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', ...noStore })
          res.end(data)
          log(`200 ${req.method} ${req.url} (${data.length}b)`)
        })
      })
    })
    server.on('error', (e) => {
      log(`server error: ${e.message}`)
      resolve({ ok: false, error: e.message })
    })
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      servers.set(abs, { server, port, startedAt: new Date().toISOString(), activeFile: null })
      log(`serving ${abs} on http://127.0.0.1:${port}`)
      resolve({ ok: true, port, dir: abs, activeFile: null })
    })
  })
}

function stopServer(dir) {
  const abs = path.resolve(dir)
  const entry = servers.get(abs)
  if (!entry) return { ok: true, alreadyStopped: true, dir: abs }
  entry.server.close()
  servers.delete(abs)
  log(`stopped ${abs}`)
  return { ok: true, dir: abs }
}

function status() {
  return {
    ok: true,
    sessionDir,
    servers: [...servers.entries()].map(([dir, s]) => ({
      dir, port: s.port, startedAt: s.startedAt, activeFile: s.activeFile || null,
    })),
  }
}

function listFiles(dir) {
  const abs = path.resolve(dir)
  if (!fs.existsSync(abs)) return { ok: false, error: `no such directory: ${abs}` }
  const s = servers.get(abs)
  if (!s) return { ok: false, error: `not serving ${abs} — call fe_serve_start first` }
  return { ok: true, dir: abs, activeFile: s.activeFile || null, htmlFiles: htmlFiles(abs) }
}

function showFile(dir, file) {
  const abs = path.resolve(dir)
  const s = servers.get(abs)
  if (!s) return { ok: false, error: `not serving ${abs} — call fe_serve_start first` }
  if (!file || typeof file !== 'string') {
    return { ok: false, error: 'specify "file" — a path relative to the served directory (e.g. "index.html" or "viz/03.html")' }
  }
  const target = path.resolve(abs, file)
  if (!target.startsWith(abs)) return { ok: false, error: `file outside served dir: ${file}` }
  let isFile = false
  try { isFile = fs.statSync(target).isFile() } catch {}
  if (!isFile) return { ok: false, error: `no such file: ${file}` }
  const rel = path.relative(abs, target).split(path.sep).join('/')
  s.activeFile = rel
  log(`show ${rel} on ${abs}:${s.port}`)
  return { ok: true, dir: abs, activeFile: rel }
}

// ── JSON-RPC plumbing ──────────────────────────────────────────────────────
function reply(id, payload, isError) {
  const result = {
    content: [
      { type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) },
    ],
    isError: !!isError,
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}

function replyErr(id, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -1, message } }) + '\n')
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  const { id } = msg
  if (msg.method === 'initialize') {
    sessionDir = (msg.params && msg.params.workingDir) || null
    log(`initialized (workingDir=${sessionDir || 'none'})`)
    // Protocol: initialize result carries protocolVersion + tools directly
    // (not the content envelope) so the host can read the capability echo.
    process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id, result: { protocolVersion: 1, tools: require('./tools.json') } }) + '\n'
    )
  } else if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params
    const a = args || {}
    try {
      if (name === 'fe_serve_start') {
        const dir = a.dir || sessionDir
        if (!dir) {
          reply(id, { ok: false, error: 'no working directory — call change_directory first, or pass "dir"' }, true)
          return
        }
        startServer(dir).then((r) => reply(id, r, !r.ok))
      } else if (name === 'fe_serve_status') {
        reply(id, status(), false)
      } else if (name === 'fe_serve_list') {
        const dir = a.dir || sessionDir
        if (!dir) {
          reply(id, { ok: false, error: 'no working directory — call change_directory first, or pass "dir"' }, true)
          return
        }
        const r = listFiles(dir)
        reply(id, r, !r.ok)
      } else if (name === 'fe_serve_show') {
        const dir = a.dir || sessionDir
        if (!dir) {
          reply(id, { ok: false, error: 'no working directory — call change_directory first, or pass "dir"' }, true)
          return
        }
        const r = showFile(dir, a.file)
        reply(id, r, !r.ok)
      } else if (name === 'fe_serve_stop') {
        const dir = a.dir || sessionDir
        if (!dir) {
          reply(id, { ok: false, error: 'specify "dir" or set a working directory first' }, true)
          return
        }
        reply(id, stopServer(dir), false)
      } else if (name === 'fe_serve_logs') {
        const n = Math.max(1, Math.min(LOG_CAP, (a.limit || 50) | 0))
        reply(id, { ok: true, logs: logs.slice(-n) }, false)
      } else {
        replyErr(id, `unknown tool: ${name}`)
      }
    } catch (e) {
      replyErr(id, `handler error: ${e.message}`)
    }
  }
})

process.on('exit', () => {
  for (const [, s] of servers) s.server.close()
})
