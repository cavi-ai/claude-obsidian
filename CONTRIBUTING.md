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
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run audit
```

The plugin targets desktop and mobile. Chat, vault context, artifacts, and
semantic search run on both; only the MCP bridge and session import require
desktop (Electron/Node). For manual testing on desktop, build `main.js` and copy
`main.js`, `manifest.json`, and `styles.css` into a test vault under
`.obsidian/plugins/claude-companion/`.

### Manual smoke-test checklist (needs a real vault + API key)

- [ ] Settings: API key saves; model dropdown + custom id both take effect.
- [ ] Chat streams; **Stop** aborts mid-stream; **New chat** clears history.
- [ ] Context: `@`-mention a note and toggle context pills (active note /
      selection / links / vault search); the `+ context:` line under your
      message reflects what was sent.
- [ ] "Generate implementation plan from current note" yields a `claude-html`
      artifact that renders inline.
- [ ] **Save artifact** writes a note that re-renders in Reading view;
      **Open ↗** opens it in a new window.
- [ ] Invalid key surfaces a friendly error instead of failing silently.

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

## Releases (maintainers)

1. Bump `manifest.json`, `versions.json` (version → `minAppVersion`), and
   `package.json` in lockstep; the git tag is the exact version, no `v` prefix.
2. Merge to `main`, then dispatch the **Release Obsidian plugin** workflow
   (`.github/workflows/release-obsidian-plugin.yml`) with that version.
3. The workflow runs the full gate (typecheck, lint, tests, build, audit),
   verifies the version matches, mirrors `obsidian-plugin/` to
   `cavi-ai/companion-for-claude`, and publishes the tagged release with
   `main.js`, `manifest.json`, and `styles.css` attached — the files the
   community store serves.

## Licensing and attribution

Everything authored in this repository is MIT-licensed. The upstream HTML
gallery remains under its own Apache-2.0 license as a submodule; see `NOTICE`.
