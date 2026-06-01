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
npm run dev         # esbuild watch → main.js (for live dev against a test vault)
npm run build       # tsc --noEmit + production bundle to main.js
npm run typecheck   # tsc --noEmit --skipLibCheck
npm run lint        # eslint src test
npm test            # vitest run (all unit tests)
npm run test:watch  # vitest watch
npx vitest run test/parse.test.ts   # run a single test file
```

CI (`.github/workflows/obsidian-plugin-ci.yml`) runs typecheck, lint, test, build on Node 20 & 22 for every push/PR.

## Architecture (obsidian-plugin)

`src/main.ts` is the Obsidian `Plugin` subclass: registers the chat view, the `claude-html` markdown code-block processor, commands, the settings tab, and starts the MCP bridge on layout-ready. Everything else is organized by concern under `src/`:

- **`providers/`** — `ProviderRouter` is the key abstraction. It builds providers from settings and routes by `TaskRole`: `chat` → Anthropic (Claude), `utility` (summaries/tagging/ingestion) → Ollama if `localUtilityEnabled`, else falls back to Claude. `anthropic.ts` and `ollama.ts` implement the common `Provider` interface; `errorHints.ts` turns raw failures into actionable messages.
- **`claude/`** — `sse.ts` parses the Anthropic streaming (SSE) response; `models.ts` resolves the model id (dropdown selection vs custom id).
- **`artifacts/`** — `designSystem.ts` holds the `DESIGN_SYSTEM_PROMPT` injected into every system prompt (`composeSystemPrompt`) plus `PLANNING_INSTRUCTION`; `parse.ts` extracts `claude-html` blocks; `renderInline.ts` renders them in a **sandboxed iframe** (`allow-scripts`, **not** `allow-same-origin`) with a restrictive CSP so artifacts can't reach the vault, cookies, forms, or network; `artifactStore.ts` saves them as notes.
- **`context/`** — `vaultContext.ts` assembles the context attached to a request (active note, selection, linked/backlinked notes, vault search) within `contextCharBudget`; `search.ts` is keyword scoring (lightweight RAG, no embeddings).
- **`mcp/`** — `server.ts` is the loopback HTTP MCP server (binds `127.0.0.1` only, bearer-token auth); `vaultTools.ts` implements the tools (`vault_search`, `note_read`, `list_recent`, `vault_tags` always; `note_create`/`note_append` only when `mcpAllowWrites`); `protocol.ts` is the JSON-RPC framing; `clientConfig.ts` emits the paste-ready Claude Code / Desktop connection snippets.
- **`build/`** — the spec→build handoff. `spec.ts` extracts tasks from a plan note and renders the build spec + the Claude Code command; `tracker.ts` renders the live `claude-html` progress board. `main.ts:handoffToBuild` writes a spec note + tracker note and copies a Claude Code command; Claude Code then drives the tracker through the MCP bridge / Obsidian CLI.
- **`indexing/`** — `frontmatter.ts` builds YAML frontmatter (title/tags/summary/type) on every saved artifact/chat so they index in the tag pane, search, and Dataview; `autoTagger.ts` (+ `taggerParse.ts`) uses the local model to suggest tags reusing existing vault tags.
- **`usage/tokens.ts`** — token counting + cost estimation for the context-window gauge and session totals.
- **`view/ChatView.ts`** — the side-panel chat UI (streaming, context chips, per-message Copy/Insert/Save).
- **`settings.ts` / `types.ts`** — settings tab and `PluginSettings` / `DEFAULT_SETTINGS`.

### Testability pattern

Obsidian-free logic (SSE parsing, artifact extraction, search scoring, frontmatter, MCP protocol, provider parsing) is factored into **pure modules** with no Obsidian imports so they unit-test without a running app. Modules that *do* import `obsidian` are tested against an in-memory fake: `vitest.config.ts` aliases the `obsidian` module to `test/fakes/obsidian.ts`. When adding logic, keep it in a pure module where possible and test it directly.

### Bundling

`esbuild.config.mjs` bundles `src/main.ts` → `main.js` (CJS, es2021). `obsidian`, `electron`, CodeMirror packages, and all Node builtins are marked **external** — the MCP server uses Node `http`, which exists at runtime because this is a **desktop-only** plugin (`isDesktopOnly: true`). Do not introduce browser-incompatible deps expecting a browser; this runs in Obsidian's Electron/Node environment.

## Conventions & gotchas

- **Version lockstep, never bump casually.** `manifest.json`, `versions.json`, and `package.json` versions must match the git tag, and `versions.json` maps version → `minAppVersion`. Per repo rules, do not change version numbers without explicit permission.
- **Three auth modes; API key is the store-facing default.** `providers/auth.ts` resolves the credential: **API key** (`x-api-key`, the default and the community-store-eligible path), **long-term OAuth token** (`sk-ant-oat…` from `claude setup-token`, sent as `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20`; usage bills to the user's subscription), and **environment import** (`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL`). An optional base-URL override points any mode at a gateway. The OAuth path was empirically verified (2026-05-31) to need **no** Claude Code identity system prompt, so it stays store-safe. Don't send a token as `x-api-key` (the API 401s) and don't gate OAuth behind an impersonation prompt.
- **The MCP bridge is security-sensitive.** It must stay loopback-only and token-gated with a non-empty bearer token, and writes must remain gated behind `mcpAllowWrites`. Don't widen the bind address, allow tokenless mode, or expose write tools by default.
- **Model ids** live in `src/claude/models.ts`; `DEFAULT_SETTINGS.model` is the current default. The repo's training-data-stale rule applies — verify model ids against the source, not memory.

## Monorepo assembly

This working copy holds both plugins plus (historically) Thariq Shihipar's HTML gallery that the artifact aesthetic derives from. `scripts/assemble-monorepo.sh` builds the public `cavi-ai/claude-obsidian` layout: our code at top level, Thariq's gallery pulled in as a **pinned, unmodified git submodule** (`upstream/html-effectiveness`). The script does **not** push — it builds `./claude-obsidian-monorepo` for review. See `docs/MONOREPO-PLAN.md` for the provenance/attribution model (`NOTICE` credits Thariq).
