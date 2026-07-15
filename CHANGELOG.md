# Changelog

All notable changes to **Companion for Claude** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.11.0] — 2026-07-15

### Added
- **Research Workbench — a vault-native, provenance-preserving research
  system.** Projects, sources, evidence, claims, questions, and documents are
  ordinary typed Markdown notes; the vault stays the source of truth. Sources
  carry content fingerprints so drift is detectable; evidence cards require an
  exact excerpt and must be explicitly reviewed (with a locator) before they
  count as trusted; claims keep supporting, challenging, and contextualizing
  evidence structurally separate. An Audit tab flags broken references,
  unsupported claims, stale fingerprints, and unreviewed evidence. Nine new
  MCP research tools expose the workflow to Claude Code (two read-only, seven
  gated behind *Allow MCP writes*), and a `/research-workbench` command +
  skill ship in the Claude Code plugin.
- **Scholarly discovery.** The Workbench's Discover tab searches OpenAlex,
  enriches through Crossref and arXiv, expands citation graphs, and imports
  candidates as provenance-stamped sources. Network requests fire only on
  explicit actions (Search, Expand, Rerank, Import) — never in the background —
  URLs are scheme-checked before use, and results cache locally with a
  configurable lifetime. On by default; toggleable in settings.
- **Claim-grounded section drafting.** The Draft panel writes one section at a
  time from reviewed claims, validates the model's output deterministically,
  and records a provider/model/evidence envelope so sections flag themselves
  when edited or when their grounding drifts.
- **Web sources auto-capture as clean readable markdown.**
  `research_source_import` fetches a web source's page and reduces it to
  article markdown via Defuddle (MIT, Steph Ango — the Obsidian Web Clipper
  engine) with third-party extractor APIs disabled, so a pasted URL becomes
  fingerprinted captured text instead of a bare link. Capture failures fall
  back to metadata-only imports.
- **Full-spec Obsidian Bases generation.** `base_create` now covers all four
  view types (table, cards, list, map), recursive and/or/not filter groups,
  and column summaries — the 14 built-in aggregates plus custom summary
  formulas — validated with actionable errors.
- **Canvas groups.** `canvas_create` supports JSON Canvas 1.0 labeled group
  nodes; nodes opt in via a `group` field and the auto-layout grids them
  inside an auto-sized group box.
- **Evidence deep links and claim callouts.** Evidence notes anchor their
  excerpt with a `^excerpt` block reference (embed the exact quote anywhere
  with `![[note#^excerpt]]`), and claim notes render limitations as a
  collapsible warning callout.
