# claude-obsidian (Claude Code plugin)

Cowork with Claude **inside your Obsidian vault**. This Claude Code plugin pairs
with the **Claude Companion** Obsidian plugin: Companion runs a local MCP bridge
exposing your vault (search / read / create / append), and this plugin gives
Claude Code the commands and skills to use it well.

## What you get

- **`/claude-obsidian:note-to-artifact`** — turn a note (or topic) into a
  beautiful, self-contained HTML artifact saved back into the vault as a
  `claude-html` block.
- **`/claude-obsidian:build-from-spec`** — read an Obsidian "build spec" note,
  implement its task checklist, and report progress to a tracker note.
- **`note-to-artifact` skill** — the design system Claude uses for artifacts
  (model-invoked automatically when relevant).
- **`obsidian-vault` MCP server** — pre-wired HTTP connection to the Companion
  bridge.

## Setup

1. Install the **Claude Companion** Obsidian plugin and enable the MCP bridge in
   its settings. Note the **port** (default `22360`) and copy the **bearer
   token**.
2. Make them available to Claude Code (e.g. in your shell or project env):
   ```bash
   export OBSIDIAN_MCP_PORT=22360
   export OBSIDIAN_MCP_TOKEN=<token from Companion settings>
   ```
3. Add this marketplace and install the plugin:
   ```bash
   /plugin marketplace add cavi-ai/claude-obsidian
   /plugin install claude-obsidian@claude-obsidian
   ```
4. Open Obsidian (the bridge only runs while Obsidian is open), then try
   `/claude-obsidian:note-to-artifact "My Note.md"`.

The bridge binds to `127.0.0.1` only — your vault is never exposed to the
network.

## Credits

The artifact design system is inspired by **Thariq Shihipar's** "HTML is all you
need to make effective reports/dashboards." See the repository `NOTICE` for full
attribution. This plugin is an original work, not a copy of that repo.
