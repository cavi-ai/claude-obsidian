# Changelog

All notable changes to **Companion for Claude** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.24.6] — 2026-08-11

### Added
- **Compact composer context manager.** Chat now keeps automatic context and
  added notes, folders, projects, PDFs, images, and webpages inside one
  accessible control that opens as a desktop popover or mobile sheet. Pending
  and failed webpage captures remain visible with retry and removal actions.

### Fixed
- **Desktop integrations open in Obsidian.** Node built-ins now load through
  Electron's runtime boundary instead of Chromium's module loader.
- **Chat confirmations clear promptly.** Ephemeral action feedback now dismisses
  after 1.8 seconds instead of obstructing the workspace.

## [0.24.5] — 2026-08-11

### Added
- **CLI-first desktop integrations.** Companion can inspect and set up Claude
  Code through the official Obsidian CLI and `obsidian-agent`, then open a
  terminal at the active vault without requiring MCP. Claude Desktop keeps an
  explicit, confirmed loopback MCP setup with backup and atomic config updates.

### Fixed
- **Anthropic agent chat accepts research tools again.** Outbound Anthropic
  tool schemas remove top-level JSON Schema unions that the Messages API
  rejects while preserving nested constraints and the original internal tool
  definitions.

## [0.24.4] — 2026-08-10

### Fixed
- **Published docs keep their routes.** The docs artifact reuses the page names
  the site already serves for this product, so existing documentation links
  stay valid across releases.

## [0.24.3] — 2026-08-09

### Fixed
- **Published docs render on the site.** The docs artifact now uses the same
  page layout as the other CAVI products, and heading anchors in the shipped
  pages resolve, so the site build no longer rejects the release.

## [0.24.2] — 2026-08-09

### Fixed
- **OAuth chat sessions keep working.** Chat requests preserve the OAuth
  credential instead of dropping it mid-session.
- **Anthropic model compatibility.** Model ids, capability detection, and token
  accounting follow the current Anthropic model surface.
- **Published docs reach the site.** The release artifact now carries the docs
  manifest and navigation the site expects, so a release refreshes the
  published documentation.

## [0.24.1] — 2026-08-09

### Fixed
- **Released docs reach the site again.** The release artifact now carries the
  guides beside the release facts, and its identity fields match what the docs
  site expects, so a release updates the published documentation instead of
  being rejected on ingest.

## [0.24.0] — 2026-08-09

### Added
- **Quick controls on every Companion surface.** Each view — chat, Source
  Inbox, Related notes, Memory, Research Desk, Workbench — opens a focused
  options menu for that page, with the settings entry last. The menu reads a
  fresh settings snapshot each time and writes toggles through the same save
  path as the settings tab, so the two can't drift.
- **Activity indicator.** Long-running work reports itself: determinate jobs
  show a real percentage, indeterminate downloads stay indeterminate rather
  than inventing progress, and a touch-safe drawer lists per-file detail. Work
  needing attention sorts above newer running work and carries its recovery and
  dismiss actions inline; a failed recovery stays actionable instead of being
  swallowed.
- **Web Clipper setup and verification.** A setup modal walks through installing
  the generated templates, and verification compares clipped notes against the
  expected type, schema version, and destination, so a stale or misconfigured
  clipper is visible instead of silently producing untyped clips.
- **Semantic index recovery.** Embedding failures are classified — missing
  built-in model, unreachable Ollama or custom endpoint, missing model, mobile
  loopback endpoint, index storage failure — and each carries the action that
  fixes it.

### Changed
- **The committed bundle is verified reproducible.** CI and the local gate lanes
  rebuild and fail if `main.js` or `manifest.json` differ from the committed
  copies.

## [0.23.0] — 2026-08-08

### Added
- **Batch-review Inbox links.** *Review all links* now opens one Git-style
  review modal with a collapsed accordion per note. Select whole notes or
  individual hunks, then apply the accepted set together; changed or unreadable
  notes are reported independently without blocking the rest of the batch.