- **kepano's Obsidian Skills vendored with attribution.** Steph Ango's
  [obsidian-skills](https://github.com/kepano/obsidian-skills) are pinned
  unmodified at `upstream/obsidian-skills/` as the canonical format reference
  for our Bases, Canvas, and Obsidian-Flavored-Markdown emitters (see
  `NOTICE`).
- **Companion keeps the active work in context.** Empty Chat now surfaces one
  relevant workspace card for the active note or research project instead of
  making users choose a subsystem first. Research Desk and the advanced
  Workbench can return to Chat with the canonical project already attached,
  while ordinary notes stay note-focused and unrelated research stays hidden.
- **Research Desk is the new guided daily research view.** It keeps one active
  project in focus with stage and document progress, an explainable next best
  action, pin/dismiss controls, a focused attention queue, project switching,
  and contextual handoffs into the advanced Research Workbench. The responsive
  interface is container-aware from narrow sidebars through wide panes.
- **Claim-preserving draft revision.** Draft sections can be revised from an
  explicit intent and current grounding packet, previewed before replacement,
  and accepted only after deterministic validation. The coordinator blocks
  malformed responses, stale grounding, unsupported citations, and silent loss
  of required claims.
- **Real Obsidian research E2E coverage.** A disposable-vault Playwright harness
  exercises plugin startup, project continuity, guidance controls, every quick
  action, all nine advanced panels, responsive widths, and EPIPE/unhandled
  console monitoring against the production bundle.
- **Research Intelligence is now documented and covered end to end.** The
  Research Workbench's Intelligence tab provides automatically refreshed,
  local deterministic findings across contradictions, method differences,
  research gaps, and evidence quality. Optional, explicit model narratives show
  their provider and model, validate project-path citations, become stale after
  project edits, and never write to the vault. The narrator can follow the
  Current chat backend, use Claude only, use Local only, or be Disabled.

### Fixed
- **Research navigation remains usable at real sidebar widths.** Advanced tabs
  collapse into a compact selector, Research Desk cards stack without overlap,
  stage labels simplify when space is constrained, and controls retain named
  40px targets without horizontal overflow.
- **`/research` now opens the native Research Desk.** Selecting the slash
  command no longer inserts internal research-tool instructions or sends a chat
  request. It now opens the Research Desk, while the advanced Workbench remains
  available from contextual actions and the command palette.
- **Active research projects resolve from canonical metadata.** Project notes
  resolve to themselves, while Source, Evidence, Claim, Question, and Document
  records follow their explicit `project` relationship. Ordinary notes and
  folder placement alone no longer guess an owning project.

## [0.10.1] — 2026-07-09

### Added
- **`/frontmatter` slash command.** Review and normalize the active note's
  frontmatter from chat; related note commands consolidated into the slash
  palette.

### Fixed
- **Artifact hardening.** Enforced CSP on rendered artifacts, hardened
  external-open handling, and sharpened the interactivity check.
- **MCP bridge hardening.** Guarded vault-escape paths and hardened the
  loopback server.
- **Provider correctness.** Fixed auth headers, streaming fallback, and the
  model default.
- **Context handling.** Attachment MIME sniffing, context budget respected,
  drift and scoring guards.
- **Mobile.** Restored action icons and shrank the composer.

## [0.10.0] — 2026-07-09

### Added
- **Built-in embeddings — semantic search everywhere.** A bundled
  transformers.js worker embeds notes locally on desktop *and* mobile (no
  Ollama required; Ollama remains available as an engine choice, with legacy
  index migration and an explicit model download step). Semantic + keyword
  hybrid search now works cross-platform.
- **Vault ontology (phase 1, dormant by default).** Schema notes define typed
  frontmatter with inheritance; advisory conformance checking with safe
  auto-fixes, a typed graph projection, a seed command with 15 default types,
  and a compact type digest injected into the system prompt. When enabled,
  `note_create` accepts `type`/`properties`.

### Security
- Sixteen fixes from a dedicated audit: artifact CSP, path-traversal guards,
  bearer-token auth handling, OAuth gating, MCP server hardening, MIME
  validation, streaming robustness, and URL substring sanitization.

## [0.9.0] — 2026-07-06

### Added
- **Agent mode.** Claude works your vault with its own tools in chat —
  streaming tool use with expandable tool chips, write gating, and prompt
  caching for cheaper multi-turn agent loops.
- **Apply-to-note diff review.** Model-proposed edits render as per-hunk
  reviewable diffs; you accept exactly the hunks you want.
- **Link intelligence.** Unlinked-mention detection plus semantic neighbors
  merge into one ranked suggestion list; accepted mentions become
  diff-reviewable edits.
- **Consolidated memory.** Session digests merge into one evolving "What
  Claude Knows" note.
- **Multimodal attachments.** Vault PDFs and images, plus pasted screenshots,
  attach to chat as native multimodal blocks.
- **Native Canvas and Bases generation.** `canvas_create` builds Obsidian
  Canvas mind maps wired to real notes; `base_create` builds .base database
  views from your real frontmatter properties.

## [0.8.3] — 2026-06-26

### Added
- **Mobile redesign, phase 1.** Touch-first chat layout keyed on
  `.is-mobile`, tappable header, dedicated context button, curated mobile
  settings, and feature gating for desktop-only capabilities.

## [0.8.2] — 2026-06-16

### Changed
- **Store-review: removed all `eslint-disable` directives.** The community-store
  reviewer disallows suppressing its rules, so the previously-suppressed items are
  now fixed for real: `globalThis` → `window`, network `fetch` → `window.fetch`,
  and the desktop-only Node builtins (`http`, `fs`, `os`, `path`) are loaded at
  runtime via Electron's `window.require` so the bundle never statically imports
  them. No behavior change; the plugin still gates all of this off on mobile.

## [0.8.1] — 2026-06-12

### Added
- **In-app access disclosure.** Settings now opens with a plain-English "What
  this plugin accesses" summary — where data goes (only Anthropic / your local
  Ollama), which desktop features read files outside the vault, that semantic
  search reads every note, and that all filesystem access is off on mobile.

