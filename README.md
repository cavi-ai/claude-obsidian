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
| [`obsidian-plugin/`](obsidian-plugin/) | **Companion for Claude** — the Obsidian community plugin: side-panel chat with **agent mode** (Claude works your vault with its own tools), diff-reviewed note edits, vault-aware context with PDF/image attachments, link suggestions, consolidated memory, native Canvas/Bases generation, inline `claude-html` artifacts, prompt caching, offline local-model fallback, and a loopback MCP bridge. | Obsidian community store |
| [`claude-plugin/`](claude-plugin/) | **claude-obsidian** — the Claude Code plugin + marketplace: commands and skills that drive your vault over the Companion MCP bridge (synthesis, tagging, drafting, session capture, artifacts, spec builds, advisor roadmaps). | Claude Code marketplace |
| [`upstream/html-effectiveness/`](upstream/) | Thariq Shihipar's ["unreasonable effectiveness of HTML"](https://github.com/ThariqS/html-effectiveness) gallery, vendored as a **pinned, unmodified submodule** (its own Apache-2.0 license). See [`NOTICE`](NOTICE). | — |
| [`upstream/obsidian-skills/`](upstream/) | Steph Ango's (@kepano, Obsidian CEO) [Obsidian Skills](https://github.com/kepano/obsidian-skills) — agent skills for Obsidian's open formats, vendored as a **pinned, unmodified submodule** (its own MIT license) and used as the canonical format reference for our Bases, Canvas, and Obsidian-Flavored-Markdown emitters. See [`NOTICE`](NOTICE). | — |

---

## See it in action

| Chat with your vault | Interactive artifacts |
|---|---|
| ![Companion chat panel with vault context](obsidian-plugin/assets/chat-panel.png) | ![A claude-html artifact rendered inline](obsidian-plugin/assets/artifact-inline.png) |

<!-- screenshots wanted: session-to-note.png, chat-controls.png — see assets/CAPTURE.md in the mirror repo -->

---

## Companion for Claude (the Obsidian plugin)

A full Claude chat experience that lives in your vault and speaks its language.

- **Agent mode** — Claude searches, reads, and follows links across your vault
  **on its own** while answering, each step visible as a tool chip. Optional
  write tools (create/edit/move notes) sit behind a per-action confirmation.
- **Edits as reviewable diffs** — "improve this note" produces a red/green
  per-hunk diff you accept or reject before anything is written.
- **Chat with vault context** — toggle `Context` chips to attach your active
  note, selection, linked/backlinked notes, or a keyword vault search to any
  message. **@-mention** notes, folders, **PDFs and images** — or paste a
  screenshot straight into the composer.
- **Contextual workspaces in Companion** — when Chat is empty, Companion
  recognizes the active note or canonical research project and offers the next
  relevant continuation without becoming a separate homepage. Research views
  can return to Chat with project context attached and ready for the user.
- **Second-brain loops** — live **link suggestions** (unlinked mentions, one
  click to wire up), and session digests consolidated into an evolving **"What
  Claude Knows"** memory note that agent mode reads back.
- **Native Canvas & Bases output** — Claude builds `.canvas` mind maps wired to
  real notes and `.base` database views over your frontmatter, write-gated like
  every other mutation.
- **Evidence-backed research desk** — a guided daily view keeps one active
  project, explains the next best action, surfaces work needing attention, and
  hands off to the advanced workbench for sources, evidence, claims, outlining,
  drafting, assurance, intelligence, and scholarly discovery.
- **Prompt caching built in** — repeated context is cached server-side (reads at
  0.1× the input rate); the cost gauge accounts for it.
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
  research, and more.
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

### Evidence-backed research workflow

Use `/research` in Companion to open the native **Research Desk**. It gives one
active project a clear stage, deterministic next action with an explanation,
document progress, attention queue, and fast routes into deeper work without
requiring a model request. Pin or dismiss guidance, switch projects, or open the
advanced Research Workbench when you need the complete record-level controls.
In Claude Code, use `/claude-obsidian:research-workbench` for the skill-driven
MCP workflow over the same canonical vault records.

The core path is **Create project → Import source → Capture evidence → Review →
Build claims → Generate outline → Draft → Revise → Assure**. Source captures receive a
content fingerprint; evidence records preserve the exact excerpt, locator, and
captured fingerprint; claims keep supporting, challenging, and contextual
relations distinct. The research workbench presents the resulting canonical
Markdown records and their audit health.

Draft revisions are claim-preserving: each request carries the grounded section
packet and explicit intent, the response is validated before preview, and the
user reviews the proposed result before it can replace the section. Unsupported
citations, silent claim loss, stale grounding, and malformed revision responses
are rejected instead of being written into the document.