### Changed
- **Enrichment is non-destructive by construction.** Source enrichment keeps
  the Markdown body byte-for-byte, preserves existing metadata, unions tags,
  and validates the final title, summary, schema fields, and source provenance
  inside the atomic write before anything reaches the vault.
- **Inbox batches stay responsive.** Enrich-all coalesces refreshes instead of
  rescanning the complete Inbox after every note, and stale scans stop as soon
  as a newer render supersedes them.

### Fixed
- **Mobile Inbox utility routing.** The Inbox shows the backend it will really
  use. A loopback desktop model is never called from mobile; Companion either
  uses a configured LAN/remote endpoint or asks before sending source content
  to Claude for the current session. Denial, missing credentials, endpoint
  changes, and credential rotation fail closed with actionable inline errors.
- **Inbox lifecycle cleanup.** Closing or refreshing the Inbox during an
  operation no longer leaves disabled controls, detached scans, unhandled
  rejections, or late writes after the plugin unloads.
- **Provider errors keep their cause.** Wrapped failures carry the underlying
  error, so the hint you see names the real problem instead of a generic one.

## [0.22.5] — 2026-08-07

### Fixed
- **Mobile settings and options respond again.** The overflow menu and the model
  picker used coordinate-based mouse menus, which touch WebViews don't deliver
  reliably, so tapping them did nothing. Both now open a touch-safe sheet with
  44px rows, Companion settings opens from it, and the fallback goes through
  Obsidian's own settings command when the mobile controller isn't available.
- **Accordion headers work as buttons.** Settings accordion summaries are real
  buttons styled flat, so the open state no longer depends on native
  `details` toggling alone.

## [0.22.4] — 2026-08-05

### Fixed
- **Research headers stop overflowing.** Between the 600px stacking breakpoint
  and the row's intrinsic width, the desk and workbench header rows now wrap
  instead of pushing the project switcher and action buttons past the edge of a
  narrow side pane.

### Changed
- **Settings loading is covered.** The `data.json` merge moved out of `main.ts`
  into `resolveSettings()`, with tests for the legacy flat shape, the
  pre-`utilityBackend` and pre-engine migrations, and a full settings-tab render
  against a migrated legacy config.
- **End-to-end settings coverage.** A Playwright suite drives real Obsidian
  through the settings tab, and the harness can seed a real `data.json` instead
  of only the pristine one a fresh install writes.
- **Release tooling is tracked at source.** The CAVI release-facts generator and
  its contract test live in this repository and are mirrored into the release
  repo, so a release can no longer delete them.

## [0.22.3] — 2026-08-04

### Changed
- **Settings are grouped.** The fourteen accordions now sit under three
  headings — Agent, Vault intelligence, and Files, memory, and privacy —
  ordered by the journey through them.
- **Settings stay put.** Changing auth mode, web search, the MCP bridge or
  client, cloud dispatch, or Ollama detection re-renders only that accordion
  instead of the whole tab, so the other sections no longer collapse and the
  scroll position holds.

### Fixed
- **Semantic index survives a lost WebGPU device.** A GPU session that dies
  mid-inference now rebuilds the pipeline on wasm and retries the batch, and
  later loads skip the WebGPU probe instead of failing the same way again.
- **Concurrent embeds share one rebuild.** Requests arriving during a rebuild
  await it rather than racing a second pipeline or reporting the model as not
  loaded.

## [0.22.2] — 2026-08-03

### Fixed
- **Mobile model options restored.** The compact mobile header hid the desktop
  model controls but only recreated Claude choices, making configured Ollama
  and OpenAI-compatible models disappear. The mobile picker now keeps those
  configured backends reachable and marks the actual active backend.

## [0.22.1] — 2026-08-01

### Fixed
- **Mobile chat redesigned.** The phone UI was a shrunken desktop panel; it's
  now a messenger-grade surface. The composer is a single bar — [+] · an
  auto-growing field (1 to ~6 rows, no forced minimum height) · [↑] — ~52px
  tall when empty instead of a 92px-plus box. Attached-context pills moved out
  of the input box into a single horizontally-scrolling tape above it that
  never wraps and disappears when empty. Per-message role labels are gone
  (bubble alignment shows the speaker), your messages are right-aligned clay
  bubbles, action chips shrink and dim until tapped, and the header's
  write-grant pill can no longer crowd the model name.

