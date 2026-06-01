# Claude Companion for Obsidian

Bring Claude *into* your vault. Chat with your notes as context, generate
gallery-grade interactive artifacts, and sync everything Claude produces back
into Markdown — so your vault stays the single source of truth.

The artifact design system takes its aesthetic cues from Thariq Shihipar's
[“unreasonable effectiveness of HTML”](https://github.com/ThariqS/html-effectiveness)
gallery (vendored as a pinned submodule at the monorepo root) — an original
reformulation, not a copy — so the plans, reports, and dashboards Claude
generates look gallery-grade. See [`../NOTICE`](../NOTICE) for full attribution.

> **Bring your own credential.** Claude Companion talks to the Anthropic
> Messages API with *your* credential — nothing is sent anywhere else. Desktop
> only (it needs direct network access). Three auth modes:
>
> - **API key** (default, recommended) — a standard `sk-ant-api…` key from
>   console.anthropic.com. This is the mode used for community-store builds.
> - **Long-term OAuth token** (power users) — paste a token from
>   `claude setup-token` (`sk-ant-oat…`) to authenticate as your Claude
>   subscription; usage draws on your plan rather than pay-as-you-go API credit.
> - **Import from environment** — read `ANTHROPIC_API_KEY` /
>   `ANTHROPIC_AUTH_TOKEN` (+ `ANTHROPIC_BASE_URL`) from the environment, the way
>   the CLI does.
>
> An optional **base URL** override points any mode at a gateway/proxy. The key
> stays the default so the plugin remains community-store eligible; the token and
> environment modes are clearly marked as power-user options.

## Features

- **Chat in a side panel** — streaming responses, Markdown-rendered, with
  per-message **Copy / Insert / Save as note** actions.
- **Vault-aware context** — toggle chips to attach your **active note**, the
  **current selection**, **linked & backlinked notes**, or a keyword
  **vault search** (lightweight RAG, no embeddings) to any message.
- **Beautiful interactive artifacts** — Claude emits a `claude-html` block;
  Companion renders it inline in a sandboxed iframe and can **save it as a
  note** that stays interactive and portable.
- **Local models (Ollama)** — route cheap, bulk work (summaries, auto-tagging,
  ingestion) to a local model so Anthropic tokens are reserved for high-level
  reasoning. Chat and plans can run locally too if you prefer. Settings can
  **auto-detect** the models installed on your Ollama server.
- **Live usage display** — the chat shows a context-window gauge (how full the
  prompt is getting) plus running **session token totals and an estimated cost**
  when using an API key, so there are no billing surprises.
- **Spec → build handoff** — turn a plan note into a **build spec** + a live
  **tracker** (a `claude-html` progress board), and hand it to **Claude Code**:
  it reads the spec and updates the tracker through the **official Obsidian CLI**
  (`obsidian read` / `obsidian append`) as it builds.
- **Indexing & tags** — saved artifacts and chats get YAML frontmatter
  (`title`, `tags`, `summary`, `type`) so they show up correctly in the tag
  pane, search, and Dataview. Optional **auto-tagging** uses the local model to
  suggest topic tags, reusing your existing vault tags where they fit.
- **Save & test connection** — one click confirms settings are saved and the
  key actually works, with readable, actionable errors.
- **Commands**
  - *Open chat panel*
  - *Generate implementation plan from current note*
  - *Turn selection / note into a beautiful artifact*
  - *Ask Claude about my vault (search-augmented)*
  - *Hand off current note to Claude Code (build)*

## Install (manual / for now)

1. `cd obsidian-plugin && npm install && npm run build`
2. Copy `main.js`, `manifest.json`, and `styles.css` into
   `<your-vault>/.obsidian/plugins/claude-companion/`.
3. Enable **Claude Companion** in *Settings → Community plugins*.
4. Open *Settings → Claude Companion* and paste your Anthropic API key.

For active development use `npm run dev` (esbuild watch) and symlink the plugin
folder into a test vault.

## Development & testing

The Obsidian-free logic (SSE parsing, artifact extraction, search scoring) is
factored into pure modules so it can be unit-tested without a running app.

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest (unit tests in test/)
npm run build       # typecheck + production bundle
```

CI runs all four on every push/PR (Node 20 & 22) via
[`.github/workflows/obsidian-plugin-ci.yml`](../.github/workflows/obsidian-plugin-ci.yml).

### Manual test checklist (needs a real vault + API key)

- [ ] Settings: API key saves; model dropdown + custom id both take effect.
- [ ] Chat streams; **Stop** aborts mid-stream; **New chat** clears history.
- [ ] Context chips: active note / selection / links / vault-search each attach
      (the `+ context:` line under your message reflects what was sent).
- [ ] "Generate implementation plan from current note" yields a `claude-html`
      artifact that renders inline.
- [ ] **Save artifact** writes a note that re-renders in Reading view; **Open ↗**
      opens it in a new window.
- [ ] Invalid key surfaces a friendly error instead of failing silently.

## Unified bridge (MCP server)

Companion can expose your vault as a local **MCP server**, so **Claude Code** and
**Claude Desktop** work against the *same* knowledge base you chat with here —
the compliant way to unify all three without subscription OAuth.

Enable it in *Settings → Claude Companion → Unified bridge (MCP server)*. It:

- binds to **127.0.0.1 only** (never the network) and requires a **bearer token**;
- exposes read tools always (`vault_search`, `note_read`, `list_recent`,
  `vault_tags`) and, when *Allow writes* is on, `note_create` / `note_append`;
- shows ready-to-paste connection snippets for both clients.

**Claude Code:**

```bash
claude mcp add --transport http obsidian-vault \
  http://127.0.0.1:22360/mcp --header "Authorization: Bearer <token>"
```

**Claude Desktop** (`claude_desktop_config.json`, via `mcp-remote`):

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:22360/mcp",
               "--header", "Authorization: Bearer <token>"]
    }
  }
}
```

Now ask Claude Code "search my vault for X" or "create a note summarizing this"
and it operates directly on your Obsidian notes.

## How artifacts work

When Claude returns a fenced ```` ```claude-html ```` block, Companion renders
the document inside a **sandboxed** iframe (`allow-scripts` but **not**
`allow-same-origin`) — interactions and scripts run, but the artifact can't
touch your vault or cookies. A restrictive iframe CSP also blocks network calls
and form submissions. Set a height per-block with ` ```claude-html height=720 `.

Saving an artifact writes a Markdown note containing that same block, so the
artifact lives in your vault, renders in Reading view, and travels with your
notes.

## The `claude-html` block

You can author these by hand too:

````markdown
```claude-html height=600
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Hello</title></head>
<body style="font-family:ui-serif;background:#FAF9F5;padding:40px">
  <h1 style="color:#141413">It renders inline.</h1>
</body></html>
```
````

## Releasing to the community store

This plugin lives in the [`cavi-ai/claude-obsidian`](https://github.com/cavi-ai/claude-obsidian)
monorepo under `obsidian-plugin/`. Submitting to Obsidian's community catalog
means following the checklist below.

**Packaging**
- [ ] The plugin source is `obsidian-plugin/` within the monorepo; the store
      entry points at that path.
- [ ] `LICENSE` present (MIT).
- [ ] `.gitignore` excludes `node_modules/`; **for a release `main.js` is
      committed/attached** (the store serves the built file, not the source).

**Manifest & versioning** (keep these three in lockstep)
- [ ] `manifest.json` `version` (currently `0.4.0`) matches the git tag.
- [ ] `versions.json` maps that version → `minAppVersion` (`1.5.0`).
- [ ] `package.json` `version` matches.

**GitHub release**
- [ ] Tag the release with the **exact** version number, no `v` prefix
      (`0.4.0`, not `v0.4.0`).
- [ ] Attach `main.js`, `manifest.json`, and `styles.css` as individual binary
      assets (not just the source zip).

**Catalog PR** (to `obsidianmd/obsidian-releases`)
- [ ] Add an entry to `community-plugins.json` with `id`, `name`, `author`,
      `description`, and the new repo path.
- [ ] First-time submissions go through Obsidian's automated + manual review.

**Naming / trademark**
- [ ] Review the plugin **name**. Obsidian's policy asks you to avoid trademarks
      you don't own; "Claude" is Anthropic's. A store-safe name such as
      *"Companion for Claude"* keeps the `claude-companion` id while making the
      third-party relationship clear. (Not yet changed — decide before tagging.)

**Pre-submit sanity**
- [ ] `npm run build` produces a fresh `main.js`.
- [ ] `npm test` green; `npm run typecheck`, `npm run lint`, and
      `npm run audit` clean.
- [ ] Screenshots/GIF in the README (store listings render it).

## License

MIT — see [`LICENSE`](LICENSE).