### Changed
- **Minimum Obsidian version is now 1.7.2** (required by the workspace
  `revealLeaf` API used to focus the chat/memory panels).
- **Community-store review compliance.** Popout-window-safe DOM access
  (`activeDocument` / `window.setTimeout`), iOS-safe regex (no lookbehind),
  stricter typing throughout, and a reduced-motion CSS rule without `!important`.
  CI now runs the official `eslint-plugin-obsidianmd` ruleset so these can't regress.

## [0.8.0] — 2026-06-09

### Added
- **Mobile support.** Companion now loads and runs on Obsidian mobile
  (`isDesktopOnly` is off). Capabilities that require Node/Electron — the local
  MCP bridge and Claude Code session import — are automatically gated off on
  phones, while chat, vault-aware context, and interactive artifacts work there.

### Changed
- **Store-compliant styling.** Every dynamic style now goes through Obsidian's
  `setCssStyles` instead of direct `el.style` assignment, per the community-store
  review guidelines.
- **Tooling moved to pnpm.** Build and test run on pnpm; `pnpm-lock.yaml` replaces
  the npm lockfile and the scripts are now `pnpm run …`.
- **Type-safety hardening.** Removed unsafe `any` assignments across the codebase
  for stricter types.

## [0.7.2] — 2026-06-07

### Added
- **@-mention to add context.** Type `@` in the chat to pull in your active
  note, your selection, linked notes, the entire vault, or any specific
  note/folder. Attached sources show as removable pills above the input — this
  replaces the old context-toggle chips for a cleaner chat.
- **Artifact "Open" is now a split button.** One click opens per your setting;
  the ▾ caret lets you pick a target one-off (in Obsidian full-screen, default
  browser, Chrome, Safari, Brave, or Firefox).

### Changed
- **Calmer "thinking" indicator.** A single breathing clay smiley sits to the
  left of the cycling word (fixed, so it never jumps as the word changes), with
  the smiley pulse and word fade synced at a 4:1 tempo (80 / 20 bpm). The old
  second "▍" cursor that fought it is gone.
- **Tidier composer.** The model switcher gained a chevron; the thinking /
  temperature / max-token knobs collapse into one "tune" button beside it; and
  Send now sits directly under the input.
- **Higher output caps.** The response-token default rose to 20k, and the
  artifact/plan cap to 32k, so rich tabbed documents finish instead of
  truncating mid-script (which broke their interactivity).

### Fixed
- **Artifact interactivity is reliable.** The design system + note-to-artifact
  skill now ship a robust tabs pattern (first panel visible by default;
  `addEventListener` over data-attributes, so no handler can dangle) and require
  the document to finish — so tabs/accordions actually switch.
- The MCP bridge status/menu moved into the header (the chip/status row is gone).

## [0.7.1] — 2026-06-06

### Changed
- **Chat controls, refined.** The model switcher now shows a chevron (clearly a
  dropdown); the thinking / effort / temperature / max-tokens knobs collapsed
  into a single "tune" popover, so the Send button is never buried.
- **Artifacts open your way.** A new **⛶ Fullscreen** button opens an artifact in
  a full-window in-app view, and a new setting ("Open artifacts in") lets you
  choose the in-app view (default), the system browser, or Chrome / Safari /
  Brave / Firefox.
- **Settings are tidier.** Every section past Connection & Behavior is now a
  collapsed accordion, so the settings tab opens clean.
- **Semantic search reaches Claude Code too.** The MCP `vault_search` tool now
  fuses semantic + keyword results (when the index is built), so Claude Code and
  Claude Desktop search your vault by meaning, not just keywords.

