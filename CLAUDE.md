# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A monorepo with **two paired deliverables** that let you cowork with Claude inside an Obsidian vault:

- **`obsidian-plugin/`** — *Claude Companion*, the Obsidian community plugin (TypeScript). The bulk of the code. Chat panel, vault-aware context, interactive `claude-html` artifacts, local-model routing, and a local MCP server that exposes the vault.
- **`claude-plugin/`** — the *claude-obsidian* Claude Code plugin: commands (`/claude-obsidian:note-to-artifact`, `:build-from-spec`), the `note-to-artifact` skill, and `.mcp.json` pre-wired to Companion's MCP bridge.

The two halves meet at the **MCP bridge**: Companion runs a loopback HTTP MCP server exposing vault tools; the Claude Code plugin connects to it so Claude Code and Companion operate on the same vault.

## Commands

All build/test commands run from `obsidian-plugin/`:

```bash
pnpm run dev         # esbuild watch → main.js (for live dev against a test vault)
pnpm run build       # tsc --noEmit + production bundle to main.js
pnpm run typecheck   # tsc --noEmit --skipLibCheck
pnpm run lint        # eslint src test
pnpm test            # vitest run (all unit tests)
pnpm run test:watch  # vitest watch
pnpm exec vitest run test/parse.test.ts   # run a single test file
```

CI (`.github/workflows/obsidian-plugin-ci.yml`) runs typecheck, lint, test, build on Node 20 & 22 for every push/PR.

## Architecture (obsidian-plugin)

`src/main.ts` is the Obsidian `Plugin` subclass: registers the chat view, the `claude-html` markdown code-block processor, commands, the settings tab, and starts the MCP bridge on layout-ready. Everything else is organized by concern under `src/`:

