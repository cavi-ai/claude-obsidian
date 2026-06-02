# claude-obsidian

**Cowork with Claude inside your [Obsidian](https://obsidian.md) vault.** Chat
with your notes as context, generate gallery-grade interactive HTML artifacts,
run extended-thinking sessions, and let Claude Code operate on the *same* vault —
all with your vault as the single source of truth.

Two paired, complementary deliverables that meet at a local MCP bridge:

| Path | What it is | Ships to |
|---|---|---|
| [`obsidian-plugin/`](obsidian-plugin/) | **Companion for Claude** — the Obsidian community plugin: side-panel chat, vault-aware context, inline `claude-html` artifacts, model/thinking controls, conversation history, slash commands, offline local-model fallback, and a loopback MCP bridge. | Obsidian community store |
| [`claude-plugin/`](claude-plugin/) | **claude-obsidian** — the Claude Code plugin + marketplace: commands and skills that drive your vault over the Companion MCP bridge (synthesis, tagging, drafting, session capture, artifacts, spec builds, advisor roadmaps). | Claude Code marketplace |
| [`upstream/html-effectiveness/`](upstream/) | Thariq Shihipar's ["unreasonable effectiveness of HTML"](https://github.com/ThariqS/html-effectiveness) gallery, vendored as a **pinned, unmodified submodule** (its own Apache-2.0 license). See [`NOTICE`](NOTICE). | — |

---

<!-- ## See it in action
     Screenshots pending — drop PNGs into assets/ (see assets/CAPTURE.md) and uncomment.

| Chat with your vault | Interactive artifacts |
|---|---|
| ![Companion chat panel with vault context](assets/chat-panel.png) | ![A claude-html artifact rendered inline](assets/artifact-inline.png) |

| Advisor roadmap (`manifest-*`) | Session → knowledge note |
|---|---|
| ![A manifest-pm roadmap artifact](assets/manifest-roadmap.png) | ![session-to-note distilling a session into the vault](assets/session-to-note.png) |

> Capturing these is a two-minute job — see [`assets/CAPTURE.md`](assets/CAPTURE.md) for the exact shots and filenames.

---
-->

## Companion for Claude (the Obsidian plugin)

A full Claude chat experience that lives in your vault and speaks its language.

- **Chat with vault context** — toggle `Context` chips to attach your active
  note, selection, linked/backlinked notes, or a keyword vault search to any
  message. Lightweight RAG, no embeddings.
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
  `/summarize`, `/ask`, `/improve`, `/artifact`, `/plan`, `/table`, `/explain`,
  `/build`, `/new`, `/history`, `/save`.
- **Beautiful interactive artifacts** — Claude emits a `claude-html` block;
  Companion renders it inline in a **sandboxed iframe** and can open it in your
  real browser or save it as a portable note.
- **Conversation history** — every chat persists across restarts; resume any
  past conversation from a fuzzy picker.
- **Never lose functionality** — an **Auto** chat backend transparently falls
  back to a local Ollama model when Claude is offline or out of usage, with a
  live connectivity indicator. Or run **Local only** for full offline use.
- **Unified bridge** — expose the vault as a loopback-only, token-gated MCP
  server so Claude Code / Claude Desktop work against the same notes.

→ Full details: [`obsidian-plugin/README.md`](obsidian-plugin/README.md)

## claude-obsidian (the Claude Code plugin)

Commands and skills that let Claude Code operate on your vault through the
Companion MCP bridge — turning a chat agent into a vault collaborator. **14
commands and 24 skills** across six areas, all built on a shared grounding
discipline (cite real notes, never fabricate, writes confirmed):

- **Knowledge** — `vault-synthesis` (grounded, cited "what do I know about X"),
  `connection-finder`, `source-digest`.
- **Hygiene** — `consistent-tagging`, `wikilink-weaver`, `moc-builder`,
  `frontmatter-normalizer`, `note-splitter`, `dedup-merge`.
- **Writing** — `outline-to-draft`, `daily-rollup`, `session-to-note`,
  `meeting-cleanup`, `summarize-and-link`.
- **Build** — `plan-to-spec`, `build-from-spec`, `tracker-driver`,
  `build-retrospective`, `task-harvester`.
- **Advisor personas (`manifest-*`)** — `vault`, `pm`, `infra`, `feature`,
  `content`, `risk`, `research`: survey the vault, produce a prioritized
  `claude-html` artifact, and route work into the build pipeline.
- **Foundations** — `vault-grounding`, `vault-routines` (offer editable
  scheduled routines), and the `note-to-artifact` design system.

Headline command: `/claude-obsidian:session-to-note` distills a whole Claude
session into one consolidated, tagged, linked vault note — turning ephemeral
session memory into persistent knowledge-graph points.

→ Full details (all commands + skills): [`claude-plugin/README.md`](claude-plugin/README.md)

---

## How the two fit together

```
┌─────────────────────────┐      loopback MCP (127.0.0.1, bearer token)
│  Companion for Claude    │  ◀───────────────────────────────────────┐
│  (Obsidian plugin)       │                                           │
│  • chat + artifacts      │   exposes 13 vault tools                  │
│  • runs the MCP server   │                                           │
└─────────────────────────┘                                           │
┌─────────────────────────┐                                           │
│  claude-obsidian         │  ─────────────────────────────────────────┘
│  (Claude Code plugin)    │   connects and drives the same vault
└─────────────────────────┘
```

**Vault tools exposed over the bridge** — read: `vault_search`, `note_read`,
`list_recent`, `list_titles`, `vault_tags`, `get_backlinks`,
`get_outgoing_links`, `frontmatter_query`; write (gated behind a setting):
`note_create`, `note_append`, `note_update`, `update_frontmatter`, `note_move`
(rename/move with automatic backlink rewrite).

Companion runs a local MCP server (`obsidian-vault`, bound to `127.0.0.1`,
bearer-token auth, default port **22360**). The Claude Code plugin connects to
it — so Claude Code and the in-vault chat operate on the **same** notes. The
compliant way to unify them without subscription OAuth in third-party tools.

## Getting it

```bash
git clone --recurse-submodules https://github.com/cavi-ai/claude-obsidian.git
# already cloned without submodules?
git submodule update --init --recursive
```

- **Install the Obsidian plugin** — see [`obsidian-plugin/README.md`](obsidian-plugin/README.md).
- **Install the Claude Code plugin** —
  `/plugin marketplace add cavi-ai/claude-obsidian` then
  `/plugin install claude-obsidian@claude-obsidian`.

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
