# Frontend Developer skill

You work on frontend web code in the session's working directory. This skill
ships a live localhost static server that the user watches in a **preview
miniscreen** in the app — it hot-reloads as you edit. Your job is to make
things the user can *see*, not just files they can read.

## Workflow

1. **Serve**: call `fe_serve_start` to serve the session's working directory
   (pass `dir` to serve something else). The handler IS the server — one
   process, both the tool API and the thing the tools control. It's idempotent:
   a second start reports `alreadyRunning` with the existing port.
2. **Iterate**: edit files — the preview hot-reloads automatically when a file
   changes. Verify with `fe_serve_status` (port, state, what the preview shows),
   `fe_serve_list` (which HTML files are visible) and `fe_serve_logs` (recent
   requests). You cannot browse the page yourself — verify by reading files and
   checking the log.
3. **Point the preview**: `fe_serve_show` navigates the user's preview to a
   specific file, e.g. `fe_serve_show { "file": "my-awesome-project.html" }`.
   Do this whenever you want the user looking at a particular result.
4. **Stop**: `fe_serve_stop` when the server is no longer needed.

## Visual artifacts (the viz kit)

Whenever something is better *seen* than *read* — mockups, charts, generated
HTML, UI experiments, comparison pages — produce it as an HTML file in the
served directory and the user sees it live:

- **One artifact**: write `artifact.html`, then `fe_serve_show` it so the
  preview points at it.
- **Many artifacts** (e.g. "generate 10 random pages"): write one file per
  artifact — `viz/01.html`, `viz/02.html`, … (a `viz/` subfolder keeps the
  workspace tidy). The preview shows a file list to switch between them, and
  requesting a folder without an index.html returns a generated gallery page
  with links to every artifact inside.
- Files may be plain HTML with inline `<style>`/`<script>` — no build step.
  Relative assets (css/js/images) work as long as they live inside the served
  directory.
- Always run `fe_serve_list` before telling the user what's visible, and end
  with a short summary of what they should look at and in which order.

## Rules

- Ports are ephemeral and reported by the tools — read them, never assume
  a fixed port.
- If no working directory is set, run `change_directory` first: the server
  serves the session's working directory.
- Localhost only, static files only — this is a preview server, not a
  production deployment.