Only **reviewed**, locatable, non-stale evidence linked to a valid source counts
as trusted claim support. Proposed evidence remains visible but does not satisfy
the audit.

### Research Intelligence

Open Research Desk with `/research`, continue into the advanced Workbench, then
choose the **Intelligence** tab. Its deterministic analysis reads the project's canonical
records locally, refreshes automatically when those records change, and groups
traceable findings into four categories:

- **Contradictions** identify a claim linked to both trusted supporting and
  challenging evidence; they do not decide which evidence is stronger.
- **Method differences** identify captured differences such as the source kinds
  behind supporting and challenging evidence; they do not infer uncaptured
  methodology.
- **Research gaps** identify open questions, unsupported claims, or places where
  counterevidence or independent sources should be investigated.
- **Evidence quality** surfaces deterministic audit problems such as stale or
  unreviewed evidence, missing locators, and broken references.

The separate **Model narrative** is optional and runs only when you click
**Analyze**. The result names the provider and model that produced it, and its
citations are validated against paths in the current project before display.
Choose its provider under *Settings → Research intelligence narrator*:

- **Current chat backend** follows the chat setting. Local starts with Ollama;
  Claude starts with Anthropic; Auto starts with Anthropic and retries with
  Ollama only when Claude is unavailable, rejects credentials, is rate-limited
  or out of usage, or returns a server error, and a local model is available.
- **Claude only** uses Anthropic without a local fallback.
- **Local only** uses Ollama.
- **Disabled** removes the Analyze action while deterministic findings remain
  available.

Narratives are derived summaries, not vault records: they perform no vault
writes and may be marked **Out of date** after the project changes. Neither the
deterministic findings nor model narrative is a judgment of scientific validity;
follow each finding's cited paths and verification guidance before drawing a
conclusion.

## claude-obsidian (the Claude Code plugin)

Commands and skills that let Claude Code operate on your vault through the
Companion MCP bridge — turning a chat agent into a vault collaborator. **16
commands and 30 skills** across seven areas, all built on a shared grounding
discipline (cite real notes, never fabricate, writes confirmed):

| Area | Commands / skills |
|---|---|
| **Knowledge** | `vault-synthesis` (grounded, cited "what do I know about X"), `connection-finder`, `source-digest`, `research-workbench` |
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
    bridge(["Loopback MCP bridge<br/>127.0.0.1 · bearer token · port 22360<br/>10 reads · 14 write-gated tools"])
    code["claude-obsidian<br/>Claude Code plugin<br/>16 commands · 30 skills"]

    companion <-->|"exposes vault tools"| bridge
    code <-->|"connects and drives the same vault"| bridge
```

**Vault tools exposed over the bridge** — 10 reads/audits (always):
`vault_search`, `note_read`, `list_recent`, `vault_tags`, `list_titles`,
`get_backlinks`, `get_outgoing_links`, `frontmatter_query`,
`research_project_read`, `research_audit`; 14 mutations (gated behind *Allow
MCP writes*): `note_create`, `note_append`, `note_update`,
`update_frontmatter`, `note_move` (rename/move with automatic backlink
rewrite), `base_create`, `canvas_create`, `research_project_create`,
`research_source_import`, `research_evidence_capture`,
`research_evidence_review`, `research_claim_create`, `research_claim_link`,
`research_outline_generate`.

Research Workbench project reads and audits are therefore available even when
writes are disabled. Project, source, evidence, evidence-review, claim, link,
and outline mutations require *Allow MCP writes*; in Companion agent mode they
also retain the normal confirmation gate. Review mutates evidence records only,
and accepts the terminal states `reviewed` or `rejected`. Permanent legacy
aliases remain callable for compatibility but are intentionally omitted from
the advertised command catalog.

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
vendored only as a pinned, unmodified submodule.

Steph Ango's (@kepano) [Obsidian Skills](https://github.com/kepano/obsidian-skills)
are vendored the same way at `upstream/obsidian-skills/` and serve as the
canonical format reference for our `.base`, `.canvas`, and Obsidian-flavored
Markdown generation. His skills work on vault *files* (including via
`obsidian-cli`); the Companion MCP bridge works on the *live, running* vault —
the two are complementary, and we recommend installing both. Web-source capture
uses his [Defuddle](https://github.com/kepano/defuddle) library (MIT), the same
extraction engine behind the official Obsidian Web Clipper.

Full attribution is in [`NOTICE`](NOTICE); everything we authored is
MIT-licensed ([`LICENSE`](LICENSE)).

## License

MIT — see [`LICENSE`](LICENSE). The vendored `upstream/html-effectiveness`
submodule is under its own Apache-2.0 license.
