# CLAUDE.md

## What this repo is

**`claude-obsidian`** — a Claude Code plugin (commands + skills) that lets you cowork
with Claude inside an Obsidian vault. Pure markdown/JSON: no build step, no bundler.

- `.claude-plugin/plugin.json` — the plugin manifest (name, version, metadata).
- `.claude-plugin/marketplace.json` — makes this repo installable as its own
  single-plugin marketplace (`source: "."`).
- `commands/` — slash commands (`/claude-obsidian:<name>`).
- `skills/` — the skills those commands and Claude draw on.
- `.mcp.json` — wires Claude Code to the Companion MCP bridge (loopback HTTP,
  bearer token via `${OBSIDIAN_MCP_TOKEN}`, port `${OBSIDIAN_MCP_PORT:-22360}`).

## The pairing

This plugin is one half of a paired system. The other half is **Companion for Claude**,
an Obsidian community plugin that runs a loopback MCP server exposing the vault. This
plugin gives Claude Code the commands/skills to drive that server well. The two meet
only at the **MCP protocol** — there is no code or filesystem coupling. Adding a command
or skill here never requires a Companion change unless it depends on a *new* MCP tool.

## Topology (this repo is the source of truth)

- **This repo** — source of truth for the plugin.
- **`cavi-ai/claude-obsidian`** (mono) — consumes this repo as a git **submodule** at
  `claude-plugin/` to co-develop the paired halves and test against the live MCP bridge.
- **`cavi-ai/claude-plugins`** (catalog) — references this repo via a `github` source so
  users discover/install it alongside other CAVI plugins from one marketplace.

## Install

```
/plugin marketplace add cavi-ai/claude-obsidian-plugin
/plugin install claude-obsidian@claude-obsidian
```

## Conventions

- **Versions:** `plugin.json` and `marketplace.json` versions move in lockstep. Do not
  bump versions without an explicit go — a move/refactor is not a release.
- **Git:** commit steps are gated on the maintainer. Don't push, tag, or open PRs
  without explicit approval.
