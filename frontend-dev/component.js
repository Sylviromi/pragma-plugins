// Frontend Developer — live preview miniscreen.
//
// Claims the app's `miniscreen` slot. Renders whatever static server the
// AGENT started (fe_serve_start on any directory) in a docked, hot-reloading
// iframe panel: file strip to switch between artifacts, fullscreen/minimize,
// open-in-browser, and auto-follows the model's fe_serve_show.
//
// The widget never serves anything by itself — it follows the agent. With no
// server running it collapses to a slim idle strip; when the agent opens a
// server (any directory), the panel expands and shows it.
//
// Plain ES module — the app wraps the default export in a custom element.
// Talks to the skill sidecar through the call_skill_tool bridge command
// (which spawns the handler on demand).

const SKILL = 'frontend-dev/frontend-dev'
const PLUGIN = 'frontend-dev'
const POLL_MS = 2000
const DOCK_W = 560
const DOCK_H = 380
const POS_KEY = 'pragma:fe-preview-pos'

// Material Symbols (24dp) — inline SVG, currentColor.
const ICONS = {
  drag_indicator: '<path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>',
  refresh: '<path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>',
  open_in_new: '<path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>',
  fullscreen: '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>',
  fullscreen_exit: '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>',
  minimize: '<path d="M6 19h12v-2H6v2z"/>',
  expand_less: '<path d="m12 8-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>',
}
const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">${ICONS[name]}</svg>`

const STYLES = `
  :host {
    position: fixed;
    right: 14px;
    bottom: 14px;
    width: ${DOCK_W}px;
    height: ${DOCK_H}px;
    z-index: 900;
    display: flex;
    flex-direction: column;
    /* Mounted in the app's free plugin layer (pointer-events: none) — the
       panel itself must accept input. */
    pointer-events: auto;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 11px;
    color: var(--text-primary, #e6edf3);
    background: var(--bg-overlay, #0d1117);
    border: 1px solid var(--border-default, #30363d);
    border-radius: 10px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, .5);
    overflow: hidden;
    transition: width .18s ease, height .18s ease, border-radius .18s ease;
  }
  :host(.fullscreen) {
    right: 0;
    bottom: 0;
    left: 0;
    top: 0;
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    border: none;
    z-index: 1000;
  }
  :host(.collapsed) {
    width: 300px;
    height: auto;
  }
  :host(.collapsed) .chips,
  :host(.collapsed) .body { display: none; }
  :host(.fullscreen) .drag { display: none; }
  :host(.fullscreen) .b-collapse { display: none; }

  .win { display: flex; flex-direction: column; flex: 1; min-height: 0; }

  .hdr {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px 5px 6px;
    background: var(--bg-elevated, #161b22);
    border-bottom: 1px solid var(--border-default, #30363d);
    flex: none;
    user-select: none;
    min-width: 0;
    cursor: grab;
  }
  :host(.fullscreen) .hdr { cursor: default; }
  :host(.dragging) .hdr { cursor: grabbing; }
  .drag {
    flex: none; display: flex; align-items: center; justify-content: center;
    width: 18px; height: 22px; color: var(--text-secondary, #6e7681);
    pointer-events: none; /* the whole header drags — this is just a hint */
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #5a6672; flex: none; }
  .dot.live { background: var(--success, #3fb950); box-shadow: 0 0 6px var(--success, #3fb950); }
  .dot.err { background: var(--danger, #f85149); }
  .title { color: var(--text-secondary, #9aa7b2); letter-spacing: .05em; text-transform: uppercase; font-weight: 600; flex: none; }
  .srv {
    flex: 1; min-width: 0;
    font: inherit; color: var(--text-primary, #e6edf3);
    background: transparent; border: none; outline: none;
    cursor: pointer; text-overflow: ellipsis;
  }
  .srv option { background: var(--bg-elevated, #161b22); color: var(--text-primary, #e6edf3); }
  .port { color: var(--accent, #58a6ff); flex: none; }
  .grow { flex: 1; }
  .btn {
    flex: none;
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 22px;
    background: transparent; color: var(--text-secondary, #9aa7b2);
    border: 1px solid transparent; border-radius: 5px;
    cursor: pointer; padding: 0;
  }
  .btn svg { pointer-events: none; }
  .btn:hover { border-color: var(--border-default, #30363d); color: var(--text-primary, #e6edf3); background: var(--bg-overlay, #0d1117); }
  .btn:disabled { opacity: .35; cursor: default; }

  .chips {
    display: flex; align-items: center; gap: 5px;
    padding: 5px 8px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border-default, #21262d);
    flex: none;
    scrollbar-width: thin;
  }
  .chip {
    flex: none;
    font: inherit;
    color: var(--text-secondary, #9aa7b2);
    background: transparent;
    border: 1px solid var(--border-default, #30363d);
    border-radius: 999px;
    padding: 1px 9px;
    cursor: pointer;
    max-width: 240px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .chip:hover { color: var(--text-primary, #e6edf3); border-color: var(--accent, #1f6feb); }
  .chip.on { color: var(--accent, #58a6ff); border-color: var(--accent, #1f6feb); background: rgba(31, 111, 235, .14); }
  .chip-empty { color: var(--text-secondary, #6e7681); padding: 1px 4px; }

  .body { position: relative; flex: 1; min-height: 0; background: #0d1117; }
  iframe {
    position: absolute; inset: 0; width: 100%; height: 100%;
    border: none; background: #fff; display: none;
  }
  .body.live iframe { display: block; }
  .hint {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; text-align: center; padding: 18px;
    color: var(--text-secondary, #9aa7b2);
  }
  .hint .big { font-size: 12px; color: var(--text-primary, #e6edf3); }
  .hint .sub { font-size: 11px; color: var(--text-secondary, #6e7681); max-width: 46ch; line-height: 1.5; }
  .hint .err { color: var(--danger, #f85149); }
  .flash {
    position: absolute; top: 0; left: 0; right: 0;
    height: 2px; background: var(--accent, #58a6ff);
    opacity: 0; pointer-events: none;
    transition: opacity .3s ease;
  }
  .flash.on { opacity: 1; }
`