- **`providers/`** — `ProviderRouter` is the key abstraction. It builds providers from settings and routes by `TaskRole`: `chat` → Anthropic (Claude), `utility` (summaries/tagging/ingestion) → Ollama if `localUtilityEnabled`, else falls back to Claude. `anthropic.ts` and `ollama.ts` implement the common `Provider` interface; `errorHints.ts` turns raw failures into actionable messages.
- **`claude/`** — `sse.ts` parses the Anthropic streaming (SSE) response; `models.ts` resolves the model id (dropdown selection vs custom id).
- **`artifacts/`** — `designSystem.ts` holds the `DESIGN_SYSTEM_PROMPT` injected into every system prompt (`composeSystemPrompt`) plus `PLANNING_INSTRUCTION`; `parse.ts` extracts `claude-html` blocks; `renderInline.ts` renders them in a **sandboxed iframe** (`allow-scripts`, **not** `allow-same-origin`) with a restrictive CSP so artifacts can't reach the vault, cookies, forms, or network; `artifactStore.ts` saves them as notes.
- **`context/`** — `vaultContext.ts` assembles the context attached to a request (active note, selection, linked/backlinked notes, vault search) within `contextCharBudget`; `search.ts` is keyword scoring; optional local embeddings (built-in transformers.js worker by default, or Ollama) add semantic search (hybrid RRF fusion when enabled); `attachments.ts` handles vault PDFs/images and pasted screenshots as multimodal blocks.
- **`semantic/`** — the local-embeddings index behind semantic search and related notes: `indexer.ts` orchestrates traverse → chunk → embed → store (IO injected; embeddings via the built-in transformers.js worker (default, cross-platform) or Ollama; index build runs on desktop and mobile); `store.ts` is the pure vector store + (de)serialization.
- **`mcp/`** — `server.ts` is the loopback HTTP MCP server (binds `127.0.0.1` only, bearer-token auth); `vaultTools.ts` implements read tools always (`vault_search`, `note_read`, `list_recent`, `vault_tags`, `list_titles`, `get_backlinks`, `get_outgoing_links`, `frontmatter_query`) and write tools when `mcpAllowWrites` (`note_create`, `note_append`, `note_update`, `update_frontmatter`, `note_move`, `base_create`, `canvas_create`); `protocol.ts` is the JSON-RPC framing; `clientConfig.ts` emits the paste-ready Claude Code / Desktop connection snippets. The nine `research_*` tools (defined in `research/tools.ts`) are also served here: `research_project_read` and `research_audit` always, the seven research write tools behind the same `mcpAllowWrites` gate.
- **`agent/`** — agent mode (vault tools in chat): `loop.ts` runs the stream → execute tools → re-stream turn until the model stops asking (pure, deps injected); `tools.ts` adapts the `VaultTools` MCP defs to Anthropic tool-use with write gating and result truncation; `prompt.ts` is the agent system-prompt addendum.
- **`edit/diff.ts`** — the apply-edits model: validates exact-string replacements against a note, renders per-hunk reviewable diffs, and applies the user-accepted subset. Pure.
- **`links/`** — link intelligence: `unlinkedMentions.ts` finds plain-text occurrences of other notes' titles/aliases; `suggest.ts` merges them with semantic neighbors into one ranked list and turns accepted mentions into diff-reviewable edits.
- **`build/`** — the spec→build handoff. `spec.ts` extracts tasks from a plan note and renders the build spec + the Claude Code command; `tracker.ts` renders the live `claude-html` progress board. `main.ts:handoffToBuild` writes a spec note + tracker note and copies a Claude Code command; Claude Code then drives the tracker through the MCP bridge.
- **`cloud/`** — the cloud loop (works on mobile, no local bridge needed): `routines.ts` dispatches a Claude Code cloud session via the experimental Routines API; `replies.ts` pulls the reply notes that session writes to the vault's GitHub repo over the Contents API.
- **`workflows/catalog.ts`** — Companion-native adaptations of the claude-obsidian Claude Code workflows (manifest personas, rollups, MOCs, digests) as self-contained prompts. Pure data.
- **`indexing/`** — `frontmatter.ts` builds YAML frontmatter (title/tags/summary/type) on every saved artifact/chat so they index in the tag pane, search, and Dataview; `autoTagger.ts` (+ `taggerParse.ts`) uses the local model to suggest tags reusing existing vault tags.
- **`memory/`** — session memory: `sessions.ts` + `transcript.ts` discover and digest Claude Code CLI sessions (the Node fs reader lives in desktop-only `nodeReader.ts`, lazy-imported); `consolidate.ts` merges digests into the evolving "What Claude Knows" note.
- **`research/`** — the Research Workbench: projects, sources, evidence, claims, questions, and documents as typed Markdown notes (vault is the source of truth). `repository.ts` is the vault-backed store; `parse.ts`/`render.ts` round-trip canonical records; `identity.ts` dedups sources by canonical id; `graph.ts` builds project snapshots; `audit.ts` flags broken references, unsupported claims, stale fingerprints, unreviewed evidence; `draft*`/`revision*` implement claim-grounded section drafting and claim-preserving revision (model output validated deterministically); `webCapture.ts` captures web sources as clean readable markdown; `tools.ts` defines the `research_*` MCP tool set; `viewModel.ts`/`workbenchRouting.ts` back the Workbench view.
- **`discovery/`** — scholarly discovery behind the Workbench's Discover tab: `adapters/` (OpenAlex search, Crossref + arXiv enrichment), `coordinator.ts` orchestrates search → normalize/merge → rank (`rank.ts`) → optional model rerank (`rerank.ts`) → import via the research repository; `safeUrl.ts` scheme-checks URLs; network requests fire only on explicit user actions and results cache locally.
- **`sources/`** — typed source capture (dormant; `sourceCaptureEnabled` off by default): `watcher.ts` decides which new inbox files to enrich, `detect.ts` classifies the source type, `registry.ts` holds the per-type frontmatter schemas, `enrich.ts` fills them.
- **`ontology/`** — vault ontology (dormant; `ontologyEnabled` off by default): `schema.ts` parses schema notes (frontmatter markers + fenced yaml) into resolved types with inheritance; `conform.ts` is advisory conformance checking with safe auto-fixes; `seed.ts` backs the "Seed ontology" command; `digest.ts` injects a compact type digest into the system prompt. When enabled, `note_create` also advertises `type`/`properties`.
- **`canvas/jsonCanvas.ts`** — validates/normalizes a model-proposed node/edge graph into JSON Canvas 1.0 with deterministic auto-layout (backs `canvas_create`).
- **`bases/baseFile.ts`** — validates a model-proposed database view and emits the documented Obsidian Bases `.base` YAML (backs `base_create`).
- **`conversations/store.ts`** — pure conversation store: saved chats survive restarts and resume from a session list; the plugin owns persistence.
- **`usage/tokens.ts`** — token counting + cost estimation for the context-window gauge and session totals.
- **`view/ChatView.ts`** — the side-panel chat UI (streaming, context pills, expandable tool chips in agent mode, per-message Copy/Insert/Save).
- **`settings.ts` / `types.ts`** — settings tab and `PluginSettings` / `DEFAULT_SETTINGS`.