## [0.22.0] — 2026-08-01

### Added
- **Enrich with Claude (right-click).** The file-explorer menu on a note (and
  a command for the active note) runs a full enrichment pass behind one review
  modal: a meaningful collision-safe rename from a model-generated title, tag
  suggestions that reuse existing vault tags plus a one-line summary into
  frontmatter, wikilinks for unlinked mentions, and a copyedit lint pass. A
  step picker toggles each part (all on by default), and the review modal shows
  the rename, the frontmatter changes, and every content diff hunk with its own
  checkbox — nothing is written until the accepted subset is applied.
- **Enrich a whole folder.** The folder right-click runs the same pass across
  every note in the folder (recursively): one step picker, then a review modal
  per note.
- **Organize notes into subfolders.** The folder right-click infers a
  subfolder per note from titles and summaries in one batch call (preferring
  existing subfolders), then shows the proposed old path → new path layout in
  the review modal and executes only the accepted moves.

## [0.21.0] — 2026-07-29

### Added
- **The agent runs on local models.** Vault tools now go over Ollama's native
  function calling, so agent mode works fully local instead of degrading to
  plain chat. Models without tool support fall back to chat with an explanatory
  notice.
- **Per-model capability detection.** Ollama models are inspected through
  `/api/show` and cached: agent mode and the chat toggles gate on the selected
  model's tools/thinking metadata, settings list every model with capability
  badges, and the composer shows a reasoning indicator when the backend thinks
  before answering.
- **Web search and web fetch tools.** `web_search` (DuckDuckGo by default,
  Brave Search with a key) and `web_fetch` (one public page as bounded readable
  markdown) are available to the chat agent and the MCP bridge. Both are off by
  default and configured under *Agent*.
- **MCP client — the agent uses external MCP servers.** Add servers under
  *External tools* over streamable HTTP or, on desktop, stdio. Their tools are
  namespaced `mcp__<server>__<tool>`, confirmed like a vault write, excluded in
  Plan Mode, and tested from settings.
- **PDF RAG.** Vault PDFs join the semantic index, chunked so no chunk crosses a
  page boundary and every chunk carries its *Page N* locator, so snippets and
  evidence keep page citations. Toggle *Index PDF text* (on by default);
  unreadable or encrypted PDFs skip without aborting a build.
- **Organize clippings.** A command that enriches any unenriched inbox clip,
  infers a domain folder per clip in one batch call (preferring existing
  folders), and files accepted moves into `<Organized folder>/<domain>/` after a
  review modal shows old path → new path.

### Fixed
- **The artifact-everything loop.** Past `claude-html` blocks in the request
  acted as few-shot examples, so one artifact made every later turn an artifact;
  older assistant turns now send an elided placeholder while the latest stays
  intact for edit follow-ups. Settings saved before 0.12.1 that still carry the
  legacy "prefer producing an artifact" system prompt are migrated to the
  current default; customized prompts are untouched.

## [0.20.0] — 2026-07-28

### Added
- **Guided cloud setup.** *Agent in the cloud* settings show a live ✓/✗
  checklist for dispatch and replies that updates as you type, and replies gains
  a **Test connection** button that reads the configured folder over the
  Contents API and reports inline.

### Fixed
- **Inbox enrichment on thinking models.** Utility extraction now requests JSON
  against a field-derived schema, disables thinking on Ollama, and raises the
  token budget, so models like qwen3 no longer spend the budget on hidden
  reasoning and return an empty reply.
- **Agent acts instead of planning.** With a tool available, the agent
  instruction requires performing the action and forbids substituting a plan
  artifact or task checklist for it.
- **Cloud pull failures** append the same offline/error hint dispatch does.

## [0.19.0] — 2026-07-28

### Added
- **Zotero imports resolve themselves.** `research_source_import` with
  `source_kind: zotero` and a `zotero_key` fills the missing title, authors,
  publication date, publication, DOI, url, and abstract from the configured
  Zotero library. A failed lookup still imports the key and reports
  `zotero_resolved: false`.
