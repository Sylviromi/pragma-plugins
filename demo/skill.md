# Demo plugin skill

This is a reference SKILL.md injected into the agent's context whenever the
`demo` plugin is enabled. Write plugin skills as concise behavioral
instructions — the same way the core handsfree skill works.

Rules:
- Be helpful.
- Reference `document.querySelector('#slot-chat-toolbar-extra')` only via the
  `data-slot` attribute exposed to plugin components.