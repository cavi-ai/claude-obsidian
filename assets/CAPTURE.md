# Screenshots to capture

Drop PNGs into this folder (`assets/`) with the exact filenames below and the
README's "See it in action" section lights up. Until then GitHub shows
broken-image placeholders, so add these before committing the README's
screenshot section (or comment that section out).

> Note: the repo's `docs/` folder is gitignored (local scratch for plans/specs),
> so README images must live here in `assets/`, which **is** tracked.

Capture on a retina display, crop tight, light theme reads best in the store.
Use a demo/sample vault — avoid showing private notes.

| Filename | What to shoot |
|---|---|
| `chat-panel.png` | The Companion side-panel chat in Obsidian: a message with **Context** chips attached (active note / linked notes), mid-stream or with a completed reply. Shows "chat with your vault." |
| `artifact-inline.png` | A `claude-html` artifact rendered **inline** in a note (the sandboxed iframe) — a dashboard or report with the clay/olive palette. The signature feature. |
| `manifest-roadmap.png` | A `manifest-pm` (or `manifest-vault`) roadmap/health artifact — the prioritized, ranked output. Run `/claude-obsidian:manifest-pm` against a sample project vault. |
| `session-to-note.png` | The note produced by `/claude-obsidian:session-to-note` open in Obsidian — frontmatter (date, `type: session`, tags) + distilled body + wikilinks. Shows "session memory → knowledge graph." |

## Optional extras (nice-to-have)

| Filename | What to shoot |
|---|---|
| `mcp-bridge-settings.png` | Companion settings → MCP bridge: port + bearer token + "allow writes" toggle. Good for the setup docs. |
| `chat-controls.png` | The in-chat model switcher + extended-thinking effort dial + reasoning panel. |
| `slash-palette.png` | The `/` slash-command fuzzy palette open in the composer. |

## Tips

- Keep each image under ~1 MB; PNG is fine for UI. Resize to ~1600px wide max.
- A short screen-recording → GIF of `session-to-note` running would be a strong
  hero asset if you want one later (`session-to-note.gif`).
