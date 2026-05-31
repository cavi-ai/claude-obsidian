# Contributing

Thanks for helping make `claude-obsidian` better.

## Repository layout

- `obsidian-plugin/` contains the Claude Companion Obsidian plugin.
- `claude-plugin/` contains the Claude Code plugin, commands, and skills.
- `upstream/html-effectiveness/` is a pinned, unmodified submodule used for
  attribution and inspiration. Do not edit it in place.

## Development

Run Obsidian plugin commands from `obsidian-plugin/`:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run audit
```

The plugin is desktop-only. For manual testing, build `main.js` and copy
`main.js`, `manifest.json`, and `styles.css` into a test vault under
`.obsidian/plugins/claude-companion/`.

## Pull requests

- Keep `manifest.json`, `versions.json`, `package.json`, and the git tag version
  in lockstep. Do not bump versions without maintainer direction.
- Keep security-sensitive MCP behavior loopback-only, token-gated, and
  read-only by default.
- Keep generated artifacts sandboxed. Do not add `allow-same-origin` or network
  permissions to artifact iframes.
- Add or update tests for behavior changes, especially MCP bridge, provider,
  parser, and vault-write behavior.
- Do not commit API keys, MCP tokens, vault exports, local Obsidian settings,
  `node_modules/`, or generated release bundles unless a maintainer explicitly
  asks for release artifacts.

## Licensing and attribution

Everything authored in this repository is MIT-licensed. The upstream HTML
gallery remains under its own Apache-2.0 license as a submodule; see `NOTICE`.
