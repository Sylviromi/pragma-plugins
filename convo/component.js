// Convo — turns the chat into a one-to-one conversation with your developer.
//
// The agent loop runs in the background with auto-approve ALWAYS on. This
// component replaces the whole chat panel (`chat-view` slot): it renders the
// conversation + composer in Pragma's own design language, shows everything the
// agent writes as real chat messages, and offers a toggleable side window with
// the raw agent loop (reasoning + tool calls).
//
// Plain ES module — no build step. `data-slot` picks the surface, `data-context`
// carries the session id (chat-view) / plugin id (settings-page).

const PLUGIN_ID = 'convo'

const DEFAULTS = {
  thinking: 'auto',       // off | auto | low | medium | high
  sideWindowOpen: false,  // raw-loop side window default
  showReasoning: true,    // include reasoning lines in the side window
}

const THINK_LEVELS = ['off', 'auto', 'low', 'medium', 'high']
const THINK_LABELS = { off: 'Off', auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' }

const SIDE_LABELS = {
  reasoning: 'thought',
  tool_call: 'tool',
  tool_result: 'result',
  question: 'question',
  done: 'done',
  error: 'error',
  interrupted: 'stop',
  verification: 'verify',
  info: '—',
  working_dir: 'dir',
  narrate: 'note',
}

const STYLES = `
  :host { box-sizing: border-box; color-scheme: dark; }
  *, *::before, *::after { box-sizing: inherit; }

  select, input, textarea, button { font-family: inherit; -webkit-appearance: none; appearance: none; }
  input[type='checkbox'] { -webkit-appearance: auto; appearance: auto; accent-color: var(--accent, #1f6feb); }
  option { background: var(--bg-elevated, #161b22); color: var(--text-primary, #e6edf3); }
  textarea, input { caret-color: var(--accent, #58a6ff); }

  /* Material Symbols Rounded (document font, same as the app's .msr). */
  .msr {
    font-family: 'Material Symbols Rounded'; font-weight: normal; font-style: normal;
    line-height: 1; letter-spacing: normal; text-transform: none; display: inline-block;
    white-space: nowrap; word-wrap: normal; direction: ltr; font-feature-settings: 'liga';
    font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
    -webkit-font-smoothing: antialiased; user-select: none;
  }

  .wrap {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column;
    background: var(--bg-base, #0d1117);
    color: var(--text-primary, #e6edf3);
    font-family: var(--font-body, system-ui, sans-serif);
    min-width: 0;
  }

  /* Slim dark scrollbars inside the shadow DOM. */
  .msgs::-webkit-scrollbar, .side::-webkit-scrollbar, .list::-webkit-scrollbar, .search input::-webkit-scrollbar { width: 8px; height: 8px; }
  .msgs::-webkit-scrollbar-thumb, .side::-webkit-scrollbar-thumb, .list::-webkit-scrollbar-thumb { background: var(--border-default, #30363d); border-radius: 4px; }
  .msgs::-webkit-scrollbar-thumb:hover, .side::-webkit-scrollbar-thumb:hover, .list::-webkit-scrollbar-thumb:hover { background: var(--text-muted, #8b949e); }
  .msgs::-webkit-scrollbar-track, .side::-webkit-scrollbar-track, .list::-webkit-scrollbar-track { background: transparent; }

  /* ── Chat area: messages + sliding side overlay ───────── */
  .chat-area {
    position: relative;
    flex: 1; min-height: 0;
    overflow: hidden;
  }
  .msgs {
    height: 100%; min-width: 0;
    overflow-y: auto;
    padding: 18px 24px 10px;
    display: flex; flex-direction: column; gap: 12px;
  }

  /* Raw agent loop — slides in from the right OVER the messages, never
     touching the composer, so the composer's controls never move. */
  .side {
    position: absolute; top: 0; right: 0; bottom: 0;
    width: 360px; max-width: 60%;
    z-index: 20;
    border-left: 1px solid var(--border-default, #30363d);
    background: var(--bg-overlay, #010409);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.45));
    transform: translateX(102%);
    transition: transform 0.36s cubic-bezier(0.22, 0.8, 0.3, 1);
    display: flex; flex-direction: column;
    /* Header + dedicated scroll body (sticky inside a flex-column scroller is
       buggy in WebKitGTK — it breaks scrolling, so the body scrolls instead). */
    overflow: hidden;
    font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px;
  }
  .side.open { transform: translateX(0); }
  .side-body { flex: 1; min-height: 0; overflow-y: auto; }
  .side-hd {
    flex: none;
    display: flex; align-items: center; gap: 8px;
    padding: 10px 8px 10px 14px;
    border-bottom: 1px solid var(--border-default, #30363d);
    background: var(--bg-overlay, #010409);
  }
  .side-live { width: 7px; height: 7px; border-radius: 50%; background: #2a3441; flex: none; transition: background 0.3s ease; }
  .side-hd.live .side-live { background: var(--accent, #58a6ff); box-shadow: 0 0 6px var(--accent, #58a6ff); animation: dotPulse 1.4s ease-in-out infinite; }
  .side-title { flex: 1; color: var(--text-muted, #8b949e); letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px; }
  .side-close {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: var(--text-muted, #8b949e);
    cursor: pointer; padding: 4px; border-radius: 4px; flex: none;
    transition: color 0.18s ease, background 0.18s ease;
  }
  .side-close:hover { color: var(--text-primary, #e6edf3); background: var(--surface-hover, #21262d); }
  .side-close .msr { font-size: 16px; }
  .side-empty { padding: 12px 10px; color: var(--text-muted, #8b949e); }
  .side-line {
    padding: 5px 10px; border-bottom: 1px solid var(--border-subtle, #21262d);
    display: flex; gap: 9px; align-items: baseline;
  }
  .sl-label {
    flex: none; color: var(--text-muted, #8b949e);
    text-transform: uppercase; font-size: 9.5px; letter-spacing: .05em; min-width: 44px;
  }
  .sl-body { white-space: pre-wrap; word-break: break-word; color: var(--text-secondary, #9aa7b2); }
  .side-line.reasoning .sl-body { color: var(--text-muted, #8b949e); font-style: italic; }
  .side-line.tool_call .sl-body { color: var(--accent, #58a6ff); }
  .side-line.tool_result .sl-body { color: var(--text-secondary, #9aa7b2); }
  .side-line.question .sl-body { color: var(--warning, #d29922); }
  .side-line.error .sl-body { color: var(--danger, #f85149); }
  .side-line.done .sl-body { color: var(--success, #3fb950); }
  .side-line.verification .sl-body { color: #7c9cff; }
  .side-line.interrupted .sl-body { color: var(--warning, #d29922); }
  .side-line.info .sl-body { color: var(--text-muted, #8b949e); }
  .side-line.working_dir .sl-body { color: var(--text-secondary, #9aa7b2); }

  /* ── Typing indicator (in-flow agent row, dots bubble) ── */
  .typing-row { align-items: flex-start; }
  .t-bubble {
    display: flex; align-items: center; gap: 4px;
    padding: 11px 12px;
  }
  .t-bubble i { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted, #8b949e); animation: bounce 1.2s infinite; }
  .t-bubble i:nth-child(2) { animation-delay: .15s; }
  .t-bubble i:nth-child(3) { animation-delay: .3s; }
  @keyframes bounce { 0%,60%,100% { transform: none; opacity: .4; } 30% { transform: translateY(-4px); opacity: 1; } }

  /* ── Composer (matches the app's InputArea) ────────────── */
  .composer {
    flex: none;
    border-top: 1px solid var(--border-default, #30363d);
    background: var(--bg-elevated, #161b22);
    padding: 14px 20px 16px;
    display: flex; flex-direction: column; gap: 10px;
    min-width: 0;
  }
  .composer textarea {
    width: 100%; resize: none; overflow-y: auto; max-height: 144px;
    background: var(--bg-base, #0d1117); color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-default, #30363d); border-radius: var(--radius-md, 6px);
    padding: 10px 12px; font-size: 14px; line-height: 1.5; outline: none; min-height: 40px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .composer textarea:hover { border-color: var(--text-muted, #8b949e); }
  .composer textarea:focus {
    border-color: var(--border-focus, #1f6feb);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #1f6feb) 16%, transparent);
  }
  .composer textarea::placeholder { color: var(--text-muted, #8b949e); }
  .cf { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
  .cf-spacer { flex: 1; }
  .auto-tag {
    font-family: var(--font-mono, monospace); font-size: 10px; color: var(--success, #3fb950);
    border: 1px solid color-mix(in srgb, var(--success, #3fb950) 40%, transparent);
    background: color-mix(in srgb, var(--success, #3fb950) 10%, transparent);
    border-radius: 999px; padding: 2px 8px; white-space: nowrap;
  }
  .icon-btn {
    display: inline-flex; align-items: center; gap: 5px;
    background: transparent; color: var(--text-secondary, #9aa7b2);
    border: 1px solid var(--border-default, #30363d); border-radius: var(--radius-sm, 4px);
    font-size: 12px; padding: 6px 9px; cursor: pointer; white-space: nowrap; flex: none;
  }
  .icon-btn:hover { color: var(--text-primary, #e6edf3); border-color: var(--text-muted, #8b949e); }
  .icon-btn.on { color: var(--accent, #58a6ff); border-color: var(--accent, #1f6feb); background: var(--accent-soft, rgba(31,111,235,.12)); }
  .icon-btn.stop { color: var(--danger, #f85149); border-color: color-mix(in srgb, var(--danger, #f85149) 45%, transparent); }
  .icon-btn .msr { font-size: 15px; line-height: 1; }
  .send-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--accent, #1f6feb); color: var(--accent-on, #fff);
    border: none; border-radius: var(--radius-md, 6px); padding: 7px 14px;
    font-family: var(--font-heading, inherit); font-weight: 600; font-size: 13px;
    cursor: pointer; white-space: nowrap; flex: none;
    transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
  }
  .send-btn:hover { background: var(--accent-hover, #388bfd); box-shadow: 0 1px 6px color-mix(in srgb, var(--accent, #1f6feb) 40%, transparent); }
  .send-btn:active { transform: scale(0.97); }
  .send-btn .msr { font-size: 15px; }
  .icon-btn { transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease; }
  .picker .chip { transition: border-color 0.18s ease; }

  /* ── Messages (Pragma design: user accent-soft right, agent elevated left) ── */
  .msg { display: flex; }
  /* Entrance: only live-appended messages animate (history re-renders don't). */
  .msg.animate { animation: bubbleIn 0.34s cubic-bezier(0.22, 0.8, 0.3, 1) both; }
  @keyframes bubbleIn { from { opacity: 0; transform: translateY(8px) scale(0.985); } to { opacity: 1; transform: none; } }
  @keyframes dotPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.82); } }
  .msg.out { flex-direction: column; align-items: flex-end; }
  .msg.in { justify-content: flex-start; align-items: flex-start; gap: 10px; }
  .msg.sys { justify-content: center; }
  .avatar {
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--accent, #1f6feb); color: var(--accent-on, #fff);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-mono, monospace); font-size: 10px; font-weight: 600;
    margin-top: 2px; flex: none;
  }
  .bubble { max-width: 78%; min-width: 0; overflow-wrap: anywhere; }
  .bt { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; }
  .bubble.out {
    max-width: 64%;
    background: var(--accent-soft, rgba(31,111,235,.12));
    border: 1px solid var(--border-subtle, #21262d);
    border-radius: 18px 18px 5px 18px;
    padding: 10px 16px; font-size: 14px; color: var(--text-primary, #e6edf3);
  }
  .bubble.in {
    background: var(--bg-elevated, #161b22);
    border: 1px solid var(--border-subtle, #21262d);
    border-radius: 5px 18px 18px 18px;
    padding: 11px 16px; font-size: 14px; color: var(--text-primary, #e6edf3);
  }
  .bubble.in.streaming .bt::after { content: '▍'; color: var(--accent, #58a6ff); animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .bubble.sys {
    background: var(--bg-overlay, #010409); color: var(--text-muted, #8b949e);
    border: 1px solid var(--border-subtle, #21262d); border-radius: 999px;
    font-size: 11px; padding: 4px 12px; max-width: 82%; text-align: center;
  }
  .bubble.sys.success { color: var(--success, #3fb950); }
  .bubble.sys.warn { color: var(--warning, #d29922); }
  .bubble.sys.error { color: var(--danger, #f85149); }

  /* Markdown inside agent bubbles (rendered by the app's own renderer).
     Tight rhythm — model messages are chat-sized, not documents — and
     overflow-safe (images/tables/code must never push the bubble wider or
     break its rounded corners). */
  .md-prose { white-space: normal; overflow-wrap: anywhere; }
  .md-prose p { margin: 0 0 0.35em; }
  .md-prose p:last-child { margin-bottom: 0; }
  .md-prose strong { font-weight: 650; }
  .md-prose em { font-style: italic; }
  .md-prose code {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.88em;
    background: var(--bg-overlay, #010409);
    border: 1px solid var(--border-subtle, #21262d);
    border-radius: 3px;
    padding: 0.15em 0.4em;
  }
  .md-prose a { color: var(--accent, #58a6ff); text-decoration: none; }
  .md-prose a:hover { text-decoration: underline; }
  .md-prose ul, .md-prose ol { margin: 0.2em 0 0.4em; padding-left: 1.4em; }
  .md-prose li { margin: 0.15em 0; }
  .md-prose li > ul, .md-prose li > ol { margin: 0.1em 0; }
  .md-prose h3, .md-prose h4, .md-prose h5, .md-prose h6 {
    margin: 0.5em 0 0.25em;
    font-size: 1.05em; font-weight: 650; line-height: 1.3;
    color: var(--text-primary, #e6edf3);
  }
  .md-prose blockquote { margin: 0.3em 0; padding: 2px 12px; border-left: 3px solid var(--border-default, #30363d); color: var(--text-secondary, #9aa7b2); }
  .md-prose blockquote p { margin: 0.2em 0; }
  .md-prose hr { border: none; border-top: 1px solid var(--border-default, #30363d); margin: 0.6em 0; }
  .md-prose img { max-width: 100%; height: auto; border-radius: 6px; }
  .md-prose table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
  .md-prose th, .md-prose td { border: 1px solid var(--border-default, #30363d); padding: 3px 10px; font-size: 0.92em; }
  .md-prose th { background: var(--bg-overlay, #010409); font-weight: 600; }
  /* Indented (4-space) code blocks that marked renders inside prose. */
  .md-prose pre { margin: 0.5em 0; }
  .md-prose pre code {
    display: block;
    padding: 10px 12px;
    overflow-x: auto;
    background: var(--bg-base, #0d1117);
    border: 1px solid var(--border-default, #30363d);
    border-radius: var(--radius-sm, 4px);
    font-size: 0.85em;
    color: var(--text-secondary, #9aa7b2);
    line-height: 1.5;
  }
  /* Fenced code blocks — the block clips so the scrolling pre keeps the
     bubble's rounded corners; min-width:0 (on .bubble) lets the max-width
     actually constrain instead of the pre stretching the bubble. */
  .code-block {
    position: relative;
    margin: 0.35em 0 0.1em;
    background: var(--bg-base, #0d1117);
    border: 1px solid var(--border-default, #30363d);
    border-radius: var(--radius-sm, 4px);
    overflow: hidden;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12.5px;
    color: var(--text-secondary, #9aa7b2);
  }
  .code-block pre { margin: 0; padding: 12px 14px; white-space: pre; overflow-x: auto; }
  .code-block .copy {
    position: absolute; top: 6px; right: 6px;
    background: var(--bg-overlay, #010409);
    border: 1px solid var(--border-default, #30363d);
    border-radius: 2px; color: var(--text-muted, #8b949e);
    cursor: pointer; padding: 3px; display: flex;
  }
  .code-block .copy:hover { color: var(--text-primary, #e6edf3); }
  .code-block .copy .msr { font-size: 14px; }
  .meta { margin-top: 3px; font-size: 10px; text-align: right; opacity: .6; color: var(--text-muted, #8b949e); }
  .o-badge { font-size: 10px; color: var(--text-muted, #8b949e); text-align: right; margin-top: 3px; padding-right: 4px; }

  /* ── Question block (design 'Needs your answer') ───────── */
  .question {
    background: var(--bg-elevated, #161b22);
    border: 1px solid var(--warning, #d29922);
    border-radius: 5px 18px 18px 18px;
    padding: 13px 16px 14px;
    display: flex; flex-direction: column; gap: 11px;
    max-width: 78%;
  }
  .q-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .q-ico { display: flex; color: var(--warning, #d29922); font-size: 16px; }
  .q-label { flex: none; font-family: var(--font-mono, monospace); font-size: 10px; letter-spacing: .09em; text-transform: uppercase; color: var(--warning, #d29922); }
  .q-pill { margin-left: auto; font-family: var(--font-mono, monospace); font-size: 10px; color: var(--text-muted, #8b949e); background: var(--bg-overlay, #010409); border-radius: 9px; padding: 2px 9px; white-space: nowrap; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
  .q-text { font-size: 14px; color: var(--text-primary, #e6edf3); line-height: 1.55; white-space: pre-wrap; }
  .q-options { display: flex; flex-wrap: wrap; gap: 8px; }
  .q-chip {
    display: flex; align-items: center; gap: 7px; padding: 7px 13px 7px 8px;
    border-radius: 16px; cursor: pointer; font-size: 12.5px;
    border: 1px solid var(--border-default, #30363d); background: transparent;
    color: var(--text-primary, #e6edf3); font-family: inherit;
  }
  .q-chip:hover:not(:disabled) { border-color: var(--warning, #d29922); }
  .q-chip.picked { border-color: var(--success, #3fb950); background: color-mix(in oklch, var(--success, #3fb950) 16%, transparent); }
  .q-chip:disabled { cursor: default; color: var(--text-muted, #8b949e); border-color: var(--border-subtle, #21262d); }
  .q-badge { width: 17px; height: 17px; display: flex; align-items: center; justify-content: center; border-radius: 3px; font-family: var(--font-mono, monospace); font-size: 9.5px; color: var(--text-muted, #8b949e); background: var(--bg-overlay, #010409); }
  .q-hint { font-size: 11.5px; color: var(--text-muted, #8b949e); }
  .q-input { display: flex; gap: 8px; align-items: center; }
  .q-input input { flex: 1; min-width: 0; background: var(--bg-base, #0d1117); border: 1px solid var(--border-default, #30363d); border-radius: 5px; padding: 7px 11px; color: var(--text-primary, #e6edf3); font-family: var(--font-mono, monospace); font-size: 12.5px; }
  .q-input input:focus { outline: none; border-color: var(--accent, #1f6feb); }
  .q-send { background: var(--accent, #1f6feb); color: var(--accent-on, #fff); border: none; border-radius: var(--radius-sm, 4px); padding: 7px 12px; font-size: 12px; cursor: pointer; font-weight: 600; }
  .q-answer { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono, monospace); font-size: 12.5px; color: var(--text-primary, #e6edf3); background: var(--bg-base, #0d1117); border: 1px solid var(--border-subtle, #21262d); border-radius: 5px; padding: 8px 12px; }

  /* ── Model picker (clone of the app's ModelPicker) ─────── */
  .picker { position: relative; }
  .picker .chip {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg-base, #0d1117); color: var(--text-primary, #e6edf3);
    border: 1px solid var(--border-default, #30363d); border-radius: var(--radius-md, 6px);
    padding: 6px 10px; font-size: 12.5px; cursor: pointer; white-space: nowrap;
    flex: none; min-width: 0; max-width: 100%;
  }
  .picker .chip:hover { border-color: var(--text-muted, #8b949e); }
  .picker .chip .dot, .row .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent, #1f6feb); flex-shrink: 0; }
  .picker .chip .mname { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .picker .chip .pname { color: var(--text-muted, #8b949e); overflow: hidden; text-overflow: ellipsis; }
  .picker .chip .msr { font-size: 14px; color: var(--text-muted, #8b949e); flex: none; }
  .dropdown {
    position: fixed; transform: translateY(-100%);
    width: 280px; max-width: min(280px, calc(100vw - 24px));
    max-height: min(400px, calc(100vh - 76px));
    background: var(--bg-elevated, #161b22);
    border: 1px solid var(--border-default, #30363d); border-radius: var(--radius-md, 6px);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,.5));
    overflow: hidden; z-index: 100;
    display: none; flex-direction: column;
  }
  .dropdown.open { display: flex; }
  .search { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border-default, #30363d); margin: 6px 6px 0; }
  .search .msr { font-size: 15px; color: var(--text-muted, #8b949e); flex: none; }
  .search input { flex: 1; background: none; border: none; outline: none; color: var(--text-primary, #e6edf3); font-size: 12.5px; }
  .list { max-height: min(300px, 45vh); overflow-y: auto; padding: 2px 6px 6px; flex: 1; min-height: 0; }
  .group-label { padding: 4px 8px; font-family: var(--font-mono, monospace); font-size: 10px; letter-spacing: .08em; color: var(--text-muted, #8b949e); }
  .row {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px;
    background: transparent; border: none; border-radius: 2px;
    color: var(--text-secondary, #9aa7b2); font-size: 12.5px; text-align: left;
    cursor: pointer; font-family: inherit;
  }
  .row:hover { background: var(--surface-hover, #21262d); color: var(--text-primary, #e6edf3); }
  .row.sel { background: var(--accent-soft, rgba(31,111,235,.12)); }
  .row .rname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .rmeta { color: var(--text-muted, #8b949e); font-size: 11px; }
  .rmeta.free { color: var(--success, #3fb950); }
  .rmeta.think { color: var(--accent, #58a6ff); text-transform: uppercase; font-size: 10px; font-weight: 600; letter-spacing: .06em; }
  .check { color: var(--success, #3fb950); margin-left: auto; display: flex; font-size: 15px; }
  .think-row { display: flex; align-items: center; gap: 10px; justify-content: space-between; padding: 8px 12px; border-top: 1px solid var(--border-subtle, #21262d); margin: 4px 6px 0; }
  .think-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .think-label { font-size: 12.5px; color: var(--text-primary, #e6edf3); }
  .think-hint { font-size: 11px; color: var(--text-muted, #8b949e); }
  .think-value { display: flex; align-items: center; gap: 2px; padding: 3px 8px; background: var(--bg-base, #0d1117); border: 1px solid var(--border-default, #30363d); border-radius: var(--radius-sm, 4px); color: var(--text-primary, #e6edf3); font-size: 12px; cursor: pointer; flex: none; font-family: inherit; }
  .think-value .msr { font-size: 13px; color: var(--text-muted, #8b949e); }
  .think-menu { margin: 1px 6px 4px; border: 1px solid var(--border-default, #30363d); border-radius: var(--radius-sm, 4px); max-height: 152px; overflow-y: auto; background: var(--bg-overlay, #010409); }
  .tm-opt { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; background: transparent; border: none; color: var(--text-secondary, #9aa7b2); font-size: 12.5px; text-align: left; cursor: pointer; font-family: inherit; }
  .tm-opt:hover { background: var(--surface-hover, #21262d); color: var(--text-primary, #e6edf3); }
  .tm-opt.sel { background: var(--accent-soft, rgba(31,111,235,.12)); color: var(--text-primary, #e6edf3); }
  .tm-name { flex: 1; }
  .tm-sub { color: var(--text-muted, #8b949e); font-size: 10.5px; }

  /* ── Settings page ─────────────────────────────────────── */
  .cfg { max-width: 560px; display: flex; flex-direction: column; gap: 12px; }
  .cfg-title { font-size: 14px; font-weight: 600; color: var(--text-primary, #e6edf3); }
  .cfg-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    background: var(--bg-elevated, #161b22); border: 1px solid var(--border-default, #30363d);
    border-radius: var(--radius-md, 6px); padding: 11px 14px; font-size: 12.5px;
    color: var(--text-primary, #e6edf3); cursor: pointer;
  }
  .cfg-hint { font-size: 11px; color: var(--text-muted, #8b949e); }

  @media (max-width: 640px) {
    .msgs { padding: 12px 14px 8px; }
    .composer { padding: 12px 14px 14px; }
  }
`

export default class Convo extends HTMLElement {
  connectedCallback() {
    const slot = this.getAttribute('data-slot') || ''
    this.attachShadow({ mode: 'open' })
    if (slot === 'chat-view') {
      this.style.display = 'flex'
      this.style.flexDirection = 'column'
      this.style.flex = '1'
      this.style.minHeight = '0'
      this._mountChatView()
    } else if (slot === 'settings-page') {
      this.style.display = 'block'
      this._mountSettings()
    } else {
      this.shadowRoot.innerHTML = `<style>${STYLES}</style><div class="cfg-hint" style="padding:8px">convo · ${slot}</div>`
    }
  }

  disconnectedCallback() {
    this._disposed = true
    if (this._onDocClick) window.removeEventListener('click', this._onDocClick)
    if (this._unlisten) { try { this._unlisten() } catch {} ; this._unlisten = null }
  }

  // ── Tauri helpers ──────────────────────────────────────────
  hasTauri() {
    return typeof window !== 'undefined' && !!window.__TAURI__?.core?.invoke
  }
  invoke(cmd, args) {
    if (!this.hasTauri()) return Promise.reject(new Error('Tauri bridge unavailable'))
    return window.__TAURI__.core.invoke(cmd, args || {})
  }
  listen(event, cb) {
    if (typeof window !== 'undefined' && window.__TAURI__?.event?.listen) {
      return window.__TAURI__.event.listen(event, cb)
    }
    return Promise.resolve(() => {})
  }

  // ── Settings page ──────────────────────────────────────────
  async _mountSettings() {
    this.shadowRoot.innerHTML = `<style>${STYLES}</style>
      <div class="cfg">
        <div class="cfg-title">Convo settings</div>
        <div class="cfg-hint">Model and thinking level live in the composer, below the chat. Everything here saves automatically.</div>
        <label class="cfg-row"><span>Side window open by default</span><input type="checkbox" data-el="side" /></label>
        <label class="cfg-row"><span>Show reasoning in side window</span><input type="checkbox" data-el="reasoning" /></label>
      </div>`

    this.config = { ...DEFAULTS }
    try { this.config = { ...DEFAULTS, ...(await this.invoke('get_plugin_config', { pluginId: PLUGIN_ID })) } } catch {}

    const side = this.shadowRoot.querySelector('[data-el="side"]')
    const reasoning = this.shadowRoot.querySelector('[data-el="reasoning"]')
    side.checked = !!this.config.sideWindowOpen
    reasoning.checked = this.config.showReasoning !== false

    const save = async () => {
      this.config.sideWindowOpen = side.checked
      this.config.showReasoning = reasoning.checked
      try { await this.invoke('set_plugin_config', { pluginId: PLUGIN_ID, config: this.config }) } catch {}
    }
    side.addEventListener('change', save)
    reasoning.addEventListener('change', save)
  }

  // ── Chat view ──────────────────────────────────────────────
  async _mountChatView() {
    this.sessionId = this.getAttribute('data-context') || ''
    this.messages = []
    this._queue = []
    this._running = false
    this._errorShown = false
    this._segText = ''
    this._streamingBubble = null
    this._liveQuestion = null
    this._openReasoning = null
    this._turnHadTools = false
    this._turnHadMarked = false

    this.shadowRoot.innerHTML = `<style>${STYLES}</style>
      <div class="wrap">
        <div class="chat-area" data-el="chat-area">
          <div class="msgs" data-el="msgs"></div>
          <aside class="side" data-el="side">
            <div class="side-hd" data-el="side-hd">
              <span class="side-live"></span>
              <span class="side-title">Raw agent loop</span>
              <button class="side-close" data-act="close-side" title="Collapse the raw agent loop"><span class="msr">chevron_right</span></button>
            </div>
            <div class="side-body" data-el="side-body">
              <div class="side-empty">Thoughts and tool calls will stream here. Send a message to start.</div>
            </div>
          </aside>
        </div>
        <footer class="composer">
          <textarea data-el="input" rows="1" placeholder="Message the developer…" aria-label="Message the developer"></textarea>
          <div class="cf" data-el="cf">
            <span class="cf-spacer"></span>
            <span class="auto-tag" title="Auto-approve is always on">auto ✓</span>
            <button class="icon-btn" data-act="toggle-side" title="Raw agent loop"><span class="msr">right_panel_open</span></button>
            <button class="icon-btn stop" data-act="stop" title="Stop the current turn" style="display:none"><span class="msr">stop</span></button>
            <button class="icon-btn" data-act="settings" title="Settings"><span class="msr">settings</span></button>
            <button class="send-btn" data-el="send">Send <span class="msr">arrow_upward</span></button>
          </div>
        </footer>
      </div>`

    this._msgs = this.shadowRoot.querySelector('[data-el="msgs"]')
    this._sideEl = this.shadowRoot.querySelector('[data-el="side"]')
    this._sideBody = this.shadowRoot.querySelector('[data-el="side-body"]')
    this._sideHd = this.shadowRoot.querySelector('[data-el="side-hd"]')
    this._input = this.shadowRoot.querySelector('[data-el="input"]')
    this._composerFooter = this.shadowRoot.querySelector('[data-el="cf"]')
    this._sendBtn = this.shadowRoot.querySelector('[data-el="send"]')
    this._stopBtn = this.shadowRoot.querySelector('[data-act="stop"]')
    this._sideToggleBtn = this.shadowRoot.querySelector('[data-act="toggle-side"]')

    // Typing indicator lives INSIDE the message flow (right under the user's
    // message) — built as an agent row and kept as the last child of .msgs.
    this._typingRow = document.createElement('div')
    this._typingRow.className = 'msg in typing-row'
    const tAv = document.createElement('span')
    tAv.className = 'avatar'
    tAv.textContent = 'P'
    const tBubble = document.createElement('div')
    tBubble.className = 'bubble in t-bubble'
    tBubble.innerHTML = '<i></i><i></i><i></i>'
    this._typingRow.append(tAv, tBubble)
    this._typingRow.style.display = 'none'
    this._msgs.append(this._typingRow)

    this.config = { ...DEFAULTS }
    try { this.config = { ...DEFAULTS, ...(await this.invoke('get_plugin_config', { pluginId: PLUGIN_ID })) } } catch {}
    this.sideOpen = !!this.config.sideWindowOpen
    this._applySide()

    this._renderPicker()
    await this._initPickerState()

    // Wire controls
    this._sideToggleBtn.addEventListener('click', () => this._toggleSide())
    this.shadowRoot.querySelector('[data-act="close-side"]').addEventListener('click', () => {
      if (this.sideOpen) this._toggleSide()
    })
    this.shadowRoot.querySelector('[data-act="settings"]').addEventListener('click', () => {
      window.location.assign('/settings/plugin/' + PLUGIN_ID)
    })
    this._stopBtn.addEventListener('click', async () => {
      try { await this.invoke('interrupt_session', { sessionId: this.sessionId }) } catch {}
    })
    this._sendBtn.addEventListener('click', () => this._submitComposer())
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._submitComposer() }
    })
    this._input.addEventListener('input', () => this._autosize())

    // Subscribe BEFORE loading/checking so a running loop's events aren't missed.
    this._unlisten = await this.listen('agent:' + this.sessionId, (e) => this._handleEvent(e.payload))
    if (this._disposed) return

    await this._reloadMessages()
    await this._reconnect()

    if (!this.messages.length) {
      this._sysRow('Describe your idea — the developer will ask what it needs to know, then get to work. Auto-approve is ON.')
    }
  }

  // ── Model picker (matches the app's ModelPicker) ───────────
  _renderPicker() {
    const wrap = document.createElement('div')
    wrap.className = 'picker'
    wrap.innerHTML = `
      <button class="chip" data-el="pick-chip" title="Model">
        <span class="dot"></span>
        <span class="mname">Choose model</span>
        <span class="pname"></span>
        <span class="msr">expand_more</span>
      </button>
      <div class="dropdown" data-el="pick-drop">
        <div class="search"><span class="msr">search</span><input type="text" data-el="pick-search" placeholder="Search models…" aria-label="Search models" /></div>
        <div class="list" data-el="pick-list"></div>
        <div class="think-row" data-el="pick-think">
          <div class="think-copy"><span class="think-label">Thinking</span><span class="think-hint">level for this model</span></div>
          <button class="think-value" data-el="pick-thinkval"><span data-el="pick-thinklabel">Auto</span><span class="msr">expand_more</span></button>
        </div>
        <div class="think-menu" data-el="pick-thinkmenu" style="display:none"></div>
      </div>`
    this._composerFooter.prepend(wrap)

    this._pickerEl = wrap
    this._chipEl = wrap.querySelector('[data-el="pick-chip"]')
    this._dropdownEl = wrap.querySelector('[data-el="pick-drop"]')
    this._searchEl = wrap.querySelector('[data-el="pick-search"]')
    this._listEl = wrap.querySelector('[data-el="pick-list"]')
    this._thinkValueBtn = wrap.querySelector('[data-el="pick-thinkval"]')
    this._thinkLabelSpan = wrap.querySelector('[data-el="pick-thinklabel"]')
    this._thinkMenuEl = wrap.querySelector('[data-el="pick-thinkmenu"]')

    this._chipEl.addEventListener('click', (e) => { e.stopPropagation(); this._togglePicker() })
    this._searchEl.addEventListener('input', () => this._renderPickerList(this._searchEl.value))
    this._thinkValueBtn.addEventListener('click', (e) => { e.stopPropagation(); this._toggleThinkMenu() })
    this._onDocClick = (e) => {
      if (this._pickerEl && !e.composedPath().includes(this._pickerEl)) this._closePicker()
    }
  }

  _defaultModel(provs) {
    const prov = provs.find((p) => (p.models || []).some((m) => m.isFree)) || provs[0]
    return { provider: prov?.id || '', model: prov?.models?.[0]?.id || '' }
  }

  async _initPickerState() {
    try {
      this._providers = (await this.invoke('list_providers')) || []
      const s = await this.invoke('get_session', { id: this.sessionId })
      let cur = { provider: s.provider, model: s.model }
      if (!cur.model || !cur.provider) {
        cur = this._defaultModel(this._providers)
        if (cur.provider && cur.model) {
          await this.invoke('update_session', { id: this.sessionId, model: cur.model, provider: cur.provider, workingDir: s.workingDir || '' }).catch(() => {})
        }
      }
      this._current = cur
      this._updateChip()
      this._updateThinkUi()
    } catch (e) {
      this._sideLine('error', 'models: ' + String(e))
    }
  }

  async _openPicker() {
    try {
      this._providers = (await this.invoke('list_providers')) || []
      const s = await this.invoke('get_session', { id: this.sessionId })
      let cur = { provider: s.provider, model: s.model }
      if (!cur.model || !cur.provider) {
        cur = this._defaultModel(this._providers)
        if (cur.provider && cur.model) {
          await this.invoke('update_session', { id: this.sessionId, model: cur.model, provider: cur.provider, workingDir: s.workingDir || '' }).catch(() => {})
        }
      }
      this._current = cur
      this._updateChip()
      this._updateThinkUi()
    } catch { /* keep previous state */ }

    this._searchEl.value = ''
    this._renderPickerList('')
    const r = this._chipEl.getBoundingClientRect()
    this._dropdownEl.style.left = r.left + 'px'
    this._dropdownEl.style.top = r.top - 6 + 'px'
    this._dropdownEl.classList.add('open')
    this._searchEl.focus()
    window.addEventListener('click', this._onDocClick)
  }

  _closePicker() {
    this._dropdownEl.classList.remove('open')
    this._thinkMenuEl.style.display = 'none'
    window.removeEventListener('click', this._onDocClick)
  }

  _togglePicker() {
    if (this._dropdownEl.classList.contains('open')) this._closePicker()
    else this._openPicker()
  }

  _renderPickerList(q) {
    this._listEl.replaceChildren()
    const query = (q || '').toLowerCase()
    for (const p of this._providers || []) {
      const models = (p.models || []).filter((m) => !query || (m.name || '').toLowerCase().includes(query) || (m.id || '').toLowerCase().includes(query))
      if (!models.length) continue
      const gl = document.createElement('div')
      gl.className = 'group-label'
      gl.textContent = (p.name || p.id).toUpperCase() + (p.source !== 'builtin' ? ' · plugin' : '')
      this._listEl.append(gl)
      for (const m of models) {
        const sel = m.id === this._current?.model && p.id === this._current?.provider
        const row = document.createElement('button')
        row.className = 'row' + (sel ? ' sel' : '')
        const dot = document.createElement('span'); dot.className = 'dot'
        const rn = document.createElement('span'); rn.className = 'rname'; rn.textContent = m.name || m.id
        row.append(dot, rn)
        if (m.contextWindow) {
          const meta = document.createElement('span'); meta.className = 'rmeta'
          meta.textContent = m.contextWindow >= 1e6
            ? (m.contextWindow % 1e6 === 0 ? (m.contextWindow / 1e6).toFixed(0) : (m.contextWindow / 1e6).toFixed(2)) + 'M'
            : (m.contextWindow / 1000).toFixed(0) + 'k'
          row.append(meta)
        }
        if (m.isFree) { const f = document.createElement('span'); f.className = 'rmeta free'; f.textContent = 'free'; row.append(f) }
        if (m.supportsThinking) { const t = document.createElement('span'); t.className = 'rmeta think'; t.textContent = 'think'; row.append(t) }
        if (sel) { const c = document.createElement('span'); c.className = 'check'; c.innerHTML = '<span class="msr">check</span>'; row.append(c) }
        row.addEventListener('click', () => this._selectModel(p.id, m.id))
        this._listEl.append(row)
      }
    }
  }

  async _selectModel(pid, mid) {
    this._current = { provider: pid, model: mid }
    this._updateChip()
    this._closePicker()
    try {
      const s = await this.invoke('get_session', { id: this.sessionId })
      await this.invoke('update_session', { id: this.sessionId, model: mid, provider: pid, workingDir: s.workingDir || '' })
    } catch {}
  }

  _updateChip() {
    const p = (this._providers || []).find((x) => x.id === this._current?.provider)
    const m = p?.models?.find((x) => x.id === this._current?.model)
    this._chipEl.querySelector('.mname').textContent = m?.name || 'Choose model'
    this._chipEl.querySelector('.pname').textContent = m && p ? '· ' + (p.name || p.id) : ''
  }

  _toggleThinkMenu() {
    const show = this._thinkMenuEl.style.display === 'none'
    this._thinkMenuEl.style.display = show ? 'block' : 'none'
  }

  _renderThinkMenu() {
    this._thinkMenuEl.replaceChildren()
    for (const l of THINK_LEVELS) {
      const b = document.createElement('button')
      b.className = 'tm-opt' + (l === this.config.thinking ? ' sel' : '')
      const name = document.createElement('span'); name.className = 'tm-name'; name.textContent = THINK_LABELS[l]
      b.append(name)
      if (l === 'auto') { const sub = document.createElement('span'); sub.className = 'tm-sub'; sub.textContent = 'model default'; b.append(sub) }
      if (l === this.config.thinking) { const c = document.createElement('span'); c.className = 'check'; c.innerHTML = '<span class="msr">check</span>'; b.append(c) }
      b.addEventListener('click', (e) => { e.stopPropagation(); this._selectThinking(l) })
      this._thinkMenuEl.append(b)
    }
  }

  _updateThinkUi() {
    this._thinkLabelSpan.textContent = THINK_LABELS[this.config.thinking] || 'Auto'
    this._renderThinkMenu()
  }

  _selectThinking(level) {
    this.config.thinking = level
    this._thinkLabelSpan.textContent = THINK_LABELS[level] || 'Auto'
    this._thinkMenuEl.style.display = 'none'
    this.invoke('set_plugin_config', { pluginId: PLUGIN_ID, config: this.config }).catch(() => {})
    this._renderThinkMenu()
  }

  // ── DOM helpers ────────────────────────────────────────────
  _scrollBottom() {
    if (!this._msgs) return
    requestAnimationFrame(() => { this._msgs.scrollTop = this._msgs.scrollHeight })
  }
  // Insert a message node before the typing row so the typing indicator always
  // stays as the last element of .msgs, right under the newest message.
  _appendMsg(node) {
    if (this._typingRow && this._typingRow.parentNode === this._msgs) {
      this._msgs.insertBefore(node, this._typingRow)
    } else {
      this._msgs.append(node)
    }
  }
  _timeLabel() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  _autosize() {
    if (!this._input) return
    this._input.style.height = 'auto'
    this._input.style.height = Math.min(this._input.scrollHeight, 144) + 'px'
  }

  _textBubble(side, text) {
    const row = document.createElement('div')
    row.className = 'msg ' + side
    if (!this._noAnim) row.classList.add('animate')
    if (side === 'in') {
      const av = document.createElement('span')
      av.className = 'avatar'
      av.textContent = 'P'
      row.append(av)
    }
    const bubble = document.createElement('div')
    bubble.className = 'bubble ' + side
    const t = document.createElement('div')
    t.className = 'bt'
    if (side === 'in') {
      // Use the app's own markdown renderer (window.__pragmaMarkdown bridge),
      // falling back to plain text if the host hasn't installed it.
      const html = renderMdHtml(text)
      if (html !== null) {
        t.innerHTML = html
        bindCodeCopy(t)
      } else {
        t.textContent = text
      }
    } else {
      t.textContent = text
    }
    bubble.append(t)
    if (side === 'out') {
      const m = document.createElement('div')
      m.className = 'meta'
      m.textContent = this._timeLabel()
      bubble.append(m)
    }
    row.append(bubble)
    this._appendMsg(row)
    this._scrollBottom()
    return { row, bubble, textEl: t }
  }

  _outgoingRow(text) {
    const { row } = this._textBubble('out', text)
    const badge = document.createElement('div')
    badge.className = 'o-badge'
    row.append(badge)
    return { row, badge }
  }

  _sysRow(text, kind = 'info') {
    const row = document.createElement('div')
    row.className = 'msg sys'
    if (!this._noAnim) row.classList.add('animate')
    const bubble = document.createElement('div')
    bubble.className = 'bubble sys ' + kind
    bubble.textContent = text
    row.append(bubble)
    this._appendMsg(row)
    this._scrollBottom()
    return row
  }

  _questionRow(text, options, isStatic = false) {
    const row = document.createElement('div')
    row.className = 'msg in'
    if (!this._noAnim) row.classList.add('animate')
    const av = document.createElement('span')
    av.className = 'avatar'
    av.textContent = 'P'
    const q = document.createElement('div')
    q.className = 'question'
    const head = document.createElement('div')
    head.className = 'q-head'
    head.innerHTML = '<span class="q-ico msr">help</span><span class="q-label">Needs your answer</span><span class="q-pill">run paused</span>'
    q.append(head)
    const qt = document.createElement('div')
    qt.className = 'q-text'
    qt.textContent = text
    q.append(qt)
    const opts = document.createElement('div')
    opts.className = 'q-options'
    if (options && options.length) {
      options.forEach((o, i) => {
        const b = document.createElement('button')
        b.className = 'q-chip'
        b.disabled = isStatic
        const badge = document.createElement('span')
        badge.className = 'q-badge'
        badge.textContent = String(i + 1)
        const label = document.createElement('span')
        label.className = 'q-chip-label'
        label.textContent = o
        b.append(badge, label)
        opts.append(b)
      })
    } else if (!isStatic) {
      const qin = document.createElement('div')
      qin.className = 'q-input'
      const inp = document.createElement('input')
      inp.className = 'q-input-free'
      inp.placeholder = 'Type your answer…'
      const send = document.createElement('button')
      send.className = 'q-send'
      send.textContent = 'Send'
      qin.append(inp, send)
      opts.append(qin)
    }
    q.append(opts)
    row.append(av, q)
    this._appendMsg(row)
    this._scrollBottom()
    return { row, bubble: q, opts }
  }

  _sideLine(kind, text) {
    if (!this._sideBody) return
    if (kind === 'reasoning' && this.config.showReasoning === false) return
    const empty = this._sideBody.querySelector('.side-empty')
    if (empty) empty.remove()
    const line = document.createElement('div')
    line.className = 'side-line ' + kind
    const label = document.createElement('span')
    label.className = 'sl-label'
    label.textContent = SIDE_LABELS[kind] || kind
    const body = document.createElement('span')
    body.className = 'sl-body'
    body.textContent = text
    line.append(label, body)
    this._sideBody.append(line)
    this._sideBody.scrollTop = this._sideBody.scrollHeight
  }

  _clearSide() {
    this._openReasoning = null
    if (!this._sideBody) return
    this._sideBody.querySelectorAll('.side-line').forEach((n) => n.remove())
  }

  _refreshTyping() {
    if (!this._typingRow) return
    const show = this._running && !this._liveQuestion && !this._streamingBubble
    this._typingRow.style.display = show ? 'flex' : 'none'
  }
  _refreshStop() {
    if (!this._stopBtn) return
    this._stopBtn.style.display = this._running ? '' : 'none'
    // Pulsing live dot in the raw-loop header while the agent is active.
    if (this._sideHd) this._sideHd.classList.toggle('live', this._running)
  }

  // ── Rendering ──────────────────────────────────────────────
  _renderMessages() {
    if (!this._msgs || !this.isConnected) return
    // History re-renders stay quiet — live appends animate (bubbleIn).
    this._noAnim = true
    this._msgs.replaceChildren()
    for (const m of this.messages) this._renderMessage(m)
    // Re-attach the typing indicator as the last child so new messages insert
    // before it (see _appendMsg).
    if (this._typingRow) this._msgs.append(this._typingRow)
    this._refreshTyping()
    this._noAnim = false
    this._scrollBottom()
  }

  _renderMessage(m) {
    if (m.role === 'verification') { this._renderVerification(m); return }
    if (m.role === 'assistant') { this._renderAssistant(m); return }
    if (m.role === 'user') {
      const c = parseContent(m.content)
      if (typeof c === 'string' && c.trim()) this._outgoingRow(c)
      return // arrays are tool results — internal, hidden in chat mode
    }
  }

  _renderAssistant(m) {
    const c = parseContent(m.content)
    if (typeof c === 'string') { if (c.trim()) this._textBubble('in', stripMarkers(c)); return }
    if (!Array.isArray(c)) return
    let buf = ''
    const flush = () => { if (buf.trim()) { this._textBubble('in', stripMarkers(buf)); buf = '' } }
    for (const b of c) {
      if (!b || typeof b !== 'object') continue
      if (b.type === 'text') {
        buf += (buf ? '\n\n' : '') + (b.text || '')
      } else if (b.type === 'tool_use') {
        flush()
        if (b.name === 'ask_question') {
          this._questionRow(b.input?.text || '', b.input?.options || [], true)
        }
      } else if (b.type === 'tool_result') {
        flush()
      }
      // reasoning / thinking blocks are hidden from the chat
    }
    flush()
  }

  _renderVerification(m) {
    const v = parseContent(m.content)
    if (v && typeof v === 'object' && typeof v.passed === 'boolean') {
      const text = v.cancelled
        ? 'Verification cancelled'
        : v.passed
          ? '✓ Checks passed'
          : '⚠ Review found issues'
      this._sysRow(text, v.cancelled ? 'warn' : v.passed ? 'success' : 'warn')
    }
  }

  async _reloadMessages() {
    try { this.messages = await this.invoke('list_messages', { sessionId: this.sessionId }) } catch {}
    this._renderMessages()
  }

  // ── Sending ────────────────────────────────────────────────
  async _resolveSend() {
    const s = await this.invoke('get_session', { id: this.sessionId })
    let { model, provider } = s
    const workingDir = s.workingDir || ''
    if (!model || !provider) {
      let provs = this._providers || []
      if (!provs.length) { try { provs = await this.invoke('list_providers') } catch {} }
      const d = this._defaultModel(provs)
      provider = d.provider
      model = d.model
      if (provider && model) {
        await this.invoke('update_session', { id: this.sessionId, model, provider, workingDir }).catch(() => {})
      }
    }
    return { model, provider, workingDir, thinking: this.config.thinking || 'auto' }
  }

  async _isRunning() {
    try {
      const ids = await this.invoke('get_running_sessions')
      return ids.includes(this.sessionId)
    } catch { return this._running }
  }

  async _submitComposer() {
    const text = (this._input.value || '').trim()
    if (!text) return
    this._input.value = ''
    this._autosize()

    const { badge } = this._outgoingRow(text)
    let send
    try { send = await this._resolveSend() }
    catch (e) { this._sysRow('⚠ ' + String(e), 'error'); return }

    const item = { content: text, model: send.model, provider: send.provider, workingDir: send.workingDir, thinking: send.thinking, badge }

    const running = await this._isRunning()
    this._running = running
    if (running) {
      badge.textContent = 'queued — sends when the current task finishes'
      this._queue.push(item)
      this._refreshTyping()
      this._refreshStop()
      return
    }
    badge.textContent = 'sending…'
    await this._startLoop(item)
  }

  async _startLoop(item) {
    this._running = true
    this._errorShown = false
    this._segText = ''
    this._streamingBubble = null
    this._liveQuestion = null
    this._turnHadTools = false
    this._turnHadMarked = false
    this._clearSide()
    this._sideLine('info', 'turn start')
    this._refreshTyping()
    this._refreshStop()

    try {
      // Watchdog: if the backend crashes mid-loop (e.g. a panic unwinds the
      // loop task), the invoke never settles AND no terminal event arrives —
      // the session simply drops out of get_running_sessions. Poll for that
      // and recover the UI instead of hanging in "working" forever.
      const invokeP = this.invoke('run_agentic_loop', {
        sessionId: this.sessionId,
        userMessage: item.content,
        model: item.model,
        provider: item.provider,
        workingDir: item.workingDir,
        autoApprove: true,
        thinking: item.thinking,
      })
      let settled = false
      const watchdog = (async () => {
        while (!settled) {
          await new Promise((r) => setTimeout(r, this._watchdogMs || 5000))
          if (settled || this._disposed) return
          try {
            const ids = await this.invoke('get_running_sessions')
            if (!ids.includes(this.sessionId) && this._running) {
              settled = true
              this._sideLine('error', 'loop ended without a terminal event — backend likely crashed')
              if (!this._errorShown) {
                this._appendError('The agent loop stopped unexpectedly (backend crash). Check the app logs and try again.')
              }
              await this._onTurnEnd(false)
              return
            }
          } catch { /* transient — keep polling */ }
        }
      })()
      try {
        await invokeP
      } finally {
        settled = true
      }
    } catch (e) {
      const msg = String(e)
      if (msg.includes('already has an active agentic loop')) {
        // A loop is live (started elsewhere / race) — keep this message queued.
        this._running = true
        if (item.badge) item.badge.textContent = 'queued — sends when the current task finishes'
        this._queue.unshift(item)
        this._refreshTyping()
        this._refreshStop()
        await this._reconnect()
        return
      }
      if (!this._errorShown) {
        this._appendError(parseError(msg))
        await this._onTurnEnd(false)
      }
    }
  }

  async _flushQueue() {
    if (this._running) return
    if (!this._queue.length) return
    const item = this._queue.shift()
    // _onTurnEnd reloaded the message list, wiping the optimistic queued bubble
    // — re-add it before starting this queued turn.
    const { badge } = this._outgoingRow(item.content)
    item.badge = badge
    badge.textContent = 'sending…'
    await this._startLoop(item)
  }

  // ── Live event handling ────────────────────────────────────
  _handleEvent(ev) {
    switch (ev.event) {
      case 'reasoning':
        // Each event is one stream chunk — accumulate into the open thought
        // line instead of creating a new line per word.
        this._sideReasoning(ev.content)
        this._refreshTyping()
        break
      case 'thinking_end':
        this._sealSideReasoning()
        break
      case 'token':
        this._sealSideReasoning()
        this._liveText(ev.content)
        this._updateLiveText()
        break
      case 'tool_call':
        if (ev.name === 'ask_question') break // rendered via the `question` event
        this._sealSideReasoning()
        this._flushLiveSegment()
        this._turnHadTools = true
        this._sideLine('tool_call', ev.name + ' ' + shortJson(ev.input))
        this._refreshTyping()
        break
      case 'tool_result':
        this._sideLine('tool_result', truncate(ev.output, 600))
        this._refreshTyping()
        break
      case 'question':
        this._sealSideReasoning()
        this._flushLiveSegment()
        this._showQuestion(ev)
        this._refreshTyping()
        break
      case 'working_dir_changed':
        this._sealSideReasoning()
        this._flushLiveSegment()
        this._sysRow('📁 Working directory: ' + ev.newPath)
        this._sideLine('working_dir', ev.newPath)
        break
      case 'verification_started':
        this._sealSideReasoning()
        this._flushLiveSegment()
        this._sideLine('verification', 'phase: ' + ev.phase)
        break
      case 'verification_result':
        this._sealSideReasoning()
        this._flushLiveSegment()
        this._sideLine('verification', ev.cancelled ? 'cancelled' : ev.passed ? 'passed' : 'issues found')
        break
      case 'done':
        this._sealSideReasoning()
        this._sideLine('done', 'turn complete')
        this._onTurnEnd(true)
        break
      case 'error':
        this._sealSideReasoning()
        this._sideLine('error', ev.message || 'unknown error')
        if (!this._errorShown) this._appendError(ev.message || 'unknown error')
        this._onTurnEnd(false)
        break
      case 'interrupted':
        this._sealSideReasoning()
        this._sideLine('interrupted', 'turn interrupted')
        this._sysRow('Turn interrupted', 'warn')
        this._queue = []
        this._onTurnEnd(false)
        break
    }
  }

  // Accumulate reasoning chunks into one side-window thought line until the
  // thinking block ends (thinking_end) or a non-reasoning event seals it.
  _sideReasoning(content) {
    if (this.config.showReasoning === false) return
    if (!this._sideBody) return
    const empty = this._sideBody.querySelector('.side-empty')
    if (empty) empty.remove()
    if (!this._openReasoning) {
      const line = document.createElement('div')
      line.className = 'side-line reasoning'
      const label = document.createElement('span')
      label.className = 'sl-label'
      label.textContent = SIDE_LABELS.reasoning
      const body = document.createElement('span')
      body.className = 'sl-body'
      line.append(label, body)
      this._sideBody.append(line)
      this._openReasoning = body
    }
    this._openReasoning.textContent += content
    this._sideBody.scrollTop = this._sideBody.scrollHeight
  }
  _sealSideReasoning() {
    this._openReasoning = null
  }

  _liveText(content) {
    this._segText = (this._segText || '') + content
  }

  // Stream the agent's text live under the user's message. Every word the model
  // writes appears in the chat as a real message — like a person texting. Any
  // stray [to-user] markers from older instructions are stripped for display.
  _updateLiveText() {
    const seg = this._segText || ''
    const text = stripMarkers(seg).trimEnd()
    if (!text) { this._sealStreamingBubble(); return }
    if (!this._streamingBubble) {
      const { bubble, textEl } = this._textBubble('in', text)
      bubble.classList.add('streaming')
      this._streamingBubble = { bubble, textEl }
      this._turnHadMarked = true
    } else {
      const html = renderMdHtml(text)
      if (html !== null) this._streamingBubble.textEl.innerHTML = html
      else this._streamingBubble.textEl.textContent = text
    }
  }
  // Finalize the streaming message (keep it in the chat) — the next segment
  // starts a fresh message.
  _sealStreamingBubble() {
    if (this._streamingBubble) {
      this._streamingBubble.bubble.classList.remove('streaming')
      this._streamingBubble = null
    }
  }

  // A text segment ends at a tool call / question / turn boundary.
  _flushLiveSegment() {
    this._sealStreamingBubble()
    this._segText = ''
  }

  _showQuestion(ev) {
    const { opts } = this._questionRow(ev.text, ev.options)
    this._liveQuestion = { questionId: ev.questionId, answered: false }
    opts.querySelectorAll('.q-chip').forEach((btn) => {
      btn.addEventListener('click', () => this._answerQuestion(ev.questionId, btn.textContent.trim(), opts, btn))
    })
    const inp = opts.querySelector('.q-input-free')
    const send = opts.querySelector('.q-send')
    if (inp && send) {
      const submit = () => { const v = inp.value.trim(); if (v) this._answerQuestion(ev.questionId, v, opts) }
      send.addEventListener('click', submit)
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } })
      setTimeout(() => inp.focus(), 60)
    }
  }

  async _answerQuestion(questionId, answer, opts, chipEl) {
    if (this._liveQuestion?.answered) return
    if (this._liveQuestion) this._liveQuestion.answered = true
    if (chipEl) {
      opts.querySelectorAll('.q-chip').forEach((b) => { b.disabled = true })
      chipEl.classList.add('picked')
    } else {
      const inp = opts.querySelector('.q-input-free'); if (inp) inp.disabled = true
      const snd = opts.querySelector('.q-send'); if (snd) snd.disabled = true
    }
    try {
      await this.invoke('answer_question', { questionId, answer })
      this._sideLine('info', 'answered: ' + truncate(answer, 200))
    } catch (e) {
      this._sideLine('error', String(e))
    }
    this._liveQuestion = null // loop resumed — typing indicator should show again
    this._refreshTyping()
  }

  _appendError(msg) {
    this._sysRow('⚠ ' + truncate(msg, 400), 'error')
    this._errorShown = true
  }

  async _onTurnEnd(done = false) {
    if (!this._running) return // idempotent — done/error/interrupted + invoke rejection may both fire
    this._running = false
    this._flushLiveSegment()
    this._sealSideReasoning()
    this._liveQuestion = null
    this._refreshTyping()
    this._refreshStop()
    await this._reloadMessages()
    if (done && this._turnHadTools && !this._turnHadMarked) {
      this._sysRow('The developer worked in the background without sending a message — open the raw window to see what it did.')
    }
    await this._flushQueue()
  }

  // ── Side window / reconnect ────────────────────────────────
  async _toggleSide() {
    this.sideOpen = !this.sideOpen
    this._applySide()
    this.config.sideWindowOpen = this.sideOpen
    if (this._sideToggleBtn) this._sideToggleBtn.classList.toggle('on', this.sideOpen)
    try { await this.invoke('set_plugin_config', { pluginId: PLUGIN_ID, config: this.config }) } catch {}
  }
  _applySide() {
    if (this._sideEl) this._sideEl.classList.toggle('open', this.sideOpen)
  }

  async _reconnect() {
    try {
      const ids = await this.invoke('get_running_sessions')
      this._running = ids.includes(this.sessionId)
    } catch { this._running = false }
    this._refreshTyping()
    this._refreshStop()
  }
}

