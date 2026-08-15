// Demo Pragma plugin — plain ES module, no build step.
// Pragma wraps the default export in a custom element and drops it into any
// slot the manifest contributes (data-slot attribute tells it where it lives).
const STYLES = `
  :host { display: inline-flex; align-items: center; gap: 6px; font: 11px monospace; color: #e6edf3; }
  .chip { padding: 1px 8px; border-radius: 8px; background: rgba(31,111,235,.22); border: 1px solid rgba(31,111,235,.5); color: #58a6ff; }
  .state { color: #3fb950; }
  .btn {
    background: #21262d; color: #e6edf3; border: 1px solid #30363d;
    border-radius: 4px; font: inherit; cursor: pointer; padding: 2px 8px;
  }
  .btn:hover { border-color: #1f6feb; }
  .ctx { color: #8b949e; margin-left: 4px; }
`;

export default class DemoPlugin extends HTMLElement {
  connectedCallback() {
    const slot = this.getAttribute('data-slot') || '';
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `<style>${STYLES}</style>`;
    }
    const root = this.shadowRoot;
    if (slot === 'chat-toolbar-extra') {
      root.innerHTML += `
        <span class="chip">demo</span>
        <span class="state">● ready</span>
        <button class="btn" id="tick">tick (${this.count()})</button>
      `;
      root.querySelector('#tick').addEventListener('click', () => {
        root.querySelector('.state').textContent = `● ticked ${this.tick()}×`;
      });
    } else if (slot === 'input-toolbar') {
      root.innerHTML += `
        <button class="btn" id="turbo">⏩ turbo</button>
        <span class="ctx"></span>
      `;
      const btn = root.querySelector('#turbo');
      const ctx = root.querySelector('.ctx');
      const flip = () => {
        btn.textContent = btn.textContent === '⏩ turbo' ? '⏸ pause' : '⏩ turbo';
        ctx.textContent = ctx.textContent ? '' : 'hacked it';
      };
      btn.addEventListener('click', flip);
    } else if (slot === 'model-picker-extra') {
      root.innerHTML += `<div style="padding:4px 16px;color:#8b949e" class="ctx">demo plugin — picker extension</div>`;
    }
  }
  count() { return this.#n; }
  tick() { this.#n += 1; return this.#n; }
  #n = 0;
}