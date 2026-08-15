# Pragma Plugins

The plugin registry for [Pragma](https://github.com/Sylviromi/pragma) — and it
doubles as the **source repo for the npm packages**. Every plugin is one npm
package (one plugin = one package, each handling its own resources), so
publishing and installing both go through npm:

```
pragma-plugins/
  pragma-plugin-convo/         ← an npm package (and a Pragma plugin)
    package.json                 name, keywords: ["pragma-plugin"]
    manifest.json                the Pragma plugin manifest
    component.js / skills/ ...   the plugin's own resources
  pragma-plugin-frontend-dev/
  scripts/publish.mjs           syncs versions + runs npm publish
```

## Installing

In the app: **Settings → Marketplace** searches npm for packages tagged
`pragma-plugin` (registry search API) — install with one click. Or by hand:

```
npm:pragma-plugin-convo
```

The app runs a real `npm install`, so plugin sidecars can `require`
dependencies from the package's `node_modules`.

## Publishing a release

1. Bump `version` in the plugin's `manifest.json`.
2. Publish (syncs `package.json` version from the manifest and runs
   `npm publish`):
   ```bash
   node scripts/publish.mjs            # all plugins
   node scripts/publish.mjs convo      # one plugin
   node scripts/publish.mjs --dry-run  # sync versions only
   ```

## Requirements

- Package name starts with `pragma-plugin-` (so it's findable in the
  marketplace) and carries `keywords: ["pragma-plugin"]`.
- `manifest.json` at the package root declares the plugin's `id` (matching
  the folder name), `name` and `version`.
- The manifest version and `package.json` version stay in sync — `publish.mjs`
  does this for you.

## License

MIT — see the pragma repo's [LICENSE](../pragma/LICENSE) (© Pragma contributors).