- **Zotero settings.** User id and optional API key under *Scholarly
  discovery*. Requests fire only on an explicit import.

## [0.18.0] — 2026-07-28

### Added
- **Graph neighborhood in Related notes.** The panel gains a Connections
  section: backlinks, outgoing links, and typed ontology relations from
  frontmatter, grouped by relation key. Unresolved targets render muted.

### Fixed
- **First streamed paint.** The first flush of a turn renders immediately
  instead of being throttled away, so a turn no longer stays blank.

## [0.17.0] — 2026-07-28

### Changed
- **Streaming pipeline consolidation.** Chat and agent turns now share one
  `TurnRenderer` (throttled markdown, thinking panel, usage, artifact chip)
  instead of two hand-mirrored copies.
- **One next-step decision for research.** The desk and workbench next-action
  lists derive from a single continuation-step decision, so they can't drift.
- **One JSON repair loop.** Draft and revision coordinators share
  `completeJsonWithRepair`. No user-facing behavior change in this release.

## [0.16.0] — 2026-07-28

### Added
- **Wire into the graph.** The source inbox gains a second section: enriched
  notes that still mention other notes without linking them, each with a
  one-tap *Review* into the diff link flow. Ingestion now ends wired in, not
  filed away.
- **Inbox ribbon badge.** A new inbox ribbon icon shows the pending-clip count
  and opens the source inbox.

### Changed
- **Related notes on mobile.** The chat ⋯ menu now opens the related-notes
  panel (link suggestions + semantic neighbors).

## [0.15.1] — 2026-07-28

### Added
- **Fallback to any local backend.** The Auto chat backend now falls back to a
  configured OpenAI-compatible endpoint (LM Studio, mlx-lm, …) when Ollama
  isn't reachable — not just to Ollama.
- **Stale clipper-template detection.** Exported Web Clipper templates carry a
  schema fingerprint; when schemas, the inbox folder, or base tags change,
  Companion flags the templates as out of date (notice on load, status under
  *Source capture*) so you can re-export.
- **Rebuild offer on embedding switch.** Changing the built-in embedding model
  or engine now offers to rebuild the semantic index instead of silently
  invalidating it.

## [0.15.0] — 2026-07-28

### Added
- **Web Clipper schema sync.** The *Export Web Clipper templates* command (and
  a button under *Source capture*) writes clipper templates generated from the
  source schemas into `Claude/Clipper templates/`. Imported into the official
  Web Clipper, clips land in the inbox already typed — `type`, `source`, and
  every page-known field stamped — instead of clip-then-convert.
- **Source inbox view.** A touch-first triage panel listing every inbox file
  that isn't typed yet, with one-tap enrich and *Enrich all*. Open it with
  *Open source inbox (clip triage)* or from the mobile chat menu.
- **OpenAI-compatible local endpoint.** A third provider targets any `/v1`
  server — LM Studio, mlx-lm, vLLM, Jan — as the chat backend, the utility
  backend, or the embedding engine, including Apple-silicon-optimized servers
  like `mlx_lm.server`.
- **Built-in embedding model picker.** Three on-device embedding models
  (xs/s/m); switching rebuilds the index automatically.
- **Utility/chat model split.** Utility work (tagging, summaries, ingestion)
  can run on its own smaller Ollama model while local chat keeps a bigger one.
- **Mobile chat toggles.** The mobile ⋯ menu now carries Act on vault, Plan
  mode, memory ingest, and Source inbox — previously desktop-only.

### Changed
- **Enrichment respects clipper-stamped fields.** Values the clipper already
  wrote (title, author, site, published…) are trusted as-is; the utility model
  is only asked for what the page couldn't say and never overwrites them.
- **Build handoff works without MCP.** The Claude Code build command drives the
  tracker through the official `obsidian` CLI when the bridge is off or writes
  are disallowed.
- **Mobile UX.** Code-block copy is always visible on touch; message actions,
  send, and context buttons are 44px touch targets; the browser-only
  *Open artifacts in* setting no longer shows on mobile; token fields size
  fluidly.