### Testability pattern

Obsidian-free logic (SSE parsing, artifact extraction, search scoring, frontmatter, MCP protocol, provider parsing) is factored into **pure modules** with no Obsidian imports so they unit-test without a running app. Modules that *do* import `obsidian` are tested against an in-memory fake: `vitest.config.ts` aliases the `obsidian` module to `test/fakes/obsidian.ts`. When adding logic, keep it in a pure module where possible and test it directly.

### Bundling

`esbuild.config.mjs` bundles `src/main.ts` → `main.js` (CJS, es2021) in two passes: pass 1 bundles `src/semantic/transformers/worker.ts` (transformers.js included) to `.build/embed-worker.txt`; pass 2 inlines that file as text (`loader: { ".txt": "text" }`) into `main.js`, which instantiates it via a Blob-URL worker at runtime. `obsidian`, `electron`, CodeMirror packages, and all Node builtins are marked **external** — the MCP server uses Node `http`, which exists at runtime on desktop because Obsidian's Electron exposes Node. Desktop-only features are now just the MCP bridge and session import, gated at runtime; chat, artifacts, and semantic search all run on mobile too.

## Conventions & gotchas

- **Version lockstep, never bump casually.** `manifest.json`, `versions.json`, and `package.json` versions must match the git tag, and `versions.json` maps version → `minAppVersion`. Per repo rules, do not change version numbers without explicit permission.
- **Three auth modes; API key is the store-facing default.** `providers/auth.ts` resolves the credential: **API key** (`x-api-key`, the default and the community-store-eligible path), **long-term OAuth token** (`sk-ant-oat…` from `claude setup-token`, sent as `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20`; usage bills to the user's subscription), and **environment import** (`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL`). An optional base-URL override points any mode at a gateway. The OAuth path was empirically verified (2026-05-31) to need the Claude Code identity system block prepended, so it stays store-safe. Don't send a token as `x-api-key` (the API 401s).
- **The MCP bridge is security-sensitive.** It must stay loopback-only and token-gated with a non-empty bearer token, and writes must remain gated behind `mcpAllowWrites`. Don't widen the bind address, allow tokenless mode, or expose write tools by default.
- **Model ids** live in `src/claude/models.ts`; `DEFAULT_SETTINGS.model` is the current default. The repo's training-data-stale rule applies — verify model ids against the source, not memory.

## Monorepo assembly

This working copy holds both plugins plus Thariq Shihipar's HTML gallery that the artifact aesthetic derives from. The gallery is a **pinned, unmodified git submodule** at `upstream/html-effectiveness/`. Full provenance and attribution are in [`NOTICE`](NOTICE).