### Fixed
- **Build handoff uses the real bridge.** "Hand off to Claude Code" now drives the
  build through the working MCP `note_read` / `note_append` tools instead of a
  non-existent `obsidian` CLI.

## [0.7.0] — 2026-06-06

### Added
- **Semantic search (local embeddings).** Your vault is now searchable by meaning,
  not just keywords. A local Ollama embedding model builds a private vector index
  (chunked, incrementally re-embedded on save); the "Search vault" context and the
  Ask-your-vault command now fuse semantic + keyword results. Enable it and pick a
  model in Companion settings → Semantic search, then Rebuild.
- **Ask your vault, with citations.** When vault matches are attached, Claude cites
  the source notes inline as `[[wikilinks]]` so you can click straight through.
- **Related Notes panel.** A sidebar (command: "Open related notes panel") that
  tracks the active note and surfaces its semantically-related notes — Open or
  insert a `[[link]]` in one click. Finds connections that share no title words.
- `OllamaProvider.embed()` for the local embeddings endpoint.

### Notes
- Semantic features are off by default and degrade gracefully to keyword search
  when Ollama or the embedding model isn't available — nothing regresses.

## [0.6.2] — 2026-06-05

### Added
- **Local models in the chat switcher.** The model dropdown now lists detected
  Ollama models under a "Local (Ollama)" group; picking one routes the chat to
  that local model (no settings trip). Picking a Claude model routes back.

### Changed
- **Controls moved to the bottom composer.** Model switcher sits bottom-left,
  thinking/effort/temp/max on the right, and the context gauge + Send share one
  footer row — the top is freed for reading.
- **Header & chips cleanup.** Action icons top-aligned; the backend pill no longer
  indents out of the title; the `Context` label moved to its own line so the
  toggle and status rows share a flush-left edge; status pills now use the
  context-chips pill shape.
- **MCP pill** matches its sibling pills in size/shape and gains a caret marking
  it as a menu.