## [0.14.1] — 2026-07-27

### Changed
- **Vault workflow renamed.** The *Frontmatter audit* workflow's id is now
  `frontmatter-normalizer`, matching its skill and command in the
  obsidian-agent plugin. Its slash command changes with it:
  `/frontmatter-audit` becomes `/frontmatter-normalizer`. The workflow's display
  name and behaviour are unchanged.

### Added
- **Catalog drift test.** `registryDrift.test.ts` holds the workflow catalog to
  the capability registry in the universal obsidian-agent plugin: every
  Companion workflow must resolve to a portable registry entry with matching
  name, and every portable entry must have a workflow. The registry is read at
  test time only and the suite skips when the submodule is absent, so
  obsidian-plugin still builds and tests standalone.

## [0.14.0] — 2026-07-27

### Added
- **Plan Mode.** A composer toggle next to *Act on vault*: Claude explores the
  vault with read-only tools and ends the turn with a concrete plan — what it
  would create or change, where, and why — instead of attempting writes. Write
  tools and the edit-proposal tool are both withheld for the turn regardless of
  the allow-writes setting. The mode is per conversation and never persisted.
- **Your own slash commands (prompt templates).** Every markdown note in the
  templates folder becomes a `/command` in chat: frontmatter carries the name,
  description, and optional per-turn `model` and `context` overrides; the body
  is the prompt. `{selection}` and `{active_note}` are substituted from the live
  editor at run time and any other `{placeholder}` is left literal. The
  *Create prompt template* command scaffolds a note with the schema, and the
  chat palette refreshes as notes in the folder are added, edited, or renamed.
- **Attach page content from a URL.** Typing or pasting a link into the composer
  offers to attach the page; accepting clips it to clean markdown through
  Defuddle and adds it to the request context as an attached-page pill with
  pending and failure states. Nothing is fetched until the Attach click.
- **Templates folder setting** (default `Claude/Templates`), searchable from
  Obsidian's settings search.

## [0.13.0] — 2026-07-26

### Added
- **Capture-first Add source.** The Add source button no longer opens a form.
  The popup takes one gesture: **drop a URL or file**, **paste a link** (the
  page is clipped to clean markdown via Defuddle and **tagged automatically**
  from content, reusing existing vault tags), **choose a vault note** from a
  fuzzy picker, or **upload a file** (PDFs and binaries land in the project's
  `Sources/assets/` folder and import as asset-backed sources). Duplicates are
  detected against the project's canonical source ids.
- **Inline rewrite in the editor (Composer-style).** Select text and run
  *Rewrite selection with Claude…* from the command palette or the right-click
  menu: pick a preset (improve, fix grammar, shorten, expand, simplify, formal,
  casual) or type a custom instruction, then review the result as the same
  per-hunk red/green diff used everywhere else before it is applied. When the
  selection isn't unique in the note, the apply anchors at the editor offsets.
- **Triage clippings (one click, Research Desk).** Groups the clippings inbox
  into research themes with a single model call, tags each note with its
  `research/<theme>` tag (unioned, never clobbered), and writes a
  `Clippings/Triage.md` board with per-theme summaries, wikilinks, source
  URLs, and a potential project per theme. Un-typed clips are enriched through
  the existing typed-source pipeline first. Also available as the *Triage
  clippings folder into research themes* command.
- **New project from active note (Research Desk / command palette).** Drafts a
  sharp research question grounded in the open note, confirms through the
  create-project modal (title and folder pre-filled), imports the note as the
  project's first source (clip URL preserved), and lands on the Discover tab
  with a pre-derived query so the preliminary OpenAlex/Crossref/arXiv search is
  one click away.
- **Sharpen with Claude (claim creation).** Rewrites a draft claim proposition
  as one precise, defensible sentence, grounded in the evidence items checked
  in the modal — the model is instructed to introduce no facts beyond them.
  Preview with Use rewrite / Dismiss; the draft is never silently overwritten.
