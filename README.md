# Pragma Plugins

The plugin registry for [Pragma](https://github.com/Sylviromi/pragma) — every
plugin lives in this one repo, and the app's **Settings → Marketplace** fetches
the generated `index.json` to browse and install them.

## Layout

Each plugin is a **folder at the repo root** containing a `manifest.json`:

```
pragma-plugins/
  <id>/
    manifest.json       REQUIRED — declares id, name, version, contributes
    component.js        optional — UI component
    provider.json       optional — OpenAI-compatible provider
    skills/<skill>/     optional — skills with tools/sidecars
    config.json         optional — plugin-scoped config
  index.json            GENERATED — the registry, do not edit by hand
  scripts/generate-plugin-index.js
```

The manifest must declare an `id` matching the folder name (lowercase, no
spaces/slashes). See the [plugin reference](../pragma/docs/PLUGINS.md) in the
pragma repo for the full manifest spec.

## Adding a plugin

1. Drop the plugin folder here (`plugins`-root layout — see the reference for
   the full structure).
2. Bump `version` in its `manifest.json` for every release, then tag it:
   ```bash
   git tag <id>-v<version>
   ```
   (Tags are repo-wide, so they're prefixed per plugin — this is how the app
   knows which tags belong to which plugin when checking for updates.)
3. Push. CI regenerates `index.json` automatically.

## How the app installs

Each `index.json` entry carries a self-contained source spec:

```
git:https://github.com/Sylviromi/pragma-plugins@<id>-v<version>#<id>
```

The app's installer sparse-checkouts just that plugin's folder from this repo
(`#<id>` subpath), validates the manifest, and swaps it in atomically. Update
checks filter tags by the plugin's own prefix, so updating one plugin never
crosses into another's versions.

## Regenerating index.json locally

```bash
node scripts/generate-plugin-index.js . Sylviromi/pragma-plugins index.json
```

## License

MIT — see the pragma repo's [LICENSE](../pragma/LICENSE) (© Pragma contributors).
