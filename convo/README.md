# Convo

A Pragma plugin that turns the chat screen into a one-to-one conversation with
your developer — built in Pragma's own design language (no messaging-app
clones).

- **The agent loop keeps running in the background** with auto-approve always ON
  (every tool call is approved automatically).
- The agent **texts you** — short updates, milestones, summaries — instead of
  showing the full thought/tool stream.
- Questions arrive as the design's "Needs your answer" cards with answer chips
  (or free text).
- You can **send steering messages at any time**; they queue while a turn is in
  progress and send as soon as it finishes.
- A **toggleable side window** shows the actual agent loop (reasoning, tool
  calls, tool results) so you can still watch it think and work.

## Install

Symlink the plugin into Pragma's plugin directory:

```bash
ln -sfn /mnt/Projects/pragma-plugins/convo \
  ~/.config/dev.pragma.app/plugins/convo
```

Then enable it from **Settings → Plugins**. It claims the `chat-view` slot, so
once enabled every session uses the Convo surface.

## How the conversation works

1. Write your idea / system prompt in the composer.
2. The agent loads the `convo/convo` skill and starts a dialog — it asks
   clarifying questions with `ask_question` until the requirements are clear.
3. It sends a message that it's starting work, then works in the background.
4. **Everything the agent writes appears in the chat as a real message** — like
   a person texting you. The skill tells it to talk when it starts, when
   something will take a while (long builds, big searches, reading many files),
   at milestones, and when it finishes. Questions, verification results and
   errors always show up too.
5. It asks only when a decision is genuinely blocking, and always ends with a
   summary of what changed and what to check.

## Controls

- **Model picker + thinking level** — in the composer, identical to the app's
  own model picker. Model persists per session; thinking persists in plugin
  config.
- **raw** — slides the raw agent loop panel in from the right **over** the chat
  (animated, with its own collapse button); it never resizes the composer, so
  the composer's controls stay put while toggling.
- **■** — stop the current turn (appears while running).
- **auto ✓** — indicator that auto-approve is forced on.

## Settings

**Settings → Plugins → Convo** (or the ⚙ button in the composer):

- **Side window open by default** — start with the raw agent loop visible.
- **Show reasoning in side window** — include the model's thoughts in the raw log.

## Files

```
manifest.json              declares the plugin + slots (chat-view, settings-page)
component.js               the whole UI (Web Component, no build step)
skills/convo/skill.md      behavior reference the agent loads
config.json                plugin-scoped defaults (managed via Settings)
```
