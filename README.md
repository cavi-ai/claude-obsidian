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
Companion MCP bridge — turning a chat agent into a vault collaborator.

- **Commands** — `/claude-obsidian:note-to-artifact`, `:session-to-note`,
  `:daily-rollup`, `:manifest-vault`, `:manifest-pm`, `:build-from-spec`.
- **Skills** (model-invoked when relevant) — vault synthesis, vault grounding,
  consistent tagging, wikilink weaving, outline-to-draft, plan-to-spec,
  session-to-note, vault routines, and the artifact design system.

→ Full details: [`claude-plugin/README.md`](claude-plugin/README.md)

---

## How the two fit together

```
┌─────────────────────────┐         loopback MCP (127.0.0.1, bearer token)
│  Companion for Claude    │  ◀──────────────────────────────────────┐
│  (Obsidian plugin)       │                                          │
│  • chat + artifacts      │   exposes vault tools:                   │
│  • runs the MCP server   │   vault_search · note_read · note_create │
└─────────────────────────┘   note_append · note_update · list_titles│
                               list_recent · vault_tags ·             │
                               get_backlinks · get_outgoing_links ·   │
                               update_frontmatter                     │
                                                                      │
┌─────────────────────────┐                                          │
│  claude-obsidian         │  ────────────────────────────────────────┘
│  (Claude Code plugin)    │   connects and drives the same vault
└─────────────────────────┘
```

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