- **Draft with Claude (evidence review).** Generates a one-to-three-sentence
  interpretation of the excerpt, grounded in source + locator, into an
  editable field that saves with the review decision.
- **`ResearchRepository.updateEvidenceInterpretation()`** — replaces or
  appends an evidence note's `Interpretation:` block in place; everything else
  in the note stays byte-identical.

### Changed
- **Research onboarding copy.** Every workbench tab now states what the step
  is and why it matters (with BUILD step numbers), empty states include a
  concrete example record, and the Desk empty state explains the
  sources → evidence → claims → outline → draft trail in plain language.
- **Create project modal is dedicated.** It explains the trail, auto-suggests
  the folder from the title, offers *Draft with Claude* for the research
  question, takes an optional audience, and lands on the Sources tab after
  creation.
- **Version 0.13.0.**

### Fixed
- **New project from active note works from the Desk.** The Desk leaf steals
  the active view, so the flow saw "no note" and the button could hide; the
  plugin now tracks the most recently focused markdown file and both the Desk
  button and the command fall back to it.
- **Dropped .md sources strip frontmatter** from their captured content,
  matching the note-picker import path.
- **Mobile source capture.** The desktop-only drag-and-drop zone is hidden on
  mobile (paste/upload/pick remain); the rewrite modal shows its ⌘/Ctrl+Enter
  shortcut hint.
- **CRLF frontmatter is parsed.** Every frontmatter reader (research records,
  vault tools, unlinked mentions, memory consolidation, semantic chunking)
  accepts `\r\n` delimiters, so notes written on Windows are no longer treated
  as frontmatter-less.
- **The capture modal recovers from a failed note import** instead of staying
  stuck on the busy state; a cancelled note picker clears the status line, and
  a failed multi-file read reports instead of throwing.

## [0.12.2] — 2026-07-24

### Fixed
- **Settings appear in Obsidian's settings search (1.13+).** The settings tab
  now implements `getSettingDefinitions()` with search-metadata-only entries
  (name/description/aliases, no controls) covering every section.
- **Mobile artifact height.** Inline artifacts were capped only by the desktop
  pixel setting (default 640px), so one artifact ate nearly the whole phone
  screen; on mobile the frame now caps at 52vh and the artifact-bar buttons
  are touch-sized.
- **Mobile usage gauge.** The context-window strip now has a faint full-width
  track — at low usage the lone fill segment read as a stray dash.
- **Community-store scan findings.** Restored a dropped `:focus-within`
  selector in styles.css (the "Unexpected }" risk), replaced the two
  `document.createElement` calls with Obsidian's detached `createDiv`, wrapped
  the MCP server's listen-error rejection in an `Error`, and switched a
  settings fragment to `activeDocument` (popout-window safe). Release workflow
  now attests build provenance for `main.js`, `manifest.json`, and
  `styles.css`.

### Changed
- **Unified agent narrative in settings.** Agent mode, the MCP bridge, and
  cloud sessions are now presented as three surfaces of one agent: a new
  *Agent (act on your vault)* group holds the in-chat tool settings, and the
  bridge/cloud sections are retitled to match.
- **Cloud session setup is guided.** A numbered checklist walks through
  routine creation → fire URL/token → replies; dispatch failures now include
  the provider-aware offline hint.
- **Semantic search now ships on by default.** A one-time first-run prompt
  offers the on-device embedding-model download; until it's downloaded every
  path stays keyword-only (no implicit network fetch). The *Search vault*
  context and related notes upgrade automatically once the model is in place.
- **Typed source capture and vault ontology now ship on by default.** Source
  capture asks for one-time consent before the first automatic enrichment
  (declining switches to manual-only via the *Enrich note as source* command).
  The ontology offers to create the default schemas on first run; until seeded
  it stays fully latent — `note_create` no longer advertises `type`/`properties`
  against an empty registry.
- **Enrichment preserves your tags.** Typed source capture unions its base tags
  with a clip's existing tags instead of replacing them.
- **Enrichment failures are actionable.** The failure notice now includes the
  provider-aware hint (offline, Ollama down, auth) instead of "see console".