export default class FrontendDevPreview extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="win">
        <div class="hdr" id="hdr">
          <span class="drag" id="drag" title="Drag to move">${icon('drag_indicator')}</span>
          <span class="dot" id="dot"></span>
          <span class="title">preview</span>
          <select class="srv" id="srv" title="Running preview server"></select>
          <span class="port" id="port"></span>
          <span class="grow"></span>
          <button class="btn" id="b-reload" title="Reload">${icon('refresh')}</button>
          <button class="btn" id="b-open" title="Open in browser">${icon('open_in_new')}</button>
          <button class="btn" id="b-expand" title="Fullscreen">${icon('fullscreen')}</button>
          <button class="btn b-collapse" id="b-collapse" title="Minimize">${icon('minimize')}</button>
        </div>
        <div class="chips" id="chips"></div>
        <div class="body" id="body">
          <iframe id="frame" allow="fullscreen"></iframe>
          <div class="flash" id="flash"></div>
          <div class="hint" id="hint"></div>
        </div>
      </div>`

    this._q = (s) => this.shadowRoot.querySelector(s)
    this._frame = this._q('#frame')
    this._hint = this._q('#hint')
    this._body = this._q('#body')
    this._chipsEl = this._q('#chips')
    this._dot = this._q('#dot')
    this._portEl = this._q('#port')
    this._srvEl = this._q('#srv')

    // instance state
    this._shown = null          // file currently loaded in the iframe
    this._mtimes = new Map()    // name -> mtimeMs (hot-reload baseline)
    this._stamp = 0             // last nav timestamp (cache-busting)
    this._server = null         // selected server entry { dir, port, activeFile }
    this._servers = []          // all running servers (status payload)
    this._seenDirs = new Set()  // server dirs we've already displayed
    this._list = null           // fe_serve_list payload for the selected server
    this._mode = 'docked'       // docked | fullscreen | collapsed
    this._wasIdle = true
    this._polling = false
    this._dead = false
    this._drag = null

    this._restorePos()
    this._bind()
    this._setMode(this._servers.length ? 'docked' : 'collapsed', { silent: true })

    this._timer = setInterval(() => this._poll(), POLL_MS)
    this._poll()
  }

  disconnectedCallback() {
    this._dead = true
    if (this._timer) clearInterval(this._timer)
  }

  // ── bridge helpers ───────────────────────────────────────────────────────
  hasTauri() { return typeof window !== 'undefined' && !!window.__TAURI__?.core?.invoke }
  invoke(cmd, args) { return window.__TAURI__.core.invoke(cmd, args || {}) }
  async _tool(name, args) {
    return this.invoke('call_skill_tool', { skillId: SKILL, name, arguments: args || {} })
  }

  // ── polling ──────────────────────────────────────────────────────────────
  async _poll() {
    if (this._polling || this._dead) return
    this._polling = true
    try {
      if (!this.hasTauri()) { this._setState('no-bridge'); return }
      const stRaw = await this._tool('fe_serve_status', {})
      const st = JSON.parse(stRaw)
      const servers = (st.servers || []).filter((s) => s && s.dir && s.port)

      if (!servers.length) {
        const becameIdle = this._state !== 'idle' && this._state !== 'no-bridge'
        this._servers = []
        this._server = null
        this._setState('idle')
        // Auto-collapse only ONCE when the preview becomes idle (e.g. the
        // server stopped). After that, respect whatever mode the user chose
        // — never fight their clicks by re-collapsing on every poll.
        if (becameIdle) this._setMode('collapsed')
        return
      }

      // Agent opened a NEW server (never seen) → switch to it.
      const fresh = servers.find((s) => !this._seenDirs.has(s.dir))
      const keep = this._server && servers.find((s) => s.dir === this._server.dir)
      this._server = fresh || keep || servers[servers.length - 1]
      for (const s of servers) this._seenDirs.add(s.dir)
      this._servers = servers

      // Agent started a server while we were idle → expand automatically.
      if (this._wasIdle) this._setMode('docked')

      const lsRaw = await this._tool('fe_serve_list', { dir: this._server.dir })
      const ls = JSON.parse(lsRaw)
      if (!ls.ok) { this._setState('error', { err: ls.error }); return }
      this._list = ls
      this._setState('live')
      this._sync()
    } catch (e) {
      this._setState('error', { err: String(e).slice(0, 120) })
    } finally {
      this._polling = false
    }
  }

  // Keep the iframe in sync with the served directory + server state.
  _sync() {
    const files = (this._list && this._list.htmlFiles) || []
    this._renderChips(files)

    // Baseline from the PREVIOUS poll — used for the hot-reload diff below.
    const prevMtimes = this._mtimes

    // 1. Model-directed navigation (fe_serve_show) wins over local choice.
    const serverActive = (this._list && this._list.activeFile) || null
    if (serverActive && serverActive !== this._shown) {
      this._mtimes = new Map(files.map((x) => [x.name, x.mtimeMs]))
      this._navigate(serverActive)
      return
    }

    // 2. First time here — pick index.html, else the root gallery (which
    //    lists every artifact, like the "see all N" flow).
    if (!this._shown) {
      const def = files.find((f) => f.name === 'index.html')
      this._mtimes = new Map(files.map((x) => [x.name, x.mtimeMs]))
      this._navigate(def ? def.name : '')
      return
    }

    // 3. Shown file deleted → fall back to index.html or the root gallery.
    const shown = files.find((x) => x.name === this._shown)
    if (!shown) {
      const def = files.find((f) => f.name === 'index.html')
      this._mtimes = new Map(files.map((x) => [x.name, x.mtimeMs]))
      this._navigate(def ? def.name : '')
      return
    }

    // 4. Hot reload: the shown file changed on disk → reload it.
    const prev = prevMtimes.get(this._shown)
    if (prev !== undefined && shown.mtimeMs !== prev) {
      this._navigate(this._shown)
    }
    this._mtimes = new Map(files.map((x) => [x.name, x.mtimeMs]))
  }

  _navigate(name) {
    this._shown = name
    this._stamp = Date.now()
    if (!this._server) return
    const base = `http://127.0.0.1:${this._server.port}`
    const enc = name ? '/' + name.split('/').map(encodeURIComponent).join('/') : '/'
    this._frame.src = base + enc + (enc.includes('?') ? '&' : '?') + 'v=' + this._stamp
    this._flash()
    this._renderChips((this._list && this._list.htmlFiles) || [])
  }

  _flash() {
    const f = this._q('#flash')
    if (!f) return
    f.classList.add('on')
    clearTimeout(this._flashT)
    this._flashT = setTimeout(() => f.classList.remove('on'), 320)
  }

  _renderChips(files) {
    if (!this._chipsEl) return
    this._chipsEl.innerHTML = ''
    if (!files.length) {
      const span = document.createElement('span')
      span.className = 'chip-empty'
      span.textContent = 'no html files yet — write one, it appears live'
      this._chipsEl.appendChild(span)
      return
    }
    for (const f of files) {
      const b = document.createElement('button')
      b.className = 'chip' + (f.name === this._shown ? ' on' : '')
      b.textContent = f.name
      b.title = f.url
      b.addEventListener('click', () => {
        this._navigate(f.name)
        // Keep the server state in sync so the model sees what's shown.
        this._tool('fe_serve_show', { dir: this._server.dir, file: f.name }).catch(() => {})
      })
      this._chipsEl.appendChild(b)
    }
  }

  _renderServers() {
    if (!this._srvEl) return
    this._srvEl.innerHTML = ''
    for (const s of this._servers) {
      const o = document.createElement('option')
      o.value = s.dir
      o.textContent = `${s.dir.split(/[\\/]/).pop() || s.dir} · :${s.port}`
      if (this._server && s.dir === this._server.dir) o.selected = true
      this._srvEl.appendChild(o)
    }
    this._srvEl.style.display = this._servers.length ? '' : 'none'
    this._portEl.textContent = this._server ? `:${this._server.port}` : ''
  }

  // ── rendering ────────────────────────────────────────────────────────────
  _setState(state, info) {
    if (this._dead) return
    this._state = state
    this._wasIdle = state === 'idle' || state === 'no-bridge'
    if (info && info.err) this._lastErr = info.err
    this._dot.className = 'dot ' + (state === 'live' ? 'live' : state === 'error' ? 'err' : '')
    const live = state === 'live'
    this._body.classList.toggle('live', live)
    this._renderServers()

    const btn = (id, disabled, visible) => {
      const el = this._q(id)
      if (el) { el.disabled = !!disabled; el.style.display = visible === false ? 'none' : '' }
    }
    btn('#b-reload', !live)
    btn('#b-open', !live)
    btn('#b-expand', !live)

    if (live) {
      this._hint.style.display = 'none'
      return
    }
    this._hint.style.display = 'flex'
    this._frame.src = ''
    let big = '', sub = ''
    if (state === 'no-bridge') {
      big = 'preview unavailable'
      sub = 'This widget needs the Tauri bridge. Run the app with `npm run tauri`.'
    } else if (state === 'idle') {
      big = 'no preview server'
      sub = 'The agent opens the preview when it wants to show you something — ask it to build a page and it appears here with hot reload.'
    } else if (state === 'error') {
      big = 'preview error'
      sub = String((this._lastErr || '')).slice(0, 120)
    }
    this._hint.innerHTML = `<span class="big">${big}</span><span class="sub ${state === 'error' ? 'err' : ''}"></span>`
    this._hint.querySelector('.sub').textContent = sub
  }

  // ── mode: docked / fullscreen / collapsed ────────────────────────────────
  _setMode(mode) {
    this._mode = mode
    this.classList.toggle('fullscreen', mode === 'fullscreen')
    this.classList.toggle('collapsed', mode === 'collapsed')
    const expand = this._q('#b-expand')
    const collapse = this._q('#b-collapse')
    if (expand) {
      const fs = mode === 'fullscreen'
      expand.innerHTML = icon(fs ? 'fullscreen_exit' : 'fullscreen')
      expand.title = fs ? 'Minimize' : 'Fullscreen'
      expand.disabled = !this._server
    }
    if (collapse) {
      const coll = mode === 'collapsed'
      collapse.innerHTML = icon(coll ? 'expand_less' : 'minimize')
      collapse.title = coll ? 'Restore' : 'Minimize'
    }
    if (mode !== 'fullscreen') this._applyPos()
  }

  // ── dragging (docked + collapsed; fullscreen is fixed) ──────────────────
  _restorePos() {
    try {
      const raw = localStorage.getItem(POS_KEY)
      if (!raw) return
      const p = JSON.parse(raw)
      if (typeof p.left === 'number' && typeof p.top === 'number') {
        this._pos = p
        this._applyPos()
      }
    } catch {}
  }

  _applyPos() {
    if (!this._pos || this._mode === 'fullscreen') return
    this.style.left = `${this._pos.left}px`
    this.style.top = `${this._pos.top}px`
    this.style.right = 'auto'
    this.style.bottom = 'auto'
  }

  // The whole header is the drag handle (buttons/select excepted). At least
  // MIN_VISIBLE px of the panel stays on screen so it can be parked anywhere
  // and still grabbed again.
  _beginDrag(e) {
    if (this._mode === 'fullscreen') return
    if (e.target.closest('button, select')) return
    e.preventDefault()
    const r = this.getBoundingClientRect()
    this._drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, moved: false }
    this.classList.add('dragging')
    window.addEventListener('pointermove', this._onDragMove)
    window.addEventListener('pointerup', this._onDragEnd)
  }

  _onDragMove = (e) => {
    if (!this._drag) return
    const MIN_VISIBLE = 64
    const { dx, dy, w, h } = this._drag
    const x = Math.min(Math.max(e.clientX - dx, -(w - MIN_VISIBLE)), window.innerWidth - MIN_VISIBLE)
    const y = Math.min(Math.max(e.clientY - dy, -(h - MIN_VISIBLE)), window.innerHeight - MIN_VISIBLE)
    this.style.left = `${x}px`
    this.style.top = `${y}px`
    this.style.right = 'auto'
    this.style.bottom = 'auto'
    this._drag.moved = true
  }

  _onDragEnd = () => {
    window.removeEventListener('pointermove', this._onDragMove)
    window.removeEventListener('pointerup', this._onDragEnd)
    this.classList.remove('dragging')
    if (this._drag && this._drag.moved) {
      try {
        this._pos = { left: parseFloat(this.style.left), top: parseFloat(this.style.top) }
        localStorage.setItem(POS_KEY, JSON.stringify(this._pos))
      } catch {}
    }
    this._drag = null
  }

  // ── events ───────────────────────────────────────────────────────────────
  _bind() {
    // No implicit click toggles: the panel only changes mode via its explicit
    // buttons (expand / collapse). Clicking anywhere never re-flaps it.
    const hdr = this._q('#hdr')
    hdr.addEventListener('pointerdown', (e) => this._beginDrag(e))
    this._q('#b-reload').addEventListener('click', () => {
      if (this._shown) this._navigate(this._shown)
    })
    this._q('#b-open').addEventListener('click', () => this._openBrowser())
    this._q('#b-expand').addEventListener('click', () => {
      this._setMode(this._mode === 'fullscreen' ? 'docked' : 'fullscreen')
    })
    this._q('#b-collapse').addEventListener('click', () => {
      this._setMode(this._mode === 'collapsed' ? 'docked' : 'collapsed')
    })
    this._q('#srv').addEventListener('change', (e) => {
      const dir = e.target.value
      const s = this._servers.find((x) => x.dir === dir)
      if (s && (!this._server || s.dir !== this._server.dir)) {
        this._server = s
        this._shown = null
        this._mtimes = new Map()
        this._poll()
      }
    })
  }

  _openBrowser() {
    if (!this._server) return
    const enc = this._shown ? '/' + this._shown.split('/').map(encodeURIComponent).join('/') : ''
    const url = `http://127.0.0.1:${this._server.port}${enc}`
    const win = /Win/i.test(navigator.userAgent)
    const mac = /Mac/i.test(navigator.userAgent)
    const program = win ? 'cmd' : mac ? 'open' : 'xdg-open'
    const args = win ? ['/c', 'start', '', url] : [url]
    this.invoke('spawn_plugin_process', { pluginId: PLUGIN, program, args, cwd: this._server.dir || null }).catch(() => {
      try { window.open(url, '_blank') } catch {}
    })
  }
}