// ── Small utils ───────────────────────────────────────────────
function parseContent(raw) {
  try { return JSON.parse(raw) } catch { return raw }
}

function truncate(s, n) {
  const str = String(s ?? '')
  return str.length > n ? str.slice(0, n) + '…' : str
}

function shortJson(v) {
  try { return truncate(JSON.stringify(v ?? {}), 240) } catch { return '' }
}

function parseError(msg) {
  try {
    const parsed = JSON.parse(msg)
    if (parsed?.error?.message) return parsed.error.message
  } catch {}
  return msg || 'Model request failed.'
}

// All agent text appears as real chat messages; stray [to-user] markers (from
// older instructions) are stripped on display.
function stripMarkers(text) {
  return String(text || '').replace(/\[to-user\]/g, '').replace(/\[\/to-user\]/g, '')
}

// Render agent text with the app's OWN markdown renderer (exposed by the host
// as window.__pragmaMarkdown — renderMarkdown + segmentsOf + withCaret). Returns
// null when the bridge isn't installed yet, so callers fall back to plain text.
function renderMdHtml(text) {
  const md = (typeof window !== 'undefined' && window.__pragmaMarkdown) || null
  if (!md || typeof md.segmentsOf !== 'function' || typeof md.renderMarkdown !== 'function') return null
  const segs = md.segmentsOf(text)
  let html = ''
  for (const seg of segs) {
    if (seg.kind === 'code') {
      html += '<div class="code-block"><button class="copy" title="Copy code"><span class="msr">content_copy</span></button><pre>' + escapeHtml(seg.text.trimEnd()) + '</pre></div>'
    } else if (seg.text.trim()) {
      html += '<div class="md-prose">' + md.renderMarkdown(seg.text) + '</div>'
    }
  }
  return html
}

// Copy button on fenced code blocks (event delegation — survives re-renders).
function bindCodeCopy(bt) {
  bt.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy')
    if (!btn) return
    const pre = btn.parentElement && btn.parentElement.querySelector('pre')
    if (pre) navigator.clipboard?.writeText(pre.textContent || '').catch(() => {})
  })
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