- **Ontology schema errors surface.** Startup and seed loads report schema
  errors in a notice instead of only the console.

### Removed
- Dead typed-graph projection module from the ontology package (never wired).

## [0.12.1] — 2026-07-24

### Added
- **"Act on vault" is on by default.** Chat can create and edit notes, canvases,
  and bases — not just narrate the vault. Every write still asks for confirmation
  first. A composer toggle flips it per session, and it hides on local sessions.
- **Chat text size control.** A slider in the model-controls popover sets the
  chat font (default 14px), independent of Obsidian's editor font.
- **Implement button on plans.** A plan reply now offers *Implement*, which runs
  its build tasks in-app through agent mode to make the vault changes, alongside
  the existing *Build* (Claude Code) handoff.
- **Artifact templates + charts.** Beyond plans, the design system now covers
  audit/report, comparison, dashboard, diagram, and explainer layouts, with a
  no-library chart kit (CSS bars + inline SVG) for audits and dashboards.

### Changed
- **Answers default to Markdown.** Artifacts are produced only for deliverables
  that benefit from visual structure, using the template that fits the request,
  instead of forcing every reply into a plan-shaped HTML document.
- **Slash menu.** Full-description hover tooltips on every command; `/daily`
  renamed to `/dailynote` (with `daily` kept as an alias) so it no longer reads
  as the `/daily-rollup` activity review.

### Fixed
- **Streaming artifacts no longer dump raw HTML.** While a `claude-html` artifact
  (or any bare/`html`-fenced HTML document) streams, a compact "Building
  artifact…" chip shows in its place until the sandboxed iframe renders.
- **Accent color.** The streaming and agent tool-chip status dots use the Claude
  clay accent instead of Obsidian's blue.

## [0.12.0] — 2026-07-23

### Added
- **Credential-aware onboarding.** The empty state and an in-chat setup card
  adapt to which credentials are configured, and typed input is never discarded
  when the setup card appears.
- **Model presets.** Claude Sonnet 5 and Fable 5 are selectable; Sonnet 5 is the
  new default.
- **Command chips.** Slash-command and workflow invocations render as a compact
  chip instead of a bubble of raw prompt text.
- **Delete conversations from the history picker** with a two-tap confirm.
- **Visible, revocable session write-grant pill** in the chat header.
- **Memory view and consolidation on mobile** (session capture stays desktop).

### Changed
- **Settings redesign.** Connect-first layout, a privacy accordion, the chat
  backend promoted, and numeric-field validation.

### Fixed
- **Semantic search on desktop.** Force the web/WASM embeddings backend — the
  built-in engine was dead on desktop.
- **Stream errors keep and persist partial text** and add a Retry button.
- **Truncation notice** shows accurate copy and a retry-with-higher-limit action.
- **Attachments survive failed sends and Regenerate.**
- **Backend pill** updates live (~10s and on send) and skips no-op pill rebuilds;
  the embedding settings section re-renders in place with an Ollama model dropdown.
- **Mobile:** Enter inserts a newline, tune knobs move into the ⋯ modal, and
  unconfigured cloud actions are hidden.

## [0.11.2] — 2026-07-23

### Changed
- **Redesigned the mobile chat composer** for phones.

### Fixed
- **Provider-aware error hints:** no "ollama serve" suggestion for offline
  Claude, 529 and Chromium "Failed to fetch" recognized as network failures, and
  tighter rate-limit matching (`rate_limit` / `rate limit` / `too many requests`).

### Security
- Bumped transitive dependencies (sharp, adm-zip, fast-uri, js-yaml,
  brace-expansion) closing 8 high-severity advisories.

## [0.11.1] — 2026-07-21

### Changed
- **Mobile composer is now a single thumb row.** Send is a circular arrow-up
  icon button inside the input row (`[+] · input · ↑`), switching to a square
  stop icon while streaming. The context-window usage gauge collapses to a
  thin 2px strip along the top of the composer instead of occupying a second
  band, and the input pill keeps a 16px font to avoid iOS zoom-on-focus.

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
  auto-fixes, a typed graph projection, a seed command with 21 default types,
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