- **Ingest-on-save** is now an icon toggle in the header instead of a checkbox.
- **One ribbon icon** (Open Companion); the workflow and session-capture ribbon
  entries were removed (both remain in the panel's header bar).

### Fixed
- **Session memory** reads the vault base path via the official
  `FileSystemAdapter.getBasePath()` instead of an unchecked property cast.

## [0.6.1] — 2026-06-03

### Fixed
- **Responses no longer cut off silently.** Big outputs (manifests, artifacts, plans) were
  hitting the output-token limit and ending with no explanation. Now: the default cap is
  raised (4096 → 8192), artifact/plan/workflow runs request generous headroom, and if a
  reply *is* truncated at the limit the chat says so and tells you to raise "max" and
  regenerate (the API's `max_tokens` stop reason is finally surfaced).
- **Chat flicker.** Streaming now throttles the markdown re-render (~100ms) instead of
  re-rendering every animation frame, eliminating the flicker during long replies.
- **Blurry/glitchy text.** Dropped the `container-type` responsive containers (a Chromium
  quirk that rasterizes text on a fractional layer and blurs it); narrow-panel wrapping now
  uses plain flex-wrap. Crisp at every width.
- **Faux-interactive artifacts, guarded.** A validator checks that every artifact control
  (tabs, toggles) references a function actually defined in a `<script>`; mismatches are
  flagged in the console so a dead tab bar can't ship silently. (Unit-tested.)
- **Faux-interactive artifacts.** The design-system prompt now requires that any
  interactive control (tabs, accordions, toggles) ships the JS that makes it work —
  no more tab bars wired to functions that were never written.
- **Junk note titles.** Saved chats no longer take their title from your prompt. The
  indexer now produces a short descriptive **title** (alongside tags + summary), and
  notes are filed as **`YYYY-MM-DD — Title.md`** for a clean, dated structure.
- **Internal prompt templates are hidden.** Running a slash command or the plan/artifact
  generators no longer dumps the verbose instruction into the chat as your message — it
  shows a friendly label (e.g. "Generate an implementation plan") while the model still
  receives the full instruction.
- **Build now confirms before dispatch.** "Hand off to Claude Code" defines a plan note
  (a task checklist or numbered milestones), guides you when the note isn't one, and asks
  for confirmation — showing the detected task count and what it will create — before it
  writes notes and copies a command.
- **Build icon on plan notes.** Any note with `type: plan` frontmatter gets a **Build**
  icon in its header that builds *that* note. A new command, "Mark current note as a plan,"
  stamps `type: plan` so any checklist note becomes build-ready.
- **Plans are build-ready end to end.** "Generate implementation plan" now emits the visual
  artifact **plus** a parseable `## Build tasks` checklist, and saving it writes a
  `type: plan` note (to a configurable Plans folder) — so the plan renders beautifully *and*
  the Build icon can parse its tasks. One loop: plan → save → Build.

### Added
- **Vault Workflows in the chat.** The Claude Code plugin's portfolio is now native to the
  Companion: a **Workflows** picker (command, `/workflows`, ribbon, and a chat button) runs
  manifest personas (Product roadmap, Vault audit, Content plan, Research agenda, Risk
  register, Feature backlog, Infra design), Daily rollup, Map of Content, Source digest,
  Task harvest, and Vault synthesis — each grounded across your vault, producing an artifact
  or linked Markdown. No CLI required.
- **Build button on plan replies.** A plan generated in chat now shows a **Build** button
  right there — it saves the `type: plan` note and dispatches in one click.
- **Capture the in-app conversation into memory.** Ticking the **ingest** checkbox by
  Save now files *that conversation* into session memory (sanitized, shown in the Memory
  sidebar), instead of an unrelated CLI session — the coherent behavior.
- A **ribbon icon** and a **chat action-bar button** to capture a Claude Code session
  (previously command-palette only).
- A clear notice when no Claude Code sessions exist for the vault, instead of a silent
  empty picker.

### Security
- The **MCP bearer token** is now masked in settings (was rendered in plaintext).
- The MCP token can be **sourced from `$OBSIDIAN_COMPANION_MCP_TOKEN`**, keeping it out of
  this vault's (possibly synced) `data.json`. Connection snippets are share-safe by
  default (env reference or masked, with a Reveal toggle); Copy always copies the real,
  working command.
- The Cloud / Replies / MCP settings sections are collapsed into accordions to reduce
  accidental exposure and clutter.
- **Closed a CodeQL "incomplete multi-character sanitization" alert.** Tag-stripping in
  the artifact title/plan parsers now iterates until stable (an `stripTags` helper),
  so a crafted `<<b>script>`-style string can't reconstruct a tag in a single pass.

### Changed
- **Session-memory frontmatter** uses a snake_case schema (`session_id`, `source`,
  `git_branch`, `started_at`, `input_tokens`, …). Notes captured by 0.6.0 are migrated
  in place on re-capture (the writer still matches the legacy `claude-session` key).

## [0.6.0] — 2026-06-03

### Added
- **Episodic session memory.** Capture Claude Code CLI sessions for this vault into
  sanitized digest notes — clean prose, the tools Claude ran, files touched, and
  provenance (model, branch, token usage, timespan).
  - Pure transcript parser (`memory/transcript.ts`) and first-class secret
    redaction (`memory/sanitize.ts`) — no text reaches the vault unscrubbed.
  - "Capture session memory…" command + a picker over this vault's sessions.
  - An "ingest" checkbox next to Save that also captures the latest session.
  - A "Session memory" sidebar listing captured notes, with open / re-ingest.
  - Idempotent: re-ingesting a session updates its existing note.
  - Settings: enable toggle, memory folder, ingest-on-save default.

### Changed
- Author/owner display name set to **Sasan Sotoodehfar** (was "CAVI", not a legal entity).

## [0.5.1] — 2026-06-03

### Fixed
- Hardening pass; adaptive Save button; release-workflow fix.

## [0.5.0] — 2026-06-01

### Added
- Initial public release: in-vault Claude chat, interactive `claude-html` artifacts,
  model/thinking controls, conversation history, slash commands, offline fallback,
  loopback MCP bridge, and cloud Claude Code sessions.
