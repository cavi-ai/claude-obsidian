# claude-obsidian

**Cowork with Claude inside your [Obsidian](https://obsidian.md) vault.** Chat
with your notes as context, generate gallery-grade interactive HTML artifacts,
run extended-thinking sessions, and let Claude Code operate on the *same* vault —
all with your vault as the single source of truth.

[![CI](https://github.com/cavi-ai/claude-obsidian/actions/workflows/obsidian-plugin-ci.yml/badge.svg)](https://github.com/cavi-ai/claude-obsidian/actions/workflows/obsidian-plugin-ci.yml)
[![Obsidian downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22claude-companion%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://obsidian.md/plugins?id=claude-companion)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[**▶ Install the Obsidian plugin**](obsidian://show-plugin?id=claude-companion)
 · [**Add the Claude Code plugin**](#getting-it)
 · [Latest release](https://github.com/cavi-ai/companion-for-claude/releases/latest)

**Open source · MIT · bring your own Anthropic key · local-first**

Two paired, complementary deliverables that meet at a local MCP bridge:

| Path | What it is | Ships to |
|---|---|---|
| [`obsidian-plugin/`](obsidian-plugin/) | **Companion for Claude** — the Obsidian community plugin: side-panel chat, vault-aware context, inline `claude-html` artifacts, model/thinking controls, conversation history, slash commands, offline local-model fallback, and a loopback MCP bridge. → [README](obsidian-plugin/README.md) | Obsidian community store |
| [`claude-plugin/`](claude-plugin/) | **claude-obsidian** — the Claude Code plugin + marketplace: commands and skills that drive your vault over the Companion MCP bridge (synthesis, tagging, drafting, session capture, artifacts, spec builds, advisor roadmaps). → [README](claude-plugin/README.md) | Claude Code marketplace |
| [`upstream/html-effectiveness/`](upstream/) | Thariq Shihipar's ["unreasonable effectiveness of HTML"](https://github.com/ThariqS/html-effectiveness) gallery, vendored as a **pinned, unmodified submodule** (its own Apache-2.0 license). See [`NOTICE`](NOTICE). | — |

---

## See it in action

| Chat with your vault | Interactive artifacts |
|---|---|
| ![Companion chat panel with vault context](obsidian-plugin/assets/chat-panel.png) | ![A claude-html artifact rendered inline](obsidian-plugin/assets/artifact-inline.png) |

<!-- screenshots wanted: session-to-note.png, chat-controls.png — see assets/CAPTURE.md in the mirror repo -->

---

## Companion for Claude (the Obsidian plugin)

A full Claude chat experience that lives in your vault and speaks its language.

- **Chat with vault context** — `@`-mention notes, folders, or the whole vault;
  toggle context pills for your active note, selection, linked/backlinked notes,
  or vault search. Keyword search by default; optional local semantic search via
  Ollama embeddings.
- **Agent mode** — Claude searches, reads, and follows links in your vault on
  its own while answering (expandable tool chips); optional writes are confirmed
  per call, and note edits land as reviewable per-hunk diffs.
- **Link intelligence** — unlinked mentions and semantic neighbors surface in a
  Related panel, with one-click linking or a reviewed bulk-link diff.
- **PDFs, images & screenshots** — `@`-mention vault PDFs/images or paste a
  screenshot; Claude reads them natively.
- **Consolidated memory** — captured session digests merge into one evolving
  "What Claude Knows" note that agent mode reads back across chats.
- **Canvas & Bases** — Claude builds native Obsidian Canvas mind maps and
  `.base` database views from your real notes and frontmatter — write-gated and
  confirmed, in chat and over the bridge.
- **Three auth modes** — your Anthropic **API key** (default, community-store
  safe), a long-term **OAuth subscription token** (`claude setup-token`, usage
  bills to your plan), or **import from the environment**. Optional base-URL
  override for gateways.
- **In-chat controls** — switch model per message (Opus / Sonnet / Haiku),
  toggle **extended thinking** with an **effort** dial, stream the model's
  **reasoning** in a collapsible panel, and set per-message temperature / max
  tokens. Every control is model-aware: anything a model would reject is hidden,
  not broken.
- **Slash commands** — type `/` in the composer for a fuzzy palette:
  summarize, ask, improve, artifact, plan, canvas, workflows, capture, build,
  and more.
- **Interactive artifacts** — Claude emits a `claude-html` block;
  Companion renders it inline in a **sandboxed iframe** and can open it in your
  real browser or save it as a portable note.
- **Conversation history** — every chat persists across restarts; resume any
  past conversation from a fuzzy picker.
- **Never lose functionality** — an **Auto** chat backend transparently falls
  back to a local Ollama model when Claude is offline or out of usage, with a
  live connectivity indicator. Or run **Local only** for full offline use.
- **Unified bridge** — expose the vault as a loopback-only, token-gated MCP
  server so Claude Code / Claude Desktop work against the same notes.
- **Experimental, off by default** — **typed source capture** (enrich clipped
  files with typed frontmatter from per-type schemas) and a **vault ontology**
  (schema notes define note types + typed wikilink relations that Claude-created
  notes conform to).

→ Full details: [`obsidian-plugin/README.md`](obsidian-plugin/README.md)

## claude-obsidian (the Claude Code plugin)

Commands and skills that let Claude Code operate on your vault through the
Companion MCP bridge — turning a chat agent into a vault collaborator. **14
commands and 29 skills** across seven areas, all built on a shared grounding
discipline (cite real notes, never fabricate, writes confirmed):

| Area | Commands / skills |
|---|---|
| **Knowledge** | `vault-synthesis` (grounded, cited "what do I know about X"), `connection-finder`, `source-digest` |
| **Hygiene** | `consistent-tagging`, `wikilink-weaver`, `moc-builder`, `frontmatter-normalizer`, `note-splitter`, `dedup-merge` |
| **Writing** | `outline-to-draft`, `daily-rollup`, `session-to-note`, `meeting-cleanup`, `summarize-and-link` |
| **Build** | `plan-to-spec`, `tracker-driver`, `build-retrospective`, `task-harvester` (plus the `build-from-spec` command) |
| **Cloud** | `cloud-reply` (dispatch a cloud session; result lands as a reply note + PR for vault import) |
| **Advisor personas (`manifest-*`)** | `vault`, `pm`, `infra`, `feature`, `content`, `risk`, `research`: survey the vault, produce a prioritized `claude-html` artifact, and route work into the build pipeline |
| **Foundations** | `vault-grounding`, `vault-routines` (offer editable scheduled routines), and the `note-to-artifact` design system |

Headline command: `/claude-obsidian:session-to-note` distills a whole Claude
session into one consolidated, tagged, linked vault note — turning ephemeral
session memory into persistent knowledge-graph points.

→ Full details (all commands + skills): [`claude-plugin/README.md`](claude-plugin/README.md)

---

## How the two fit together

```mermaid
flowchart LR
    companion["Companion for Claude<br/>Obsidian plugin<br/>chat + artifacts · runs the MCP server"]
    bridge(["Loopback MCP bridge<br/>127.0.0.1 · bearer token · port 22360<br/>15 vault tools"])
    code["claude-obsidian<br/>Claude Code plugin<br/>14 commands · 29 skills"]

    companion <-->|"exposes vault tools"| bridge
    code <-->|"connects and drives the same vault"| bridge
```

**Vault tools exposed over the bridge (15 total)** — read (always):
`vault_search`, `note_read`, `list_recent`, `vault_tags`, `list_titles`,
`get_backlinks`, `get_outgoing_links`, `frontmatter_query`; write (gated behind
a setting): `note_create`, `note_append`, `note_update`, `update_frontmatter`,
`note_move` (rename/move with automatic backlink rewrite), `base_create`,
`canvas_create`.

Companion runs a local MCP server (`obsidian-vault`, bound to `127.0.0.1`,
bearer-token auth, default port **22360**). The Claude Code plugin connects to
it — so Claude Code and the in-vault chat operate on the **same** notes. The
compliant way to unify them without subscription OAuth in third-party tools.

## Getting it

**Install the Obsidian plugin (Companion for Claude)** — *Settings → Community
plugins → Browse → search "Companion for Claude" → Install → Enable*, or
[open it in Obsidian](obsidian://show-plugin?id=claude-companion).

**Install the Claude Code plugin** —
`/plugin marketplace add cavi-ai/claude-obsidian` then
`/plugin install claude-obsidian@claude-obsidian`.

<details><summary>Build from source (development)</summary>

```bash
git clone --recurse-submodules https://github.com/cavi-ai/claude-obsidian.git
# already cloned without submodules?
git submodule update --init --recursive
```

See [`obsidian-plugin/README.md`](obsidian-plugin/README.md) for plugin dev/build steps.
</details>

## Open-source hygiene

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — local development, release versioning,
  security-sensitive review rules.
- [`SECURITY.md`](SECURITY.md) — supported versions, vulnerability reporting,
  security boundaries.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — contributor standard.

## Provenance

The artifact design system is an **original reformulation** of the aesthetic in
Thariq Shihipar's gallery — not a copy of his HTML. The gallery itself is
vendored only as a pinned, unmodified submodule. Full attribution is in
[`NOTICE`](NOTICE); everything we authored is MIT-licensed ([`LICENSE`](LICENSE)).

## License

MIT — see [`LICENSE`](LICENSE). The vendored `upstream/html-effectiveness`
submodule is under its own Apache-2.0 license.
