# Screenshot & GIF shot list

The canonical list of visual assets for the README and `guides/`. Drop files into
this folder (`assets/`) with the **exact filenames** below, then uncomment the
matching slot in the consuming file.

Slots stay commented out until their file exists, so GitHub never renders a broken
image. Search for `<!-- screenshot:` or `<!-- hero:` to find them.

> The repo's `docs/` folder is gitignored (local scratch for plans/specs), so
> tracked images must live here in `assets/`, or in `obsidian-plugin/assets/`
> for the plugin README. Both are tracked.

## Capture settings

Apply to every asset — consistency across shots matters more than any single shot.

- **Display:** retina / 2× scale.
- **Theme:** light, default Obsidian appearance. Light reads best in the store listing.
- **Vault:** the demo vault only. Never a real vault, and no personal note titles anywhere in frame.
- **Same demo vault for every asset** so the product looks coherent across the README, the guides, and the store.
- **Crop tight** to the relevant UI. No desktop chrome, no unrelated panes.
- **PNG:** ~1600 px wide max, under 1 MB.
- **GIF:** ≤15 s, ≤8 MB, ends near its start state so the loop isn't jarring.

## The demo vault

`demo-vault/` at the repo root — **gitignored**, because it is a local capture
fixture and carries a copy of the built plugin.

Open it in Obsidian (*Open folder as vault*) and everything is preconfigured:
light theme, Companion enabled, daily notes pointed at `Daily/`, graph tuned for a
legible screenshot. **Add your own API key on first run** — plugin `data.json` is
gitignored, so the key never lands in the repo.

Contents: 45 notes across two believable clusters (a home-espresso hobby cluster
and a learning-Rust cluster with an active project), book notes, four daily notes,
a weekly review, two untriaged clippings in `Inbox/`, and a populated research
project.

`Research/Espresso Extraction/` is written in the plugin's canonical record format
— 3 sources with real SHA-256 content fingerprints, 7 evidence cards, 3 claims, 2
open questions, 1 outline. Two things are wrong **on purpose**, so the Audit and
Intelligence tabs have genuine findings to show:

- one evidence card left `proposed` and unlinked → `unreviewed-evidence` + `unused-evidence`
- one claim overstated with challenging evidence attached → a real contradiction

Regenerate it any time with `python3 demo-vault/_generate-demo-vault.py demo-vault`
(idempotent). After rebuilding the plugin, re-copy `main.js`, `manifest.json`, and
`styles.css` from `obsidian-plugin/` into
`demo-vault/.obsidian/plugins/claude-companion/`.

## Already captured

The first four live in `obsidian-plugin/assets/` and are already wired up;
`social-card.png` lives here.

| Filename | Scene | Consumed by |
|---|---|---|
| `chat-panel.png` | Companion side-panel chat with **Context** chips attached (active note + linked notes), showing a completed reply. | Root README hero table · `guides/getting-started.md` §3 |
| `artifact-inline.png` | A `claude-html` artifact rendered inline in the sandboxed iframe — a dashboard or report in the clay/olive palette. | Root README hero table + §Interactive artifacts · `guides/getting-started.md` §4 · `guides/artifacts.md` |
| `manifest-roadmap.png` | A `manifest-pm` (or `manifest-vault`) prioritized roadmap/health artifact. Run the matching Companion workflow against the demo vault. | `obsidian-plugin/README.md` |
| `working-map.png` | A generated working map of the vault. | `obsidian-plugin/README.md` |
| `social-card.png` | 1280×640 GitHub social preview: tagline, feature pills, MIT / bring-your-own-key / local-first badges, and the chat panel bleeding off the right edge. **Composed, not captured** — built from HTML at 2× and downsampled, so it needs no vault and can be regenerated whenever the pitch changes. | GitHub repo settings → Social preview (manual upload; no REST API exists for it) |

## To capture

Ordered by priority. If capture time is limited, the first five carry the most
weight — the Obsidian store listing renders the root README, so these *are* the
store visuals.

| Filename | Scene setup | Consumed by |
|---|---|---|
| `hero-daily-rollup.gif` | ≤15 s. Run `/obsidian-agent:daily-rollup` in Claude Code with the official Obsidian CLI, then cut to the grounded rollup note open in Obsidian. | Candidate root README hero slot |
| `agent-tool-chips.png` | Chat mid-answer with a chain of tool chips visible — `vault_search` → `note_read` → `get_backlinks` — at least one expanded to show its result preview. | Root README §Agent mode · `guides/getting-started.md` §5 · `guides/agent-mode.md` §Tool chips |
| `diff-review.png` | The per-hunk diff modal from `propose_note_edit`: red/green hunks with accept/reject controls visible, at least two hunks so "per-hunk" is legible. | Root README §Diff-reviewed edits · `guides/agent-mode.md` §Editing notes |
| `research-desk.png` | Research Desk (`/research`) with one active project: current stage, the deterministic next action **with its explanation**, document progress, attention queue. | Root README §Research Desk and Workbench · `guides/research-workbench.md` §Desk vs Workbench |
| `mcp-bridge-settings.png` | *Settings → Agent bridge — MCP server (desktop)*: **Enable MCP server** on, port `22360`, masked token, **Allow writes** toggle, and the green `✓ Running at …` status line. Leave *Show token in snippets* **off** so no secret is in frame. | Root README §Optional MCP bridge · `guides/claude-code-bridge.md` §1 |
| `local-fallback-indicator.png` | Chat with the backend set to **Auto** after a Claude failure — the live connectivity indicator showing the local model is active, plus the fallback reason line. | Root README §Local models · `guides/local-models.md` §Auto backend |
| `slash-palette.png` | The `/` fuzzy palette open in the composer, several commands visible (`/artifact`, `/summarize`, `/research`) plus at least one user template so custom commands are legible. | `guides/getting-started.md` §4 |
| `plan-mode.png` | Composer with the **Plan** toggle lit, and Claude's proposed plan in the transcript — ordered steps naming vault paths, nothing written. | Unassigned — candidate for `guides/agent-mode.md` §Plan Mode |
| `research-workbench-intelligence.png` | Workbench → **Intelligence** tab with findings across at least two of the four categories, cited paths visible. | `guides/research-workbench.md` §Intelligence tab |
| `chat-controls.png` | In-chat controls: per-message model switcher, extended-thinking toggle with the effort dial, and the reasoning panel expanded. | Unassigned — candidate for a future guide section |
| `canvas-output.png` | A `.canvas` mind map produced by `canvas_create`, open in Obsidian, with `file` nodes pointing at real notes and labeled edges. | Unassigned — candidate for `guides/agent-mode.md` |
| `session-to-note.png` | Still frame of the `hero-session-to-note.gif` end state: the produced note with frontmatter and wikilinks. | Fallback if the GIF isn't captured |

## Wiring a captured asset

1. Drop the file in `assets/` with the exact filename.
2. Find its slot: `grep -rn "screenshot: .*<filename>" README.md guides/`.
3. Replace the comment with an image tag and real alt text. Paths are relative to the consuming file — `assets/x.png` from the root README, `../assets/x.png` from a guide.
4. Re-run the link check over `README.md` and `guides/*.md`; expect zero missing paths.
